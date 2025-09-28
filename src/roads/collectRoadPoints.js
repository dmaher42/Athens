import * as THREE from 'three';

export function collectRoadPoints(scene) {
  const points = [];
  const addPoint = (vector) => {
    if (!vector) return;
    if (vector instanceof THREE.Vector3) {
      points.push(vector.clone());
    } else if (typeof vector.x === 'number' && typeof vector.z === 'number') {
      points.push(new THREE.Vector3(vector.x, vector.y ?? 0, vector.z));
    }
  };

  if (!scene || typeof scene.traverse !== 'function') {
    return points;
  }

  scene.traverse((object) => {
    if (!object?.visible) return;
    const name = (object.name || '').toLowerCase();
    if (!name) return;
    if (/(parthenon|temple|stoa|agora|theater|houses|gate|citywalls)/.test(name)) {
      const worldPos = object.getWorldPosition(new THREE.Vector3());
      addPoint(new THREE.Vector3(worldPos.x, 0, worldPos.z));
      if (Array.isArray(object.children)) {
        object.children.forEach((child) => {
          const childName = (child.name || '').toLowerCase();
          if (/(entrance|gate|door)/.test(childName)) {
            const childPos = child.getWorldPosition(new THREE.Vector3());
            addPoint(new THREE.Vector3(childPos.x, 0, childPos.z));
          }
        });
      }
    }
  });

  const deduped = [];
  const thresholdSq = 9;
  for (const point of points) {
    if (!deduped.some((other) => other.distanceToSquared(point) < thresholdSq)) {
      deduped.push(point);
    }
  }

  return deduped;
}

export default collectRoadPoints;
