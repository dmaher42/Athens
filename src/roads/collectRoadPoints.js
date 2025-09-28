import * as THREE from 'three';

export function collectRoadPoints(scene) {
  const points = [];
  const pushPoint = (vec) => {
    if (!vec) return;
    const v = vec.isVector3 ? vec.clone() : new THREE.Vector3(vec.x || 0, vec.y || 0, vec.z || 0);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) return;
    points.push(new THREE.Vector3(v.x, 0, v.z));
  };

  if (!scene || typeof scene.traverse !== 'function') {
    return points;
  }

  scene.traverse((obj) => {
    if (!obj?.visible) return;
    const name = (obj.name || '').toLowerCase();
    if (!name) return;
    if (/(parthenon|temple|stoa|agora|theater|houses|gate|citywalls|roadnetwork)/.test(name)) {
      const worldPos = obj.getWorldPosition(new THREE.Vector3());
      pushPoint(worldPos);
      obj.children?.forEach((child) => {
        const childName = (child.name || '').toLowerCase();
        if (/(entrance|gate|door)/.test(childName)) {
          const childPos = child.getWorldPosition(new THREE.Vector3());
          pushPoint(childPos);
        }
      });
    }
  });

  const deduped = [];
  points.forEach((point) => {
    if (!deduped.some((existing) => existing.distanceToSquared(point) < 9)) {
      deduped.push(point);
    }
  });

  return deduped;
}
