import * as THREE from 'three';

const EULER_HELPER = new THREE.Euler(0, 0, 0, 'YXZ');
const TARGET_EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const TARGET_QUATERNION = new THREE.Quaternion();
const FORWARD = new THREE.Vector3(0, 0, 1);
const FORWARD_WORLD = new THREE.Vector3();

function deriveYaw(object3d) {
  if (!object3d) {
    return 0;
  }
  FORWARD_WORLD.copy(FORWARD).applyQuaternion(object3d.quaternion);
  return Math.atan2(FORWARD_WORLD.x, FORWARD_WORLD.z);
}

export function keepUpright(object3d, yawTarget, lerp = 0.2) {
  if (!object3d) {
    return;
  }

  const amount = THREE.MathUtils.clamp(Number.isFinite(lerp) ? lerp : 0.2, 0, 1);

  EULER_HELPER.setFromQuaternion(object3d.quaternion, 'YXZ');
  const desiredYaw = Number.isFinite(yawTarget) ? yawTarget : deriveYaw(object3d);

  TARGET_EULER.set(0, desiredYaw, 0);
  TARGET_QUATERNION.setFromEuler(TARGET_EULER);

  object3d.quaternion.slerp(TARGET_QUATERNION, amount);
}
