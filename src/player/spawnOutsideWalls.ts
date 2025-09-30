import * as THREE from 'three';

function isValidBox(box: THREE.Box3 | null | undefined) {
  if (!box) return false;
  const { min, max } = box;
  return [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) && max.x >= min.x && max.z >= min.z;
}

export function findWallsBounds(
  scene: THREE.Scene,
  names = ['CityWalls', 'Walls', 'Fortifications']
): THREE.Box3 | null {
  if (!scene) return null;
  let walls: THREE.Object3D | null = null;
  for (const n of names) {
    if (!n) continue;
    const candidate = scene.getObjectByName(n);
    if (candidate) {
      walls = candidate;
      break;
    }
  }
  if (!walls) return null;
  const box = new THREE.Box3().setFromObject(walls);
  if (!isValidBox(box) || box.isEmpty()) {
    return null;
  }
  return box;
}

export function pickSpawnOutside(box: THREE.Box3, margin = 5) {
  const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : 0;
  if (!isValidBox(box)) {
    return { x: 20, z: -20, yaw: 0 };
  }
  const centerX = (box.min.x + box.max.x) * 0.5;
  const spawnX = Number.isFinite(centerX) ? centerX : 0;
  const spawnZ = Number.isFinite(box.min.z)
    ? box.min.z - safeMargin
    : -safeMargin;
  const yawFacingCity = 0;
  return { x: spawnX, z: spawnZ, yaw: yawFacingCity };
}
