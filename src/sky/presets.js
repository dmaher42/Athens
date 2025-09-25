export const KNOWN_PRESETS = [
  'Golden Dawn',
  'Blue Hour',
  'High Noon',
  'Golden Dusk',
  'Starlit Night'
];

const PRESET_ALIASES = new Map(
  Object.entries({
    'night sky': 'Starlit Night'
  })
);

export function normalizePresetName(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }
  const normalized = name.trim().toLowerCase();
  const alias = PRESET_ALIASES.get(normalized);
  if (alias) {
    return alias;
  }
  return KNOWN_PRESETS.find((preset) => preset.toLowerCase() === normalized) || null;
}

export function getDefaultPreset() {
  if (KNOWN_PRESETS.includes('Starlit Night')) {
    return 'Starlit Night';
  }
  if (KNOWN_PRESETS.includes('Night Sky')) {
    return 'Night Sky';
  }
  if (KNOWN_PRESETS.includes('High Noon')) {
    return 'High Noon';
  }
  return KNOWN_PRESETS[0] || 'High Noon';
}

let warnedUnknownPreset = false;
export function resolvePreset(inputName) {
  const normalized = normalizePresetName(inputName);
  if (normalized) {
    return normalized;
  }
  const fallback = getDefaultPreset();
  if (inputName && !warnedUnknownPreset) {
    console.warn('[Athens] Unknown sky preset:', inputName, '→ using', fallback);
    warnedUnknownPreset = true;
  }
  return fallback;
}
