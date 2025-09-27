import { loadGround } from './scene/ground.js';
import { loadTreeLibrary, scatterTrees, updateTrees as updateTreeAnimations } from './vegetation/trees.js';
import { getAssetBase } from './utils/asset-paths.js';

const ATHENS_MAIN_SENTINEL = Symbol.for('athens.main.entrypoint');
const isAthensMainEntrypoint = (fn) => typeof fn === 'function' && fn[ATHENS_MAIN_SENTINEL];

const STATS_MODULE_ID = 'three/examples/jsm/libs/stats.module.js';
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '']);

let StatsConstructor = null;
let statsModuleError = null;

if (typeof document !== 'undefined') {
  try {
    const module = await import(STATS_MODULE_ID);
    StatsConstructor = module?.default ?? module;
  } catch (error) {
    statsModuleError = error;
  }
}

let statsInstance = null;
let statsVisible = false;
let statsWarned = false;

const DEV_LOG_GLOBAL_KEY = '__AthensDevLog';

const reportDevLog = (message, level = 'info') => {
  try {
    const globalObject = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
    if (!globalObject) {
      return false;
    }

    const devLog = globalObject[DEV_LOG_GLOBAL_KEY];
    if (devLog && typeof devLog.push === 'function') {
      devLog.push(message, level);
      return true;
    }

    if (typeof globalObject.updateAthensDevLog === 'function') {
      globalObject.updateAthensDevLog(message, level);
      return true;
    }
  } catch (_) {
    // noop
  }

  return false;
};

const isDomAvailable = () => typeof document !== 'undefined' && !!document.body;

const isDevEnvironment = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const { hostname = '', protocol = '', port = '' } = window.location || {};

  if (protocol === 'file:') {
    return true;
  }

  const normalizedHost = hostname.toLowerCase();

  if (DEV_HOSTS.has(normalizedHost)) {
    return true;
  }

  if (normalizedHost.endsWith('.local')) {
    return true;
  }

  return port !== '' && port !== '80' && port !== '443';
};

const warnStatsUnavailable = (error) => {
  if (statsWarned) {
    return;
  }
  statsWarned = true;
  if (error) {
    console.warn('Stats.js unavailable', error);
  } else {
    console.warn('Stats.js unavailable');
  }
};

const attachStatsDom = () => {
  if (!statsInstance || !statsInstance.dom || !isDomAvailable()) {
    return;
  }

  if (!statsInstance.dom.parentNode) {
    document.body.appendChild(statsInstance.dom);
  }
};

export function initPerformanceStats() {
  if (statsInstance) {
    attachStatsDom();
    return statsInstance;
  }

  if (typeof StatsConstructor !== 'function') {
    warnStatsUnavailable(statsModuleError);
    return null;
  }

  try {
    statsInstance = new StatsConstructor();
  } catch (error) {
    warnStatsUnavailable(error);
    statsInstance = null;
    return null;
  }

  statsInstance.dom.style.left = '0px';
  statsInstance.dom.style.top = '0px';

  statsVisible = isDevEnvironment();
  statsInstance.dom.style.display = statsVisible ? '' : 'none';

  attachStatsDom();

  if (typeof window !== 'undefined') {
    window.getStats = () => statsInstance;
    if (typeof window.toggleStatsVisibility !== 'function') {
      window.toggleStatsVisibility = toggleStatsVisibility;
    }
  }

  return statsInstance;
}

export function updatePerformanceStats() {
  if (!statsInstance) {
    return;
  }

  statsInstance.update();
}

export function toggleStatsVisibility(forceVisible) {
  const stats = statsInstance || initPerformanceStats();

  if (!stats) {
    return false;
  }

  if (typeof forceVisible === 'boolean') {
    statsVisible = forceVisible;
  } else {
    statsVisible = !statsVisible;
  }

  stats.dom.style.display = statsVisible ? '' : 'none';

  return statsVisible;
}

export function getStats() {
  return statsInstance;
}

if (typeof window !== 'undefined' && typeof window.getStats !== 'function') {
  window.getStats = () => statsInstance;
}

if (typeof window !== 'undefined' && typeof window.toggleStatsVisibility !== 'function') {
  window.toggleStatsVisibility = toggleStatsVisibility;
}
// --- Ground options (from codex/add-blended-ground-textures-and-districts-system)
let groundOptions = {};

export function configureGround(options = {}) {
  if (!options || typeof options !== 'object') {
    return;
  }
  groundOptions = { ...groundOptions, ...options };
}

// --- Tree system state (from main)
let treeLibraryState = null;
let groveGroup = null;
let treesInitialized = false;

// If your main branch had extra tree setup inside setupGround, you can merge it
// below after the ground is created. For now we keep the original ground setup:
async function ensureTrees(scene, renderer) {
  if (treesInitialized) {
    if (scene && groveGroup && !scene.children.includes(groveGroup)) {
      scene.add(groveGroup);
    }
    return treeLibraryState;
  }

  try {
    treeLibraryState = await loadTreeLibrary(renderer);
    groveGroup = scatterTrees({
      name: 'olive',
      area: { xMin: -500, xMax: 500, zMin: -500, zMax: 500 },
      count: 100,
      minDist: 7
    });

    if (scene && groveGroup && !scene.children.includes(groveGroup)) {
      scene.add(groveGroup);
    }
  } catch (error) {
    console.warn('[trees] Unable to initialize tree library.', error);
  }

  treesInitialized = true;
  return treeLibraryState;
}

export async function setupGround(scene, renderer) {
  const ground = await loadGround(scene, renderer, groundOptions);

  // Optionally integrate tree initialization here (if present on main):
  // if (!treesInitialized) {
  //   const { initTrees } = await import('./trees/init.js');
  //   ({ treeLibraryState, groveGroup } = await initTrees(scene, ground));
  //   treesInitialized = true;
  // }

  await ensureTrees(scene, renderer);
  return ground;
}

export function updateTrees(delta) {
  updateTreeAnimations(delta);
}

export function getTreeLibrary() {
  return treeLibraryState;
}

const ATHENS_INITIALIZER_SOURCE = Symbol.for('athens.initializer.source');

async function waitForAthensInitializer({ timeoutMs, pollIntervalMs = 50, warnAfterMs = 5000 } = {}) {
  if (typeof window === 'undefined') {
    return null;
  }

  const normalizedTimeout =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null;
  const normalizedPollInterval =
    typeof pollIntervalMs === 'number' && Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
      ? pollIntervalMs
      : 50;
  const normalizedWarnAfter =
    typeof warnAfterMs === 'number' && Number.isFinite(warnAfterMs) && warnAfterMs > 0 ? warnAfterMs : null;

  const resolveInitializer = () => {
    const candidates = [];

    if (typeof window.initializeAthens === 'function') {
      candidates.push({ fn: window.initializeAthens, source: 'window.initializeAthens' });
    }

    if (typeof window.runAthens === 'function') {
      candidates.push({ fn: window.runAthens, source: 'window.runAthens' });
    }

    for (const candidate of candidates) {
      if (candidate?.fn && !isAthensMainEntrypoint(candidate.fn)) {
        return candidate;
      }
    }

    return null;
  };

  let initializer = resolveInitializer();
  if (initializer) {
    return initializer;
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const hasTimeout = normalizedTimeout !== null;
    let hasWarned = false;

    let timeoutId = null;
    let listener = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (listener && typeof window.removeEventListener === 'function') {
        window.removeEventListener('athens:initializer-ready', listener);
        listener = null;
      }
    };

    const tick = () => {
      const candidate = resolveInitializer();
      if (candidate) {
        cleanup();
        resolve(candidate);
        return;
      }

      if (!hasWarned && normalizedWarnAfter !== null && Date.now() - start >= normalizedWarnAfter) {
        hasWarned = true;
        console.warn('[Athens] Waiting for initializer to become available…');
      }

      if (hasTimeout && Date.now() - start >= normalizedTimeout) {
        cleanup();
        resolve(null);
        return;
      }

      timeoutId = setTimeout(tick, normalizedPollInterval);
    };

    timeoutId = setTimeout(tick, normalizedPollInterval);

    if (typeof window.addEventListener === 'function') {
      listener = (event) => {
        const { detail } = event || {};
        const candidateFromEvent =
          detail && typeof detail.initializer === 'function' && !isAthensMainEntrypoint(detail.initializer)
            ? { fn: detail.initializer, source: detail.source || 'event:athens:initializer-ready' }
            : null;
        const candidate = candidateFromEvent || resolveInitializer();

        if (candidate) {
          cleanup();
          resolve(candidate);
        }
      };

      window.addEventListener('athens:initializer-ready', listener);
    }
  });
}

const describeInitializer = (initializer) => {
  if (typeof initializer !== 'function') {
    return 'unavailable';
  }

  const name = initializer.name || 'anonymous';
  return `${name}${initializer[ATHENS_MAIN_SENTINEL] ? ' [module]' : ''}`;
};

export async function main(opts = {}) {
  if (typeof window === 'undefined') {
    throw new Error('Athens main entry point is not available.');
  }

  const { waitForInitializerMs, waitForInitializerIntervalMs, waitForInitializerWarnAfterMs, ...forwardedOptions } =
    opts && typeof opts === 'object'
      ? opts
      : {};

  console.info('[Athens][Main] Resolving entry point');
  reportDevLog('Resolving entry point…');

  const assetBase = getAssetBase();
  console.info(`[Athens][Main] Assets base: ${assetBase}`);

  const initializerResult = await waitForAthensInitializer({
    timeoutMs: typeof waitForInitializerMs === 'number' ? waitForInitializerMs : undefined,
    pollIntervalMs:
      typeof waitForInitializerIntervalMs === 'number'
        ? waitForInitializerIntervalMs
        : undefined,
    warnAfterMs:
      typeof waitForInitializerWarnAfterMs === 'number' ? waitForInitializerWarnAfterMs : undefined
  });

  const initializer =
    typeof initializerResult === 'function'
      ? initializerResult
      : initializerResult && typeof initializerResult.fn === 'function'
        ? initializerResult.fn
        : null;

  const initializerSource =
    (initializerResult && typeof initializerResult === 'object' && initializerResult.source) ||
    initializer?.[ATHENS_INITIALIZER_SOURCE] ||
    'unknown';

  if (typeof initializer !== 'function') {
    console.error('[Athens][Main] No initializer function available.');
    reportDevLog('No initializer function available. Is window.initializeAthens defined?', 'error');
    throw new Error('Athens main entry point is not available.');
  }

  if (!initializer[ATHENS_INITIALIZER_SOURCE]) {
    try {
      initializer[ATHENS_INITIALIZER_SOURCE] = initializerSource;
    } catch (_) {
      // Non-writable target; ignore.
    }
  }

  console.info('[Athens][Main] Invoking initializer…', {
    initializer: describeInitializer(initializer),
    source: initializerSource
  });

  try {
    return await initializer(forwardedOptions);
  } catch (error) {
    console.error('[Athens][Main] Initializer failed', error);
    const friendlyMessage = error instanceof Error && error.message ? error.message : 'Check console for details.';
    if (!reportDevLog(`Initializer failed: ${friendlyMessage}`, 'error')) {
      reportDevLog('Initializer failed. Check console for details.', 'error');
    }
    throw error;
  }
}

main[ATHENS_MAIN_SENTINEL] = true;
try {
  main[ATHENS_INITIALIZER_SOURCE] = 'module:main';
} catch (_) {
  // Ignore non-writable assignment failures.
}

if (typeof window !== 'undefined') {
  try {
    if (typeof window.initializeAthens !== 'function') {
      window.initializeAthens = main;
      console.info('[Athens][Main] Exposed module main() as window.initializeAthens');
    } else {
      console.info('[Athens][Main] Detected existing window.initializeAthens');
    }
  } catch (error) {
    console.warn('[Athens][Main] Unable to coordinate window.initializeAthens', error);
  }
}
