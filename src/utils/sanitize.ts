export function safeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeVec3(v: { x: number; y: number; z: number }, fallback = { x: 0, y: 1, z: 0 }) {
  v.x = safeNumber(v.x, fallback.x);
  v.y = safeNumber(v.y, fallback.y);
  v.z = safeNumber(v.z, fallback.z);
}

export function sanitizeObjectPosition(obj: any, fallback = { x: 0, y: 1, z: 0 }) {
  if (!obj || !obj.position) return;
  sanitizeVec3(obj.position, fallback);
}
