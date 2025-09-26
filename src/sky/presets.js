import { resolvePreset as resolvePresetSafe, getDefaultPreset as getDefaultPresetSafe } from '../core/presetResolver.js';

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
  if (!normalized) {
    return null;
  }
  const alias = PRESET_ALIASES.get(normalized);
  if (alias) {
    return alias;
  }
  return KNOWN_PRESETS.find((preset) => preset.toLowerCase() === normalized) || null;
}

export function getDefaultPreset() {
  return getDefaultPresetSafe();
}

let warnedUnknownPreset = false;
export function resolvePreset(inputName) {
  const normalized = normalizePresetName(inputName);
  if (normalized) {
    return resolvePresetSafe(normalized);
  }
  const fallback = getDefaultPresetSafe();
  if (inputName && !warnedUnknownPreset) {
    console.warn('[Athens] Unknown sky preset:', inputName, '→ using', fallback);
    warnedUnknownPreset = true;
  }
  return fallback;
}
