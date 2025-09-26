const KNOWN_PRESETS = ['High Noon', 'Golden Dawn', 'Golden Dusk', 'Blue Hour', 'Night Sky'];

const CANONICAL_PRESETS = new Map([
  ['high noon', 'High Noon'],
  ['golden dawn', 'Golden Dawn'],
  ['golden dusk', 'Golden Dusk'],
  ['blue hour', 'Blue Hour'],
  ['night sky', 'Starlit Night'],
  ['starlit night', 'Starlit Night']
]);

let warnedUnknownPreset = false;

export function resolvePreset(name) {
  if (!name || typeof name !== 'string') {
    return getDefaultPreset();
  }

  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return getDefaultPreset();
  }

  const canonical = CANONICAL_PRESETS.get(normalized);
  if (canonical) {
    return canonical;
  }

  const found = KNOWN_PRESETS.find((preset) => preset.toLowerCase() === normalized);
  if (found) {
    return CANONICAL_PRESETS.get(found.toLowerCase()) || found;
  }

  if (!warnedUnknownPreset) {
    console.warn('[Athens] Unknown preset name:', name, '→ defaulting');
    warnedUnknownPreset = true;
  }

  return getDefaultPreset();
}

export function getDefaultPreset() {
  return 'High Noon';
}

export { KNOWN_PRESETS };
