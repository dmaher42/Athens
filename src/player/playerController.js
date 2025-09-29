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
const rightVector = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const desiredMove = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const TURN_ACCEL = 12;

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
  let runningState = false;
  let isFlying = false;
  let prevFlyKeyDown = false;
  let flyGraceFrames = 0;

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
        velocity.y = 0;
        if (controlledObject) {
          controlledObject.position.y += 0.12;
          capsule.setPosition(
            controlledObject.position.x,
            controlledObject.position.y,
            controlledObject.position.z
          );
        }
        flyGraceFrames = 5;
      } else {
        flyGraceFrames = 0;
      }
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info(`[playerController] Fly ${isFlying ? 'ON' : 'OFF'}`);
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

    const axisXRaw = currentKeyboard.axis?.x;
    const axisZRaw = currentKeyboard.axis?.z;
    const axisX = Number.isFinite(axisXRaw) ? axisXRaw : 0;
    const axisZ = Number.isFinite(axisZRaw) ? axisZRaw : 0;
    const hasMoveInput = Math.abs(axisX) > 1e-3 || Math.abs(axisZ) > 1e-3;

    // Speed target
    const shiftDown = Boolean(currentKeyboard.axis?.running);
    const effectiveRunMultiplier = shiftDown ? Math.max(runMultiplier, 1) : 1;
    const baseSpeed = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const speed = baseSpeed * effectiveRunMultiplier;
    const targetSpeed = hasMoveInput ? speed : 0;
    const verticalSpeed = speed;
    runningState = hasMoveInput && shiftDown && speed > baseSpeed;

    targetVelocity.set(0, 0, 0);
    let desiredYaw = yaw;
    if (hasMoveInput) {
      if (typeof camera.getWorldDirection === 'function') {
        camera.getWorldDirection(viewDirection);
      } else {
        viewDirection.set(0, 0, -1);
      }
      viewDirection.y = 0;
      if (viewDirection.lengthSq() < 1e-6) {
        viewDirection.set(0, 0, -1);
      } else {
        viewDirection.normalize();
      }

      moveDirection.copy(viewDirection);
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

      desiredMove.set(0, 0, 0);
      const forwardInput = THREE.MathUtils.clamp(-axisZ, -1, 1);
      const strafeInput = THREE.MathUtils.clamp(axisX, -1, 1);
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

    let flyVerticalVelocity = 0;
    if (isFlying) {
      const ascend = Boolean(currentKeyboard.isDown?.('Space') || currentKeyboard.isDown?.('KeyE'));
      const descend = Boolean(
        currentKeyboard.isDown?.('ControlLeft') ||
          currentKeyboard.isDown?.('ControlRight') ||
          currentKeyboard.isDown?.('KeyC') ||
          currentKeyboard.isDown?.('KeyQ')
      );
      if (ascend) {
        flyVerticalVelocity = verticalSpeed;
      } else if (descend) {
        flyVerticalVelocity = -verticalSpeed;
      } else {
        flyVerticalVelocity = 0;
      }
      physicsState.vy = 0;
    } else {
      targetVelocity.y = 0;
    }

    // Accel/lerp velocity
    const accel = Number.isFinite(acceleration) ? Math.max(acceleration, 0) : 10;
    const lerpAlpha = accel > 0 && dt > 0 ? 1 - Math.exp(-accel * dt) : 1;
    velocity.lerp(targetVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));
    if (isFlying) {
      velocity.y = flyVerticalVelocity;
    } else {
      velocity.y = 0;
    }

    // Integrate motion with collisions
    capsule.setPosition(position.x, position.y, position.z);

    actualMove.set(0, 0, 0);
    if (dt > 0) {
      moveDelta.copy(velocity).multiplyScalar(dt);
      if (!isFlying) moveDelta.y = 0;
      if (isFlying && flyGraceFrames > 0 && velocity.y > 0) {
        moveDelta.y += 0.02;
        flyGraceFrames--;
      }

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
          x: axisX,
          z: axisZ,
          yaw
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
