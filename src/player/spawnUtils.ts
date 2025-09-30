import * as THREE from 'three';

export function computeApproxBodyHeight(obj: THREE.Object3D, fallback = 1.8) {
  if (!obj) return fallback;
  const box = new THREE.Box3().setFromObject(obj);
  if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) {
    return fallback;
  }
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 0.1) {
    return fallback;
  }
  return height;
}

export function computeHalfBodyHeight(obj: THREE.Object3D, fallback = 1.8) {
  const full = computeApproxBodyHeight(obj, fallback);
  const half = full * 0.5;
  if (!Number.isFinite(half) || half <= 0.05) {
    return Math.max(0.05, fallback * 0.5);
  }
  return half;
}
