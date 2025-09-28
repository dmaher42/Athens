import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const targetVelocity = new THREE.Vector3();
const velocity = new THREE.Vector3();
const horizontalVector = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, 1);

function deriveYaw(object3d) {
  if (!object3d) {
    return 0;
  }
  horizontalVector.copy(FORWARD).applyQuaternion(object3d.quaternion);
  horizontalVector.y = 0;
  if (horizontalVector.lengthSq() < 1e-6) {
    return 0;
  }
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
    turnLerp = 0.18
  } = {}
) {
  let controlledObject = object3d || null;
  let currentKeyboard = keyboard || null;
  let groundMeshes = [];
  const physicsState = {
    vy: 0,
    lastGoodY: controlledObject?.position?.y ?? 0
  };

  let desiredYaw = deriveYaw(controlledObject);
  let runningState = false;

  const setGroundMeshes = (meshes) => {
    groundMeshes = Array.isArray(meshes) ? meshes : [];
  };

  const setObject = (nextObject) => {
    if (!nextObject) {
      return;
    }
    controlledObject = nextObject;
    physicsState.vy = 0;
    physicsState.lastGoodY = controlledObject.position?.y ?? 0;
    desiredYaw = deriveYaw(controlledObject);
  };

  const setKeyboard = (nextKeyboard) => {
    currentKeyboard = nextKeyboard || currentKeyboard;
  };

  const update = (deltaSeconds, camera) => {
    if (!controlledObject || !currentKeyboard || !camera) {
      return;
    }

    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;

    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-6) {
      cameraForward.set(0, 0, -1);
    } else {
      cameraForward.normalize();
    }

    cameraRight.copy(cameraForward).cross(WORLD_UP).normalize();

    const axisX = currentKeyboard.axis?.x || 0;
    const axisZ = currentKeyboard.axis?.z || 0;
    const hasInput = axisX !== 0 || axisZ !== 0;

    moveDirection.set(0, 0, 0);
    if (axisZ !== 0) {
      moveDirection.addScaledVector(cameraForward, -axisZ);
    }
    if (axisX !== 0) {
      moveDirection.addScaledVector(cameraRight, axisX);
    }

    if (moveDirection.lengthSq() > 1e-6) {
      moveDirection.normalize();
    } else {
      moveDirection.set(0, 0, 0);
    }

    const shiftDown = Boolean(currentKeyboard.axis?.running);
    const effectiveRunMultiplier = shiftDown ? Math.max(runMultiplier, 1) : 1;
    const baseSpeed = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const targetSpeed = hasInput ? baseSpeed * effectiveRunMultiplier : 0;
    runningState = hasInput && shiftDown && targetSpeed > baseSpeed;

    if (hasInput) {
      targetVelocity.copy(moveDirection).multiplyScalar(targetSpeed);
    } else {
      targetVelocity.set(0, 0, 0);
    }

    const accel = Number.isFinite(acceleration) ? Math.max(acceleration, 0) : 10;
    const lerpAlpha = accel > 0 && dt > 0 ? 1 - Math.exp(-accel * dt) : 1;
    velocity.lerp(targetVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));

    if (dt > 0) {
      controlledObject.position.addScaledVector(velocity, dt);
    }

    horizontalVector.copy(velocity);
    horizontalVector.y = 0;
    if (horizontalVector.lengthSq() > 1e-6) {
      horizontalVector.normalize();
      desiredYaw = Math.atan2(horizontalVector.x, horizontalVector.z);
    }

    snapToGround(controlledObject, groundMeshes, physicsState, dt);
    keepUpright(controlledObject, desiredYaw, Number.isFinite(turnLerp) ? turnLerp : 0.18);
  };

  return {
    update,
    setObject,
    setKeyboard,
    setGroundMeshes,
    isRunning() {
      return runningState;
    }
  };
}

export default createPlayerController;
