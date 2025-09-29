import * as THREE from 'three';

const DEFAULT_POSITION = { x: 0, y: 1, z: 0 } as const;

export function safeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeVec3(
  v: THREE.Vector3,
  def: { x: number; y: number; z: number } = DEFAULT_POSITION
) {
  if (!Number.isFinite(v.x)) v.x = def.x;
  if (!Number.isFinite(v.y)) v.y = def.y;
  if (!Number.isFinite(v.z)) v.z = def.z;
  return v;
}

export function sanitizeObjectPosition(
  obj: { position?: THREE.Vector3 | undefined } | null | undefined,
  def: { x: number; y: number; z: number } = DEFAULT_POSITION
) {
  if (!obj?.position) return;
  sanitizeVec3(obj.position, def);
}
