import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.js';

const DEFAULT_BACKGROUND_COLOR = 0x202834;

const MODE_CONFIG = {
  dawn: { fallbackColor: DEFAULT_BACKGROUND_COLOR },
  day: { fallbackColor: DEFAULT_BACKGROUND_COLOR },
  dusk: { fallbackColor: DEFAULT_BACKGROUND_COLOR },
  night: { fallbackColor: DEFAULT_BACKGROUND_COLOR }
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

const loader = new THREE.TextureLoader();
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

const DEFAULT_BACKGROUND = new THREE.Color(DEFAULT_BACKGROUND_COLOR);

function applyDefaultBackground() {
  if (!activeScene) {
    return;
  }
  activeScene.background = DEFAULT_BACKGROUND.clone();
  activeScene.environment = null;
}

function ensureColorSpace(texture) {
  if (!texture) {
    return;
  }
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
  if (!mode) {
    return 'day';
  }
  const key = `${mode}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const alias = MODE_ALIASES.get(key);
  if (alias) {
    return alias;
  }
  if (MODE_CONFIG[key]) {
    return key;
  }
  return 'day';
}

function fallbackEntry(mode) {
  const config = MODE_CONFIG[mode] || {};
  const color = new THREE.Color(config.fallbackColor ?? DEFAULT_BACKGROUND_COLOR);
  return { background: color, envMap: null, mode };
}

async function loadSky(mode) {
  if (cache.has(mode)) {
    return cache.get(mode);
  }
  if (loadTasks.has(mode)) {
    return loadTasks.get(mode);
  }

  const task = new Promise((resolve) => {
    const config = MODE_CONFIG[mode];
    if (!config?.path) {
      const entry = fallbackEntry(mode);
      cache.set(mode, entry);
      resolve(entry);
      return;
    }

    const url = assetUrl(config.path);

    loader.load(
      url,
      (texture) => {
        ensureColorSpace(texture);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.needsUpdate = true;

        const generator = ensurePmrem(activeRenderer);
        let envTarget = null;
        let envMap = null;
        if (generator) {
          envTarget = generator.fromEquirectangular(texture);
          envMap = envTarget.texture;
        }

        const entry = {
          background: texture,
          envMap,
          envTarget,
          mode
        };
        cache.set(mode, entry);
        resolve(entry);
      },
      undefined,
      () => {
        if (!loggedFailures.has(mode)) {
          console.warn(`[timeSky] Failed to load sky texture for "${mode}" (${url}). Falling back to solid color.`);
          loggedFailures.add(mode);
        }
        const entry = fallbackEntry(mode);
        cache.set(mode, entry);
        resolve(entry);
      }
    );
  }).finally(() => {
    loadTasks.delete(mode);
  });

  loadTasks.set(mode, task);
  return task;
}

function applySky(entry) {
  if (!activeScene || !entry) {
    return;
  }
  currentEntry = entry;
  currentMode = entry.mode;
  if (!skyEnabled) {
    applyDefaultBackground();
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
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent('athens:sky-enabled-changed', { detail: { enabled: skyEnabled } }));
  } catch (_) {
    // ignored
  }
}

export async function createTimeSky(renderer, scene, initial = 'day') {
  activeRenderer = renderer || activeRenderer;
  activeScene = scene || activeScene;
  ensurePmrem(activeRenderer);
  const normalized = normalizeMode(initial);
  const entry = await loadSky(normalized);
  applySky(entry);

  // Prefetch other modes without blocking.
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
  if (normalized === skyEnabled) {
    return skyEnabled;
  }
  skyEnabled = normalized;
  if (!activeScene) {
    notifySkyEnabledChange();
    return skyEnabled;
  }
  if (!skyEnabled) {
    applyDefaultBackground();
  } else if (currentEntry) {
    applySky(currentEntry);
  } else if (currentMode) {
    loadSky(currentMode)
      .then((entry) => {
        if (skyEnabled) {
          applySky(entry);
        }
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
  if (!win || hotkeyAttached) {
    return undefined;
  }
  const handler = (event) => {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }
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
        return;
    }
  };
  win.addEventListener('keydown', handler);
  hotkeyAttached = true;
  return () => {
    win.removeEventListener('keydown', handler);
    hotkeyAttached = false;
  };
}
