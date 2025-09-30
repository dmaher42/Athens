import * as THREE from 'three';
import { initSky, setSky, reapplySky } from './SkyManager.ts';

const DEFAULT_BACKGROUND_COLOR = 0x202834;

const MODE_CONFIG = {
  dawn: { path: 'assets/sky/dawn.jpg', fallbackColor: DEFAULT_BACKGROUND_COLOR },
  day: { path: 'assets/sky/day.jpg', fallbackColor: DEFAULT_BACKGROUND_COLOR },
  dusk: { path: 'assets/sky/dusk.jpg', fallbackColor: DEFAULT_BACKGROUND_COLOR },
  night: { path: 'assets/sky/night.jpg', fallbackColor: DEFAULT_BACKGROUND_COLOR }
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

const loggedFailures = new Set();
let activeRenderer = null;
let activeScene = null;
let currentMode = null;
let skyEnabled = true;
let hotkeyAttached = false;
let manualSkyOverride = null;
let hasLoadedSkyTexture = false;
let lastSuccessfulMode = null;
let lastSuccessfulPath = null;

function resolveMode(mode) {
  if (!mode) {
    return null;
  }
  const key = `${mode}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const alias = MODE_ALIASES.get(key);
  if (alias) {
    return alias;
  }
  if (MODE_CONFIG[key]) {
    return key;
  }
  return null;
}

function normalizeMode(mode) {
  return resolveMode(mode) ?? 'day';
}

function detectSkyOverride() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('sky');
    return resolveMode(requested);
  } catch (_) {
    return null;
  }
}

manualSkyOverride = detectSkyOverride();

function applySolidBackground(hex) {
  if (activeScene) {
    activeScene.background = new THREE.Color(hex);
    activeScene.environment = null;
  }
  if (activeRenderer) {
    activeRenderer.setClearColor(hex, 1);
  }
}

function applyFallbackForMode(mode) {
  if (hasLoadedSkyTexture) {
    return;
  }
  const config = MODE_CONFIG[mode] || {};
  const color = config.fallbackColor ?? DEFAULT_BACKGROUND_COLOR;
  applySolidBackground(color);
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

async function loadSkyForMode(mode) {
  const config = MODE_CONFIG[mode] || null;
  if (!config?.path) {
    applyFallbackForMode(mode);
    return false;
  }
  if (!activeRenderer || !activeScene) {
    return false;
  }

  initSky(activeRenderer);

  try {
    const resource = await setSky(activeScene, config.path);
    if (resource) {
      hasLoadedSkyTexture = true;
      lastSuccessfulMode = mode;
      lastSuccessfulPath = config.path;
      return true;
    }
  } catch (error) {
    if (!loggedFailures.has(mode)) {
      console.warn(`[timeSky] Failed to load sky texture for "${mode}" (${config.path}).`, error);
      loggedFailures.add(mode);
    }
  }

  if (!hasLoadedSkyTexture) {
    applyFallbackForMode(mode);
  }
  return false;
}

export async function createTimeSky(renderer, scene, initial = 'day') {
  activeRenderer = renderer || activeRenderer;
  activeScene = scene || activeScene;
  if (activeRenderer) {
    initSky(activeRenderer);
  }
  if (activeScene && skyEnabled && hasLoadedSkyTexture) {
    reapplySky(activeScene);
  }

  const hasOverride = Boolean(manualSkyOverride);
  const normalized = hasOverride ? manualSkyOverride : normalizeMode(initial);
  currentMode = normalized;

  if (!skyEnabled) {
    applySolidBackground(DEFAULT_BACKGROUND_COLOR);
    return { mode: currentMode };
  }

  await loadSkyForMode(normalized);
  return { mode: currentMode };
}

export async function setTimeOfDay(mode) {
  if (manualSkyOverride) {
    return currentMode ?? manualSkyOverride;
  }
  const normalized = normalizeMode(mode);
  const previousMode = currentMode;
  const success = skyEnabled ? await loadSkyForMode(normalized) : false;
  if (success) {
    currentMode = normalized;
  } else if (previousMode == null) {
    currentMode = normalized;
  }
  return currentMode ?? previousMode ?? normalized;
}

export function getTimeOfDay() {
  return currentMode ?? lastSuccessfulMode;
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
    applySolidBackground(DEFAULT_BACKGROUND_COLOR);
  } else if (hasLoadedSkyTexture && lastSuccessfulPath) {
    reapplySky(activeScene);
  } else if (currentMode) {
    loadSkyForMode(currentMode).catch(() => {});
  } else if (lastSuccessfulMode) {
    loadSkyForMode(lastSuccessfulMode).catch(() => {});
  } else {
    applyFallbackForMode('day');
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
