import * as THREE from 'three';

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const desiredPosition = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const targetWorldPosition = new THREE.Vector3();

export function createFollowCamera(
  camera,
  target,
  {
    offset = new THREE.Vector3(0, 2.2, -6),
    lerp = 0.12,
    lookAtOffset = new THREE.Vector3(0, 1.5, 0)
  } = {}
) {
  const options = {
    offset: offset.clone(),
    lerp: Number.isFinite(lerp) ? lerp : 0.12,
    lookAtOffset: lookAtOffset.clone()
  };

  let currentTarget = target || null;

  const update = () => {
    if (!camera || !currentTarget) {
      return;
    }

    currentTarget.getWorldPosition(targetWorldPosition);
    currentTarget.getWorldQuaternion(tempQuaternion);

    desiredPosition.copy(options.offset).applyQuaternion(tempQuaternion).add(targetWorldPosition);
    camera.position.lerp(desiredPosition, THREE.MathUtils.clamp(options.lerp, 0, 1));

    lookOffset.copy(options.lookAtOffset).applyQuaternion(tempQuaternion);
    tempPosition.copy(targetWorldPosition).add(lookOffset);
    camera.lookAt(tempPosition);
  };

  const setTarget = (nextTarget) => {
    currentTarget = nextTarget || currentTarget;
  };

  return {
    update,
    setTarget,
    options
  };
}

export default createFollowCamera;
