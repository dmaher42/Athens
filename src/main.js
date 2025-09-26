import { loadGround } from './scene/ground.js';
import { loadTreeLibrary, scatterTrees, updateTrees as updateTreeAnimations } from './vegetation/trees.js';

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

export async function main(options = {}) {
  if (typeof window !== 'undefined') {
    if (typeof window.initializeAthens === 'function') {
      return window.initializeAthens(options);
    }
    if (typeof window.runAthens === 'function') {
      return window.runAthens(options);
    }
  }

  throw new Error('Athens main entry point is not available.');
}
