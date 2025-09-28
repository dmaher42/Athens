export function assetUrl(rel) {
  const base = import.meta.env.BASE_URL || '/';
  return (base + rel.replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
}
