const KNOWN_NAMES = [
  'High Noon',
  'Golden Dawn',
  'Golden Dusk',
  'Blue Hour',
  'Night Sky',
  'Starlit Night'
];

const ALIASES = new Map([
  ['starlit night', 'Starlit Night'],
  ['night sky', 'Starlit Night']
]);

let warnedUnknownName = false;

export function resolveName(input) {
  const defaultName = getDefaultName();

  if (!input || typeof input !== 'string') {
    return defaultName;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return defaultName;
  }

  const normalized = trimmed.toLowerCase();
  const alias = ALIASES.get(normalized);
  if (alias) {
    return alias;
  }

  const match = KNOWN_NAMES.find((name) => name.toLowerCase() === normalized);
  if (match) {
    return match === 'Night Sky' ? 'Starlit Night' : match;
  }

  if (!warnedUnknownName) {
    console.warn('[Athens] Unknown preset name provided:', input, '→ using', defaultName);
    warnedUnknownName = true;
  }

  return defaultName;
}

export function getDefaultName() {
  return 'High Noon';
}

