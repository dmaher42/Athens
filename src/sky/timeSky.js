import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.js';
import { runIdle } from '../utils/idle.js';

const MODE_CONFIG = {
  dawn: { path: 'assets/sky/dawn.jpg', fallbackColor: 0x335577 },
  day: { path: 'assets/sky/day.jpg', fallbackColor: 0x87ceeb },
  dusk: { path: 'assets/sky/dusk.jpg', fallbackColor: 0x553344 },
  night: { path: 'assets/sky/night.jpg', fallbackColor: 0x0b0e19 }
};

const MODE_ALIASES = new Map(
  Object.entries({
    dawn: 'dawn',
    sunrise: 'dawn',
    golden_dawn: 'dawn',
    goldenhour: 'dusk',
    golden_hour: 'dusk',
    golden_dusk: 'dusk',
    blue_hour: 'dusk',
    bluehour: 'dusk',
    sunset: 'dusk',
    dusk: 'dusk',
    evening: 'dusk',
    day: 'day',
    high_noon: 'day',
    noon: 'day',
    midday: 'day',
    night: 'night',
    midnight: 'night',
    starlit_night: 'night'
  })
);

const cache = new Map();
const loadTasks = new Map();
const loggedFailures = new Set();
let pmremGenerator = null;
let activeRenderer = null;
let activeScene = null;
let currentMode = null;
let currentEntry = null;
let skyEnabled = true;
let hotkeyAttached = false;

function ensureColorSpace(texture) {
  if (!texture) return;
  if ('colorSpace' in texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in texture) {
    texture.encoding = THREE.sRGBEncoding;
  }
}

function ensurePmrem(renderer) {
  if (!pmremGenerator && renderer) {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
  }
  return pmremGenerator;
}

function normalizeMode(mode) {
  if (!mode) return 'day';
  const key = `${mode}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const alias = MODE_ALIASES.get(key);
  if (alias) return alias;
  if (MODE_CONFIG[key]) return key;
  return 'day';
}

function fallbackEntry(mode) {
  const config = MODE_CONFIG[mode] || {};
  const color = new THREE.Color(config.fallbackColor ?? 0x000000);
  return { background: color, envMap: null, envTarget: null, mode };
}

function updateEnvironment(entry) {
  if (!activeScene || !entry) return;
  if (entry.envMap && entry.mode === currentMode) {
    activeScene.environment = entry.envMap;
  }
}

function schedulePmrem(entry, texture) {
  const generator = ensurePmrem(activeRenderer);
  if (!generator || !entry || !texture) return;
  runIdle(() => {
    try {
      const target = generator.fromEquirectangular(texture);
      entry.envTarget = target;
      entry.envMap = target?.texture || null;
      updateEnvironment(entry);
    } catch (error) {
      console.warn(`[timeSky] Failed to generate environment map for "${entry.mode}".`, error);
    }
  });
}

// Unified applySky that respects the skyEnabled toggle and tracks currentEntry/mode
function applySky(entry) {
  if (!activeScene || !entry) return;
  currentEntry = entry;
  currentMode = entry.mode;

  if (!skyEnabled) {
    activeScene.background = null;
    activeScene.environment = null;
    return;
  }

  if (entry.background?.isTexture) {
    activeScene.background = entry.background;
  } else if (entry.background instanceof THREE.Color) {
    activeScene.background = entry.background;
  } else {
    activeScene.background = null;
  }
  activeScene.environment = entry.envMap || null;
}

function notifySkyEnabledChange() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('athens:sky-enabled-changed', { detail: { enabled: skyEnabled } }));
  } catch (_) {
    // ignore
  }
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('Image constructor is not available in this environment.'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch (error) {
        console.warn(`[timeSky] Image decode warning for ${url}`, error);
      }
      cleanup();
      resolve(img);
    };
    img.onerror = (event) => {
      cleanup();
      reject(event instanceof ErrorEvent ? event.error || event : event || new Error('Image failed to load.'));
    };
    img.src = url;
  });
}

async function loadTexture(url) {
  const image = await loadImageElement(url);
  const texture = new THREE.Texture(image);
  texture.needsUpdate = true;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  ensureColorSpace(texture);
  return texture;
}

async function loadSky(mode) {
  if (cache.has(mode)) return cache.get(mode);
  if (loadTasks.has(mode)) return loadTasks.get(mode);

  const task = (async () => {
    const config = MODE_CONFIG[mode];
    if (!config?.path) {
      const entry = fallbackEntry(mode);
      cache.set(mode, entry);
      return entry;
    }

    const url = assetUrl(config.path);

    try {
      const texture = await loadTexture(url);
      texture.name = `Sky:${mode}`;
      const entry = { background: texture, envMap: null, envTarget: null, mode };
      cache.set(mode, entry);
      schedulePmrem(entry, texture);
      return entry;
    } catch (error) {
      if (!loggedFailures.has(mode)) {
        console.warn(`[timeSky] Failed to load sky texture for "${mode}" (${url}). Falling back to solid color.`);
        loggedFailures.add(mode);
      }
      const entry = fallbackEntry(mode);
      cache.set(mode, entry);
      return entry;
    }
  })().finally(() => {
    loadTasks.delete(mode);
  });

  loadTasks.set(mode, task);
  return task;
}

export async function createTimeSky(renderer, scene, initial = 'day') {
  activeRenderer = renderer || activeRenderer;
  activeScene = scene || activeScene;
  ensurePmrem(activeRenderer);

  const normalized = normalizeMode(initial);
  const entry = await loadSky(normalized);
  applySky(entry);
  updateEnvironment(entry);

  // Preload other modes in the background
  Object.keys(MODE_CONFIG).forEach((mode) => {
    if (mode !== normalized) {
      loadSky(mode).catch(() => {});
    }
  });

  return { mode: currentMode };
}

export async function setTimeOfDay(mode) {
  const normalized = normalizeMode(mode);
  const entry = await loadSky(normalized);
  applySky(entry);
  updateEnvironment(entry);
  return currentMode;
}

export function getTimeOfDay() {
  return currentMode;
}

export function isSkyEnabled() {
  return skyEnabled;
}

export function setSkyEnabled(enabled) {
  const normalized = Boolean(enabled);
  if (normalized === skyEnabled) return skyEnabled;
  skyEnabled = normalized;

  if (!activeScene) {
    notifySkyEnabledChange();
    return skyEnabled;
  }

  if (!skyEnabled) {
    activeScene.background = null;
    activeScene.environment = null;
  } else if (currentEntry) {
    applySky(currentEntry);
  } else if (currentMode) {
    loadSky(currentMode)
      .then((entry) => {
        if (skyEnabled) applySky(entry);
      })
      .catch(() => {});
  }

  notifySkyEnabledChange();
  return skyEnabled;
}

export function toggleSkyEnabled(force) {
  if (typeof force === 'boolean') {
    return setSkyEnabled(force);
  }
  return setSkyEnabled(!skyEnabled);
}

export function attachTimeHotkeys(win = typeof window !== 'undefined' ? window : null) {
  if (!win || hotkeyAttached) return undefined;
  const handler = (event) => {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    switch (key) {
      case '1':
        setTimeOfDay('dawn');
        break;
      case '2':
        setTimeOfDay('day');
        break;
      case '3':
        setTimeOfDay('dusk');
        break;
      case '4':
        setTimeOfDay('night');
        break;
      case 'k':
        toggleSkyEnabled();
        break;
      default:
        break;
    }
  };
  win.addEventListener('keydown', handler);
  hotkeyAttached = true;
  return () => {
    hotkeyAttached = false;
    win.removeEventListener('keydown', handler);
  };
}
