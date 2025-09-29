import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';

const moveDirection = new THREE.Vector3();

const targetVelocity = new THREE.Vector3();
const velocity = new THREE.Vector3();
const horizontalVector = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, 1);
const moveDelta = new THREE.Vector3();
const actualMove = new THREE.Vector3();

const TURN_SPEED = 2.2;
const TURN_ACCEL = 12;
const TURN_DAMP = 10;

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
    walkSpeed = 4.0,
    runMultiplier = 1.7,
    acceleration = 10,
    turnLerp = 0.18, // kept for API compatibility
    colliders: initialColliders = []
  } = {}
) {
  let controlledObject = object3d || null;
  let currentKeyboard = keyboard || null;
  let groundMeshes = [];
  let colliderAabbs = Array.isArray(initialColliders) ? initialColliders : [];

  const capsule = new Capsule(0.45, 1.6);

  const physicsState = {
    vy: 0,
    lastGoodY: controlledObject?.position?.y ?? 0
  };

  let yaw = deriveYaw(controlledObject);
  let angularVelocity = 0;
  let runningState = false;
  let isFlying = false;
  let prevFlyKeyDown = false;

  const debugControlsEnabled = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).get('debugControls') === '1';
    } catch {
      return false;
    }
  })();
  let debugLogTime = 0;

  if (controlledObject) {
    capsule.setPosition(
      controlledObject.position.x,
      controlledObject.position.y,
      controlledObject.position.z
    );
  }

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
    physicsState.lastGoodY = controlledObject.position?.y ?? 0;
    yaw = deriveYaw(controlledObject);
    angularVelocity = 0;
    capsule.setPosition(
      controlledObject.position.x,
      controlledObject.position.y,
      controlledObject.position.z
    );
  };

  const setKeyboard = (nextKeyboard) => {
    currentKeyboard = nextKeyboard || currentKeyboard;
  };

  const update = (deltaSeconds, camera) => {
    if (!controlledObject || !currentKeyboard || !camera) return;

    const position = controlledObject.position;
    const flyKeyDown = Boolean(currentKeyboard.isDown?.('KeyX'));
    if (flyKeyDown && !prevFlyKeyDown) {
      isFlying = !isFlying;
      if (isFlying) {
        physicsState.vy = 0;
      }
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(`[playerController] KeyX pressed. Fly mode ${isFlying ? 'enabled' : 'disabled'}.`);
      }
    }
    prevFlyKeyDown = flyKeyDown;

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return;
    }

    const dtRaw = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : NaN;
    const dt = Number.isFinite(dtRaw) ? Math.min(dtRaw, 0.25) : 0;
    const dtSafe = Number.isFinite(dtRaw) ? dt : 1 / 60;

    // Turn control (yaw)
    const turnInputRaw = currentKeyboard.axis?.turn;
    const turnInput = Number.isFinite(turnInputRaw) ? turnInputRaw : 0;
    const targetAngularVelocity = turnInput * TURN_SPEED;
    const turnLerpAlpha = 1 - Math.exp(-TURN_ACCEL * dtSafe);
    angularVelocity += (targetAngularVelocity - angularVelocity) * turnLerpAlpha;
    angularVelocity *= Math.exp(-TURN_DAMP * dtSafe);
    if (!Number.isFinite(angularVelocity)) angularVelocity = 0;

    yaw += angularVelocity * dtSafe;
    if (!Number.isFinite(yaw)) {
      yaw = 0;
    } else {
      yaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI;
    }

    // Input (forward/back)
    const axisZ = currentKeyboard.axis?.z || 0;
    const hasMoveInput = axisZ !== 0;

    // Speed target
    const shiftDown = Boolean(currentKeyboard.axis?.running);
    const effectiveRunMultiplier = shiftDown ? Math.max(runMultiplier, 1) : 1;
    const baseSpeed = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const targetSpeed = hasMoveInput ? baseSpeed * effectiveRunMultiplier : 0;
    runningState = hasMoveInput && shiftDown && targetSpeed > baseSpeed;

    targetVelocity.set(0, 0, 0);
    if (hasMoveInput) {
      moveDirection.set(Math.sin(yaw), 0, Math.cos(yaw));
      if (moveDirection.lengthSq() < 1e-6) {
        moveDirection.set(0, 0, 1);
      } else {
        moveDirection.normalize();
      }
      const forwardMagnitude = THREE.MathUtils.clamp(-axisZ, -1, 1);
      targetVelocity.addScaledVector(moveDirection, forwardMagnitude * targetSpeed);
    }

    if (isFlying) {
      const verticalSpeed = baseSpeed * effectiveRunMultiplier;
      const ascend = Boolean(currentKeyboard.isDown?.('Space') || currentKeyboard.isDown?.('KeyE'));
      const descend = Boolean(
        currentKeyboard.isDown?.('ControlLeft') ||
          currentKeyboard.isDown?.('ControlRight') ||
          currentKeyboard.isDown?.('KeyC') ||
          currentKeyboard.isDown?.('KeyQ')
      );
      let vy = 0;
      if (ascend) vy += verticalSpeed;
      if (descend) vy -= verticalSpeed;
      targetVelocity.y = vy;
      physicsState.vy = 0;
    } else {
      targetVelocity.y = 0;
    }

    // Accel/lerp velocity
    const accel = Number.isFinite(acceleration) ? Math.max(acceleration, 0) : 10;
    const lerpAlpha = accel > 0 && dt > 0 ? 1 - Math.exp(-accel * dt) : 1;
    velocity.lerp(targetVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));
    if (isFlying) {
      velocity.y = targetVelocity.y;
    } else {
      velocity.y = 0;
    }

    // Integrate motion with collisions
    capsule.setPosition(position.x, position.y, position.z);

    actualMove.set(0, 0, 0);
    if (dt > 0) {
      moveDelta.copy(velocity).multiplyScalar(dt);
      if (!isFlying) moveDelta.y = 0;

      if (moveDelta.lengthSq() > 1e-10) {
        const result = resolveCapsuleVsAABBs(capsule, moveDelta, colliderAabbs, {
          maxIters: 3,
          skin: 0.01
        });
        controlledObject.position.copy(capsule.position);
        actualMove.copy(result.moved);
      }
    }

    if (debugControlsEnabled && dtSafe > 0 && debugLogTime <= 2) {
      debugLogTime += dtSafe;
      if (debugLogTime <= 2) {
        console.log('[controls]', {
          turn: turnInput,
          z: axisZ,
          yaw,
          angVel: angularVelocity
        });
      }
    }

    // Ground & upright stabilization
    if (!isFlying) {
      snapToGround(controlledObject, groundMeshes, physicsState, dt);
    }
    capsule.setPosition(controlledObject.position.x, controlledObject.position.y, controlledObject.position.z);
    keepUpright(controlledObject, yaw, 1);
  };

  return {
    update,
    setObject,
    setKeyboard,
    setGroundMeshes,
    setColliders,
    isRunning() {
      return runningState;
    },
    isFlying() {
      return isFlying;
    }
  };
}

export default createPlayerController;
