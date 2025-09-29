import * as THREE from 'three';

export const DEFAULT_PLAYER = new THREE.Vector3(0, 1, 0);
export const DEFAULT_CAMERA = new THREE.Vector3(20, 12, 20);

export function finiteNumber(n: any, def = 0): number {
  const parsed = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(parsed) ? parsed : def;
}

export function isFiniteVec3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function sanitizeVec3(
  v: THREE.Vector3,
  def: { x: number; y: number; z: number }
): THREE.Vector3 {
  if (!Number.isFinite(v.x)) v.x = def.x;
  if (!Number.isFinite(v.y)) v.y = def.y;
  if (!Number.isFinite(v.z)) v.z = def.z;
  const CLAMP = 1e6; // avoid absurd values
  v.x = Math.max(-CLAMP, Math.min(CLAMP, v.x));
  v.y = Math.max(-CLAMP, Math.min(CLAMP, v.y));
  v.z = Math.max(-CLAMP, Math.min(CLAMP, v.z));
  return v;
}

export function sanitizeEuler(e: THREE.Euler, def = { x: 0, y: 0, z: 0 }) {
  e.x = finiteNumber(e.x, def.x);
  e.y = finiteNumber(e.y, def.y);
  e.z = finiteNumber(e.z, def.z);
  return e;
}

export function sanitizeQuaternion(q: THREE.Quaternion) {
  if (![q.x, q.y, q.z, q.w].every(Number.isFinite)) q.set(0, 0, 0, 1);
  if (q.lengthSq() === 0) q.set(0, 0, 0, 1);
  else q.normalize();
  return q;
}

export function safeSetVec3(
  v: THREE.Vector3,
  src: any,
  def: { x: number; y: number; z: number }
) {
  v.set(
    Number.isFinite(+src?.x) ? +src.x : def.x,
    Number.isFinite(+src?.y) ? +src.y : def.y,
    Number.isFinite(+src?.z) ? +src.z : def.z,
  );
  sanitizeVec3(v, def);
}
