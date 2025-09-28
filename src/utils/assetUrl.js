export function assetUrl(rel) {
  const globalBase =
    typeof globalThis !== 'undefined' && globalThis.__AthensAssetBase &&
    typeof globalThis.__AthensAssetBase.value === 'string'
      ? globalThis.__AthensAssetBase.value
      : null;
  const base = globalBase || import.meta.env.BASE_URL || '/';
  // normalize: no double slashes, keep nested folders
  return (base + String(rel ?? '').replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
}
