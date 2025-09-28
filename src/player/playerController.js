import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const horizontalDirection = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const referenceForward = new THREE.Vector3(0, 0, 1);

export function createPlayerController(
  object3d,
  keyboard,
  {
    walkSpeed = 5.5,
    runMultiplier = 2.0,
    flyMultiplier = 1.6,
    turnLerp = 0.18,
    flightToggleKey = 'KeyX'
  } = {}
) {
  let controlledObject = object3d || null;
  let flightEnabled = false;
  let previousToggleDown = false;
  let runningState = false;

  const isKeyDown = (code) => (typeof keyboard?.isDown === 'function' ? keyboard.isDown(code) : false);

  const getSpeed = () => {
    const base = Number.isFinite(walkSpeed) ? walkSpeed : 4.0;
    const runningMultiplier = runningState && Number.isFinite(runMultiplier) && runMultiplier > 0 ? runMultiplier : 1;
    const activeFlyMultiplier = flightEnabled && Number.isFinite(flyMultiplier) && flyMultiplier > 0 ? flyMultiplier : 1;
    return base * runningMultiplier * activeFlyMultiplier;
  };

  const update = (deltaSeconds, camera) => {
    if (!controlledObject || !keyboard || !camera) {
      return;
    }

    const toggleDown = flightToggleKey ? isKeyDown(flightToggleKey) : false;
    if (toggleDown && !previousToggleDown) {
      flightEnabled = !flightEnabled;
    }
    previousToggleDown = toggleDown;

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

    const shiftDown = isKeyDown('ShiftLeft') || isKeyDown('ShiftRight');
    runningState = !flightEnabled && shiftDown;

    if (flightEnabled) {
      let verticalInput = 0;
      if (isKeyDown('Space')) {
        verticalInput += 1;
      }
      if (
        shiftDown ||
        isKeyDown('ControlLeft') ||
        isKeyDown('ControlRight') ||
        isKeyDown('KeyC') ||
        isKeyDown('KeyZ')
      ) {
        verticalInput -= 1;
      }
      if (verticalInput !== 0) {
        moveDirection.y = verticalInput;
      }
    }

    const lengthSq = moveDirection.lengthSq();
    if (lengthSq > 1e-6) {
      moveDirection.normalize();
      const speed = getSpeed();
      const distance = speed * (Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
      controlledObject.position.addScaledVector(moveDirection, distance);

      horizontalDirection.copy(moveDirection);
      horizontalDirection.y = 0;
      if (horizontalDirection.lengthSq() > 1e-6) {
        horizontalDirection.normalize();
        targetQuaternion.setFromUnitVectors(referenceForward, horizontalDirection);
        controlledObject.quaternion.slerp(targetQuaternion, THREE.MathUtils.clamp(turnLerp, 0, 1));
      }
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
    setObject,
    isFlying() {
      return flightEnabled;
    },
    isRunning() {
      return runningState;
    }
  };
}

export default createPlayerController;
