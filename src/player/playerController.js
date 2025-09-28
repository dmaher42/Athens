import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const referenceForward = new THREE.Vector3(0, 0, 1);

export function createPlayerController(
  object3d,
  keyboard,
  {
    walkSpeed = 4.0,
    runMultiplier = 1.7,
    turnLerp = 0.18
  } = {}
) {
  let controlledObject = object3d || null;

  const getSpeed = () => {
    const base = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const multiplier = keyboard?.axis?.running ? runMultiplier : 1;
    return base * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
  };

  const update = (deltaSeconds, camera) => {
    if (!controlledObject || !keyboard || !camera) {
      return;
    }

    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-6) {
      cameraForward.set(0, 0, -1);
    } else {
      cameraForward.normalize();
    }

    cameraRight.copy(cameraForward).cross(WORLD_UP).normalize();

    moveDirection.set(0, 0, 0);
    const axisX = keyboard.axis?.x || 0;
    const axisZ = keyboard.axis?.z || 0;

    if (axisZ !== 0) {
      moveDirection.addScaledVector(cameraForward, -axisZ);
    }
    if (axisX !== 0) {
      moveDirection.addScaledVector(cameraRight, axisX);
    }

    const lengthSq = moveDirection.lengthSq();
    if (lengthSq > 1e-6) {
      moveDirection.normalize();
      const speed = getSpeed();
      const distance = speed * (Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
      controlledObject.position.addScaledVector(moveDirection, distance);

      targetQuaternion.setFromUnitVectors(referenceForward, moveDirection);
      controlledObject.quaternion.slerp(targetQuaternion, THREE.MathUtils.clamp(turnLerp, 0, 1));
    }
  };

  const setObject = (nextObject) => {
    if (!nextObject) {
      return;
    }
    controlledObject = nextObject;
  };

  return {
    update,
    setObject
  };
}

export default createPlayerController;
