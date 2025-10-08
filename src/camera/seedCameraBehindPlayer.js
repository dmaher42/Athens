import * as THREE from 'three';

const tempForward = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempSpherical = new THREE.Spherical();
const tempLook = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

export function seedCameraBehindPlayer(player, camera, opts = {}) {
  if (!player || !camera || typeof camera !== 'object') {
    return;
  }

  const followDistance = Number.isFinite(opts.followDistance) && opts.followDistance > 0
    ? opts.followDistance
    : 6;
  const shoulderHeight = Number.isFinite(opts.shoulderHeight) ? opts.shoulderHeight : 1.6;
  const basePitchDeg = Number.isFinite(opts.pitchDeg) ? opts.pitchDeg : -15;
  const pitch = THREE.MathUtils.degToRad(basePitchDeg);

  tempForward.set(0, 0, 1);
  if (typeof player?.getWorldQuaternion === 'function') {
    player.getWorldQuaternion(tempQuaternion);
    tempForward.applyQuaternion(tempQuaternion);
  } else if (player?.quaternion instanceof THREE.Quaternion) {
    tempForward.applyQuaternion(player.quaternion);
  }

  if (
    !Number.isFinite(tempForward.x) ||
    !Number.isFinite(tempForward.y) ||
    !Number.isFinite(tempForward.z) ||
    tempForward.lengthSq() < 1e-6
  ) {
    tempForward.set(0, 0, 1);
  }

  tempForward.y = 0;
  if (tempForward.lengthSq() < 1e-6) {
    tempForward.set(0, 0, 1);
  } else {
    tempForward.normalize();
  }

  const yaw = Math.atan2(tempForward.x, tempForward.z) + Math.PI;

  const target = typeof player.getWorldPosition === 'function'
    ? player.getWorldPosition(tempTarget)
    : tempTarget.copy(player.position ?? new THREE.Vector3());
  target.y += shoulderHeight;

  tempSpherical.radius = followDistance;
  tempSpherical.theta = yaw;
  tempSpherical.phi = Math.PI / 2 - pitch;
  camera.position.setFromSpherical(tempSpherical).add(target);

  tempLook.copy(target);
  if (tempLook.distanceToSquared(camera.position) < 1e-9) {
    tempLook.y += 0.001;
  }
  camera.lookAt(tempLook);

  const rigState = (() => {
    if (!camera || typeof camera !== 'object') {
      return null;
    }
    if (camera.__rigState && typeof camera.__rigState === 'object') {
      return camera.__rigState;
    }
    camera.__rigState = {};
    return camera.__rigState;
  })();

  if (rigState) {
    rigState.yaw = yaw;
    rigState.pitch = pitch;
    rigState.distance = followDistance;
    if (Number.isFinite(rigState.minDistance) && rigState.minDistance > 0) {
      rigState.distance = Math.max(rigState.distance, rigState.minDistance);
    }
    if (Number.isFinite(rigState.maxDistance) && rigState.maxDistance > 0) {
      rigState.distance = Math.min(rigState.distance, rigState.maxDistance);
    }
  }
}

export default seedCameraBehindPlayer;
