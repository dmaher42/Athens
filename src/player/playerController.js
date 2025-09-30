import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';
import { movementConfig, FLIGHT as FLIGHT_DEFAULTS } from '../config/movement.ts';
import { sanitizeVec3, DEFAULT_PLAYER } from '../utils/sanitize.ts';

const moveDirection = new THREE.Vector3();

const targetVelocity = new THREE.Vector3();
const velocity = new THREE.Vector3();
const horizontalVector = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, 1);
const moveDelta = new THREE.Vector3();
const actualMove = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const desiredMove = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const verticalMoveDelta = new THREE.Vector3();

const TURN_ACCEL = 12;

function deriveScaleFactor(scaleConfig) {
  if (typeof scaleConfig === 'number' && Number.isFinite(scaleConfig) && scaleConfig > 0) {
    return scaleConfig;
  }
  if (scaleConfig && typeof scaleConfig === 'object') {
    const { y, x, z } = scaleConfig;
    if (Number.isFinite(y) && y > 0) {
      return y;
    }
    const candidates = [x, z].filter((value) => Number.isFinite(value) && value > 0);
    if (candidates.length) {
      return candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    }
  }
  return 1;
}

const characterConfig = movementConfig?.character ?? {};
const DEFAULT_CHARACTER_HEIGHT = 1.7;
const CHARACTER_SCALE = deriveScaleFactor(characterConfig?.scale);
const CHARACTER_HEIGHT = Number.isFinite(characterConfig?.height)
  ? Math.max(0.5, characterConfig.height)
  : Math.max(0.5, DEFAULT_CHARACTER_HEIGHT * CHARACTER_SCALE);
const DEFAULT_CAPSULE_HEIGHT = 1.6;
const DEFAULT_CAPSULE_RADIUS = 0.45;
const CAPSULE_HEIGHT_RATIO = DEFAULT_CAPSULE_HEIGHT / DEFAULT_CHARACTER_HEIGHT;
const CAPSULE_RADIUS_RATIO = DEFAULT_CAPSULE_RADIUS / DEFAULT_CHARACTER_HEIGHT;

const SAFE_POSITION = {
  x: Number.isFinite(movementConfig?.safePosition?.x) ? movementConfig.safePosition.x : DEFAULT_PLAYER.x,
  y: Number.isFinite(movementConfig?.safePosition?.y)
    ? movementConfig.safePosition.y
    : Math.max(DEFAULT_PLAYER.y, CHARACTER_HEIGHT * 0.55),
  z: Number.isFinite(movementConfig?.safePosition?.z) ? movementConfig.safePosition.z : DEFAULT_PLAYER.z
};
const ZERO_VECTOR = { x: 0, y: 0, z: 0 };

const flightOptions = movementConfig?.flight ?? {};
const FLIGHT_TOGGLE_KEY = typeof flightOptions.toggleKey === 'string' ? flightOptions.toggleKey : 'KeyF';
const defaultToggleKeys = (() => {
  const configured = Array.isArray(flightOptions.toggleKeys) && flightOptions.toggleKeys.length
    ? flightOptions.toggleKeys
    : [];
  const combined = configured.filter((value) => typeof value === 'string');
  if (typeof FLIGHT_TOGGLE_KEY === 'string') {
    combined.push(FLIGHT_TOGGLE_KEY);
  }
  combined.push('KeyX');
  return combined.filter((value, index, array) => array.indexOf(value) === index);
})();
const toggleKeySet = new Set(defaultToggleKeys.length ? defaultToggleKeys : [FLIGHT_TOGGLE_KEY]);
const FLIGHT_HORIZONTAL_SPEED = Number.isFinite(flightOptions.horizontalSpeed)
  ? flightOptions.horizontalSpeed
  : FLIGHT_DEFAULTS.horizontalSpeed;
const FLIGHT_VERTICAL_SPEED = (() => {
  const configured = Number.isFinite(flightOptions.verticalSpeed)
    ? flightOptions.verticalSpeed
    : Number.isFinite(flightOptions.verticalMaxSpeed)
    ? flightOptions.verticalMaxSpeed
    : FLIGHT_DEFAULTS.verticalSpeed;
  if (!Number.isFinite(configured)) {
    return FLIGHT_DEFAULTS.verticalSpeed;
  }
  return Math.max(0, configured);
})();
const FLIGHT_NUDGE_UP = Number.isFinite(flightOptions.nudgeUp) ? flightOptions.nudgeUp : 0.25;
const FLIGHT_EXIT_HOVER = Number.isFinite(flightOptions.exitHover) ? flightOptions.exitHover : 0.05;
const FLIGHT_GRACE_FRAMES = Number.isFinite(flightOptions.startGraceFrames)
  ? Math.max(0, flightOptions.startGraceFrames)
  : 3;

const defaultAscendKeys = Array.isArray(flightOptions.ascendKeys) && flightOptions.ascendKeys.length
  ? flightOptions.ascendKeys
  : ['Space', 'KeyE'];
const defaultDescendKeys = Array.isArray(flightOptions.descendKeys) && flightOptions.descendKeys.length
  ? flightOptions.descendKeys
  : ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyQ', 'KeyC'];
const ascendKeySet = new Set(defaultAscendKeys);
const descendKeySet = new Set(defaultDescendKeys);

function isAnyKeyDown(keyboard, keySet) {
  if (!keyboard || typeof keyboard.isDown !== 'function') {
    return false;
  }
  for (const code of keySet) {
    if (keyboard.isDown(code)) {
      return true;
    }
  }
  return false;
}

function sanitizePosition(vec3) {
  if (!vec3) {
    return;
  }
  sanitizeVec3(vec3, SAFE_POSITION);
}

function deriveYaw(object3d) {
  if (!object3d) return 0;
  horizontalVector.copy(FORWARD).applyQuaternion(object3d.quaternion);
  horizontalVector.y = 0;
  if (horizontalVector.lengthSq() < 1e-6) return 0;
  horizontalVector.normalize();
  return Math.atan2(horizontalVector.x, horizontalVector.z);
}

export function createPlayerController(
  object3d,
  keyboard,
  {
    walkSpeed = Number.isFinite(movementConfig?.walkSpeed) ? movementConfig.walkSpeed : 4.0,
    runMultiplier = Number.isFinite(movementConfig?.runMultiplier) ? movementConfig.runMultiplier : 1.7,
    acceleration = Number.isFinite(movementConfig?.acceleration) ? movementConfig.acceleration : 10,
    turnLerp = 0.18, // kept for API compatibility
    colliders: initialColliders = [],
    groundSnapSkipRef = null
  } = {}
) {
  let controlledObject = object3d || null;
  let currentKeyboard = keyboard || null;
  let groundMeshes = [];
  let colliderAabbs = Array.isArray(initialColliders) ? initialColliders : [];

  const capsuleRadius = Math.max(0.2, CHARACTER_HEIGHT * CAPSULE_RADIUS_RATIO);
  const capsuleHeight = Math.max(capsuleRadius * 2, CHARACTER_HEIGHT * CAPSULE_HEIGHT_RATIO);
  const capsule = new Capsule(capsuleRadius, capsuleHeight);

  let groundSnapSkip = typeof groundSnapSkipRef === 'object' ? groundSnapSkipRef : null;

  const state = {
    velocity: new THREE.Vector3(),
    anim: null
  };

  const physicsState = {
    vy: 0,
    lastGoodY: Number.isFinite(controlledObject?.position?.y)
      ? controlledObject.position.y
      : SAFE_POSITION.y
  };

  let yaw = deriveYaw(controlledObject);
  let runningState = false;
  let isFlying = false;
  let prevToggleDown = false;
  let flyGraceFrames = 0;
  const flightColliderCache = [];

  function getFlightColliders() {
    flightColliderCache.length = 0;
    if (!Array.isArray(colliderAabbs) || colliderAabbs.length === 0) {
      return flightColliderCache;
    }
    for (let i = 0; i < colliderAabbs.length; i += 1) {
      const entry = colliderAabbs[i];
      if (!entry || !entry.mesh || !entry.box) continue;
      if (entry.mesh.userData?.isGround === true) continue;
      flightColliderCache.push(entry);
    }
    return flightColliderCache;
  }

  function alignCapsuleToObject() {
    if (!controlledObject || !controlledObject.position) {
      return;
    }
    sanitizePosition(controlledObject.position);
    capsule.setPosition(
      controlledObject.position.x,
      controlledObject.position.y,
      controlledObject.position.z
    );
  }

  function enterFlight() {
    if (isFlying) {
      return;
    }
    isFlying = true;
    physicsState.vy = 0;
    flyGraceFrames = FLIGHT_GRACE_FRAMES;
    velocity.y = 0;
    if (controlledObject?.position) {
      sanitizePosition(controlledObject.position);
      const baseY = Number.isFinite(controlledObject.position.y)
        ? controlledObject.position.y
        : SAFE_POSITION.y;
      controlledObject.position.y = baseY + FLIGHT_NUDGE_UP;
      sanitizePosition(controlledObject.position);
    }
    alignCapsuleToObject();
  }

  function exitFlight() {
    if (!isFlying) {
      return;
    }
    isFlying = false;
    flyGraceFrames = 0;
    physicsState.vy = 0;
    velocity.y = 0;
    if (controlledObject?.position) {
      sanitizePosition(controlledObject.position);
      try {
        if (groundMeshes && groundMeshes.length) {
          snapToGround(controlledObject, groundMeshes, physicsState, 0, {
            hover: Math.max(0.02, FLIGHT_EXIT_HOVER)
          });
        }
      } catch {
        // ignore snap errors so controller remains responsive
      }
      sanitizePosition(controlledObject.position);
    }
    alignCapsuleToObject();
  }

  const debugControlsEnabled = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).get('debugControls') === '1';
    } catch {
      return false;
    }
  })();
  let debugLogTime = 0;

  alignCapsuleToObject();

  const setGroundMeshes = (meshes) => {
    groundMeshes = Array.isArray(meshes) ? meshes : [];
  };

  const setColliders = (nextColliders) => {
    colliderAabbs = Array.isArray(nextColliders) ? nextColliders : [];
  };

  const setObject = (nextObject) => {
    if (!nextObject) return;
    controlledObject = nextObject;
    physicsState.vy = 0;
    sanitizePosition(controlledObject.position);
    physicsState.lastGoodY = controlledObject.position?.y ?? SAFE_POSITION.y;
    yaw = deriveYaw(controlledObject);
    alignCapsuleToObject();
  };

  const setKeyboard = (nextKeyboard) => {
    currentKeyboard = nextKeyboard || currentKeyboard;
  };

  const update = (deltaSeconds, camera) => {
    if (!controlledObject || !currentKeyboard || !camera) return;

    const position = controlledObject.position;
    if (!position) {
      return;
    }
    sanitizePosition(position);

    const toggleDown = isAnyKeyDown(currentKeyboard, toggleKeySet);
    if (toggleDown && !prevToggleDown) {
      if (isFlying) {
        exitFlight();
      } else {
        enterFlight();
      }
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(`[playerController] Fly ${isFlying ? 'ON' : 'OFF'}`);
      }
    }
    prevToggleDown = toggleDown;

    const dtRaw = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : NaN;
    const dt = Number.isFinite(dtRaw) ? Math.min(dtRaw, 0.25) : 0;
    const dtSafe = Number.isFinite(dtRaw) ? dt : 1 / 60;

    const axisXRaw = currentKeyboard.axis?.x;
    const axisZRaw = currentKeyboard.axis?.z;
    const axisX = Number.isFinite(axisXRaw) ? axisXRaw : 0;
    const axisZ = Number.isFinite(axisZRaw) ? axisZRaw : 0;
    const hasMoveInput = Math.abs(axisX) > 1e-3 || Math.abs(axisZ) > 1e-3;

    // Speed target
    const shiftDown = Boolean(currentKeyboard.axis?.running);
    const baseSpeed = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const runMultiplierSafe = Number.isFinite(runMultiplier) ? Math.max(runMultiplier, 1) : 1;
    const groundSpeed = baseSpeed * (shiftDown && !isFlying ? runMultiplierSafe : 1);
    const flightSpeed = Number.isFinite(FLIGHT_HORIZONTAL_SPEED)
      ? Math.max(0, FLIGHT_HORIZONTAL_SPEED)
      : baseSpeed * runMultiplierSafe;
    const speed = isFlying ? flightSpeed : groundSpeed;
    const targetSpeed = hasMoveInput ? speed : 0;
    runningState = hasMoveInput && !isFlying && shiftDown && speed > baseSpeed;

    targetVelocity.set(0, 0, 0);
    let desiredYaw = yaw;

    const cameraRigState = camera && typeof camera === 'object' ? camera.__rigState : null;
    const rigYawRaw = cameraRigState && Number.isFinite(cameraRigState.yaw) ? cameraRigState.yaw : NaN;
    const rigYaw = Number.isFinite(rigYawRaw)
      ? THREE.MathUtils.euclideanModulo(rigYawRaw + Math.PI, Math.PI * 2) - Math.PI
      : (() => {
          if (typeof camera.getWorldDirection === 'function') {
            camera.getWorldDirection(viewDirection);
            const yawFromCamera = Math.atan2(viewDirection.x, viewDirection.z);
            return Number.isFinite(yawFromCamera) ? yawFromCamera : 0;
          }
          return 0;
        })();

    if (cameraRigState && Number.isFinite(rigYaw)) {
      cameraRigState.yaw = rigYaw;
    }

    moveDirection.set(Math.sin(rigYaw), 0, Math.cos(rigYaw));
    if (moveDirection.lengthSq() < 1e-6) {
      moveDirection.set(0, 0, 1);
    } else {
      moveDirection.normalize();
    }

    rightVector.crossVectors(UP, moveDirection);
    if (rightVector.lengthSq() < 1e-6) {
      rightVector.set(1, 0, 0);
    } else {
      rightVector.normalize();
    }

    const forwardInput = THREE.MathUtils.clamp(-axisZ, -1, 1);
    const strafeInput = THREE.MathUtils.clamp(axisX, -1, 1);

    if (hasMoveInput) {
      desiredMove.set(0, 0, 0);
      desiredMove
        .addScaledVector(moveDirection, forwardInput)
        .addScaledVector(rightVector, strafeInput);

      const desiredLengthSq = desiredMove.lengthSq();
      if (desiredLengthSq > 1e-6) {
        desiredMove.normalize().multiplyScalar(targetSpeed);
        targetVelocity.copy(desiredMove);
        desiredYaw = Math.atan2(desiredMove.x, desiredMove.z);
      }
    }

    if (Number.isFinite(desiredYaw)) {
      const yawDelta = THREE.MathUtils.euclideanModulo(desiredYaw - yaw + Math.PI, Math.PI * 2) - Math.PI;
      const yawLerp = 1 - Math.exp(-TURN_ACCEL * dtSafe);
      yaw += yawDelta * yawLerp;
    }

    if (!Number.isFinite(yaw)) {
      yaw = 0;
    } else {
      yaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI;
    }

    if (isFlying) {
      physicsState.vy = 0;
    }
    targetVelocity.y = 0;

    // Accel/lerp velocity
    const accel = Number.isFinite(acceleration) ? Math.max(acceleration, 0) : 10;
    const lerpAlpha = accel > 0 && dt > 0 ? 1 - Math.exp(-accel * dt) : 1;
    velocity.lerp(targetVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));
    sanitizeVec3(velocity, ZERO_VECTOR);

    if (isFlying) {
      const ascendHeld = isAnyKeyDown(currentKeyboard, ascendKeySet);
      const descendHeld = isAnyKeyDown(currentKeyboard, descendKeySet);
      const verticalInput = (ascendHeld ? 1 : 0) - (descendHeld ? 1 : 0);
      const verticalSpeed = Number.isFinite(FLIGHT_VERTICAL_SPEED)
        ? Math.max(0, FLIGHT_VERTICAL_SPEED)
        : FLIGHT_DEFAULTS.verticalSpeed;
      if (verticalInput !== 0 && verticalSpeed > 0) {
        velocity.y = verticalInput * verticalSpeed;
      } else {
        velocity.y = 0;
      }
      if (!Number.isFinite(velocity.y)) {
        velocity.y = 0;
      }
      sanitizeVec3(velocity, ZERO_VECTOR);
    } else {
      velocity.y = 0;
    }
    sanitizeVec3(velocity, ZERO_VECTOR);
    state.velocity.copy(velocity);

    // ANIM_START
    if (state.anim) {
      const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.z ** 2);
      if (speed < 0.1) state.anim.set('idle');
      else if (speed < 2.5) state.anim.set('walk');
      else state.anim.set('run');
      state.anim.update(dt);
    }
    // ANIM_END

    // Integrate motion with collisions
    sanitizePosition(position);
    capsule.setPosition(position.x, position.y, position.z);

    actualMove.set(0, 0, 0);
    if (dt > 0) {
      moveDelta.copy(velocity).multiplyScalar(dt);
      let verticalDelta = 0;
      if (!isFlying) {
        moveDelta.y = 0;
      } else {
        verticalDelta = moveDelta.y;
        moveDelta.y = 0;
        if (flyGraceFrames > 0) {
          verticalDelta += FLIGHT_NUDGE_UP * 0.5;
          flyGraceFrames--;
        }
      }
      sanitizeVec3(moveDelta, ZERO_VECTOR);

      const activeColliders = isFlying ? getFlightColliders() : colliderAabbs;

      if (moveDelta.lengthSq() > 1e-10) {
        const result = resolveCapsuleVsAABBs(capsule, moveDelta, activeColliders, {
          maxIters: 3,
          skin: 0.01
        });
        sanitizeVec3(capsule.position, SAFE_POSITION);
        controlledObject.position.copy(capsule.position);
        sanitizePosition(controlledObject.position);
        actualMove.copy(result.moved);
        sanitizeVec3(actualMove, ZERO_VECTOR);
      }

      if (isFlying && Number.isFinite(verticalDelta) && Math.abs(verticalDelta) > 1e-6) {
        verticalMoveDelta.set(0, verticalDelta, 0);
        sanitizeVec3(verticalMoveDelta, ZERO_VECTOR);
        const resultVertical = resolveCapsuleVsAABBs(capsule, verticalMoveDelta, activeColliders, {
          maxIters: 3,
          skin: 0.01
        });
        sanitizeVec3(capsule.position, SAFE_POSITION);
        controlledObject.position.copy(capsule.position);
        sanitizePosition(controlledObject.position);
        actualMove.add(resultVertical.moved);
        sanitizeVec3(actualMove, ZERO_VECTOR);
      } else if (isFlying && !Number.isFinite(verticalDelta)) {
        controlledObject.position.y = SAFE_POSITION.y;
        capsule.setPosition(controlledObject.position.x, controlledObject.position.y, controlledObject.position.z);
      }
    }

    if (debugControlsEnabled && dtSafe > 0 && debugLogTime <= 2) {
      debugLogTime += dtSafe;
      if (debugLogTime <= 2) {
        console.log('[controls]', {
          x: axisX,
          z: axisZ,
          yaw
        });
      }
    }

    // Ground & upright stabilization
    if (!isFlying) {
      if (groundSnapSkip && Number.isFinite(groundSnapSkip.value) && groundSnapSkip.value > 0) {
        groundSnapSkip.value = Math.max(0, Math.floor(groundSnapSkip.value) - 1);
      } else {
        snapToGround(controlledObject, groundMeshes, physicsState, dt);
      }
    }
    sanitizePosition(controlledObject.position);
    capsule.setPosition(controlledObject.position.x, controlledObject.position.y, controlledObject.position.z);
    keepUpright(controlledObject, yaw, 1);
  };

  return {
    update,
    setObject,
    setKeyboard,
    setGroundMeshes,
    setColliders,
    setGroundSnapSkipRef(nextRef) {
      groundSnapSkip = typeof nextRef === 'object' ? nextRef : null;
    },
    isRunning() {
      return runningState;
    },
    isFlying() {
      return isFlying;
    },
    state
  };
}

export default createPlayerController;
