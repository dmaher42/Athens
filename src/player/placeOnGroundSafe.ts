import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

const WATER_NAMES = ['water', 'lake', 'ocean'];
const SKY_NAMES = ['sky'];

function shouldIgnoreHit(object: THREE.Object3D | null | undefined) {
  if (!object) return false;
  const name = (object.name || '').toLowerCase();
  return WATER_NAMES.some((token) => name.includes(token)) || SKY_NAMES.some((token) => name.includes(token));
}

export function groundYAt(
  scene: THREE.Scene,
  x: number,
  z: number,
  startY = 1000,
  include: THREE.Object3D[] | null = null
) {
  if (!scene) return 0;
  const originY = Number.isFinite(startY) ? startY : 1000;
  _origin.set(Number.isFinite(x) ? x : 0, originY, Number.isFinite(z) ? z : 0);
  _ray.set(_origin, _down);

  let targets: THREE.Object3D[] = [];
  if (Array.isArray(include) && include.length) {
    targets = include;
  } else {
    targets = [scene];
  }

  const hits = _ray.intersectObjects(targets, true);
  for (const hit of hits) {
    if (shouldIgnoreHit(hit.object)) continue;
    const y = hit?.point?.y;
    if (Number.isFinite(y)) {
      return y;
    }
  }
  return 0;
}
