import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();

const targetVelocity = new THREE.Vector3();
const velocity = new THREE.Vector3();
const horizontalVector = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, 1);
const moveDelta = new THREE.Vector3();
const actualMove = new THREE.Vector3();

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
    turnLerp = 0.18,
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

  let desiredYaw = deriveYaw(controlledObject);
  let runningState = false;

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
    desiredYaw = deriveYaw(controlledObject);
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
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return;
    }

    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;

    // Camera basis (flat)
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-6) {
      cameraForward.set(0, 0, -1);
    } else {
      cameraForward.normalize();
    }
    cameraRight.copy(cameraForward).cross(WORLD_UP).normalize();

    // Input
    const axisX = currentKeyboard.axis?.x || 0;
    const axisZ = currentKeyboard.axis?.z || 0;
    const hasInput = axisX !== 0 || axisZ !== 0;

    moveDirection.set(0, 0, 0);
    if (axisZ !== 0) moveDirection.addScaledVector(cameraForward, -axisZ);
    if (axisX !== 0) moveDirection.addScaledVector(cameraRight, axisX);
    if (moveDirection.lengthSq() > 1e-6) moveDirection.normalize();

    // Speed target
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

    // Accel/lerp velocity
    const accel = Number.isFinite(acceleration) ? Math.max(acceleration, 0) : 10;
    const lerpAlpha = accel > 0 && dt > 0 ? 1 - Math.exp(-accel * dt) : 1;
    velocity.lerp(targetVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));

    // Integrate horizontal motion
    capsule.setPosition(
      controlledObject.position.x,
      controlledObject.position.y,
      controlledObject.position.z
    );

    actualMove.set(0, 0, 0);
    if (dt > 0) {
      moveDelta.copy(velocity).multiplyScalar(dt);
      moveDelta.y = 0;
      if (moveDelta.lengthSq() > 1e-10) {
        const result = resolveCapsuleVsAABBs(capsule, moveDelta, colliderAabbs, {
          maxIters: 3,
          skin: 0.01
        });
        controlledObject.position.copy(capsule.position);
        actualMove.copy(result.moved);
      }
    }

    // Face move direction smoothly
    horizontalVector.copy(actualMove.lengthSq() > 0 ? actualMove : velocity);
    horizontalVector.y = 0;
    if (horizontalVector.lengthSq() > 1e-6) {
      horizontalVector.normalize();
      desiredYaw = Math.atan2(horizontalVector.x, horizontalVector.z);
    }

    // Ground & upright stabilization
    snapToGround(controlledObject, groundMeshes, physicsState, dt);
    capsule.setPosition(
      controlledObject.position.x,
      controlledObject.position.y,
      controlledObject.position.z
    );
    keepUpright(controlledObject, desiredYaw, Number.isFinite(turnLerp) ? turnLerp : 0.18);
  };

  return {
    update,
    setObject,
    setKeyboard,
    setGroundMeshes,
    setColliders,
    isRunning() {
      return runningState;
    }
  };
}

export default createPlayerController;
