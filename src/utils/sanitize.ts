export function safeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}
export function sanitizeVec3(
  v: { x: number; y: number; z: number },
  fb = { x: 0, y: 1, z: 0 }
) {
  v.x = safeNumber(v.x, fb.x);
  v.y = safeNumber(v.y, fb.y);
  v.z = safeNumber(v.z, fb.z);
}
export function sanitizeObjectPosition(obj: any, fb = { x: 0, y: 1, z: 0 }) {
  if (!obj?.position) return;
  sanitizeVec3(obj.position, fb);
}
