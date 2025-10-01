const DEFAULT_KEYBOARD_MANIFEST = Object.freeze({
  flyToggle: ['KeyF', 'KeyX'],
  flyUp: ['Space', 'KeyE'],
  flyDown: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyQ', 'KeyC']
});

let manifest = {
  flyToggle: [...DEFAULT_KEYBOARD_MANIFEST.flyToggle],
  flyUp: [...DEFAULT_KEYBOARD_MANIFEST.flyUp],
  flyDown: [...DEFAULT_KEYBOARD_MANIFEST.flyDown]
};

let manifestKeySet = buildKeySet(manifest);

function buildKeySet(source) {
  const set = new Set();
  if (!source || typeof source !== 'object') {
    return set;
  }
  Object.values(source).forEach((codes) => {
    if (!Array.isArray(codes)) {
      return;
    }
    codes.forEach((code) => {
      if (typeof code === 'string' && code) {
        set.add(code);
      }
    });
  });
  return set;
}

function uniqueCodes(list) {
  const seen = new Set();
  const result = [];
  if (!Array.isArray(list)) {
    return result;
  }
  for (const value of list) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function normalizeManifestEntry(value) {
  if (!value && value !== 0) {
    return { codes: [], mode: 'extend' };
  }
  if (typeof value === 'string') {
    return { codes: uniqueCodes([value]), mode: 'extend' };
  }
  if (Array.isArray(value)) {
    return { codes: uniqueCodes(value), mode: 'extend' };
  }
  if (typeof value === 'object') {
    const mode = value.mode === 'replace' ? 'replace' : 'extend';
    const codes = Array.isArray(value.keys) ? uniqueCodes(value.keys) : [];
    return { codes, mode };
  }
  return { codes: [], mode: 'extend' };
}

function rebuildManifestKeySet() {
  manifestKeySet = buildKeySet(manifest);
}

export function getKeyboardManifest() {
  const copy = {};
  Object.entries(manifest).forEach(([action, codes]) => {
    copy[action] = Array.isArray(codes) ? [...codes] : [];
  });
  return copy;
}

export function getManifestActionCodes(action) {
  if (!action || typeof action !== 'string') {
    return [];
  }
  const codes = manifest[action];
  return Array.isArray(codes) ? [...codes] : [];
}

export function hasManifestCode(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return false;
  }
  return manifestKeySet.has(code);
}

export function getManifestKeySet() {
  return new Set(manifestKeySet);
}

export function extendKeyboardManifest(overrides = {}) {
  if (!overrides || typeof overrides !== 'object') {
    return getKeyboardManifest();
  }
  let mutated = false;
  Object.entries(overrides).forEach(([action, value]) => {
    if (!action || typeof action !== 'string') {
      return;
    }
    const { codes, mode } = normalizeManifestEntry(value);
    if (!codes.length) {
      return;
    }
    const existing = Array.isArray(manifest[action]) ? manifest[action] : [];
    let next = [];
    if (mode === 'replace') {
      next = uniqueCodes(codes);
    } else {
      next = uniqueCodes([...existing, ...codes]);
    }
    if (!arraysEqual(existing, next)) {
      manifest[action] = next;
      mutated = true;
    }
  });
  if (mutated) {
    rebuildManifestKeySet();
  }
  return getKeyboardManifest();
}

export function isActionActive(keyboard, action) {
  if (!keyboard || typeof keyboard.isDown !== 'function' || !action) {
    return false;
  }
  const codes = getManifestActionCodes(action);
  if (!codes.length) {
    return false;
  }
  for (let i = 0; i < codes.length; i += 1) {
    if (keyboard.isDown(codes[i])) {
      return true;
    }
  }
  return false;
}

export function resetKeyboardManifest() {
  manifest = {
    flyToggle: [...DEFAULT_KEYBOARD_MANIFEST.flyToggle],
    flyUp: [...DEFAULT_KEYBOARD_MANIFEST.flyUp],
    flyDown: [...DEFAULT_KEYBOARD_MANIFEST.flyDown]
  };
  rebuildManifestKeySet();
}

export { DEFAULT_KEYBOARD_MANIFEST };
