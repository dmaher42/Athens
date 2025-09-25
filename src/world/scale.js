const MIN_COMPRESSION = 0.25;
const MAX_COMPRESSION = 1.0;
const DEFAULT_COMPRESSION = 0.6;

export let WORLD_COMPRESSION = DEFAULT_COMPRESSION;

export function setWorldCompression(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    WORLD_COMPRESSION = Math.min(MAX_COMPRESSION, Math.max(MIN_COMPRESSION, numeric));
  }
  return WORLD_COMPRESSION;
}

export function getWorldCompression() {
  return WORLD_COMPRESSION;
}

export function applyCompressionToVector3(vector) {
  if (!vector || typeof vector.x !== 'number' || typeof vector.z !== 'number') {
    return vector;
  }

  const factor = getWorldCompression();
  vector.x *= factor;
  vector.z *= factor;
  return vector;
}

if (typeof window !== 'undefined') {
  window.setWorldCompression = setWorldCompression;
}
