import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveBaseUrl, joinPath } from './utils/baseUrl.js';
import { logger } from './utils/logger.ts';

const base = resolveBaseUrl();

export const ARISTOTLE_CANDIDATES = [
  joinPath(base, 'models/buildings/aristotle_tomb_in_macedonia_greece.glb'),
  // fallbacks:
  joinPath(base, 'models/landmarks/aristotle_tomb.glb'),
  joinPath(base, 'models/landmarks/aristotle_tomb_in_macedonia_greece.glb')
];

export const POSEIDON_CANDIDATES = [
  joinPath(base, 'models/buildings/poseidon_temple_at_sounion_greece.glb'),
  // fallbacks:
  joinPath(base, 'models/landmarks/poseidon_temple.glb'),
  joinPath(base, 'models/landmarks/poseidon_temple_at_sounion_greece.glb')
];

export const AKROPOL_CANDIDATES = [
  joinPath(base, 'models/buildings/Akropol.glb'),
  // fallbacks:
  joinPath(base, 'models/landmarks/akropol.glb'),
  joinPath(base, 'models/landmarks/Akropol.glb')
];

const loggedMissing = new Set();

export async function headOk(url) {
  if (typeof fetch !== 'function') {
    return false;
  }
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadGLBWithFallbacks(loader, urls = [], options = {}) {
  let activeLoader = loader;
  const { loaderFactory } = options;
  const ensureLoader = () => {
    if (activeLoader && typeof activeLoader.loadAsync === 'function') {
      return activeLoader;
    }
    if (typeof loaderFactory === 'function') {
      activeLoader = loaderFactory();
      if (activeLoader && typeof activeLoader.loadAsync === 'function') {
        return activeLoader;
      }
    }
    activeLoader = createLoader();
    return activeLoader;
  };

  const tried = [];
  for (const candidate of urls) {
    if (!candidate) {
      continue;
    }

    const normalized = String(candidate);
    if (!(await headOk(normalized))) {
      tried.push([normalized, 404]);
      continue;
    }

    try {
      const loaderInstance = ensureLoader();
      if (!loaderInstance || typeof loaderInstance.loadAsync !== 'function') {
        tried.push([normalized, 'no-loader']);
        continue;
      }
      return await loaderInstance.loadAsync(normalized);
    } catch (error) {
      tried.push([normalized, 'load-fail']);
      if (logger && typeof logger.debug === 'function') {
        logger.debug('[GLB] Candidate failed to load.', normalized, error);
      }
    }
  }

  if (tried.length) {
    const key = tried.map(([url]) => url).join('|');
    if (!loggedMissing.has(key)) {
      loggedMissing.add(key);
      const targets = tried.map(([url]) => url);
      if (logger && typeof logger.warn === 'function') {
        logger.warn('[GLB] No reachable candidate:', targets);
      } else {
        console.warn('[GLB] No reachable candidate:', targets);
      }
    }
  }

  return null;
}

function createLoader() {
  return new GLTFLoader();
}

export async function prefetchLandmarkModels({ loaderFactory } = {}) {
  if (typeof window === 'undefined' && typeof fetch === 'undefined') {
    return {
      aristotle: null,
      poseidon: null,
      akropol: null
    };
  }

  const factory = typeof loaderFactory === 'function' ? loaderFactory : createLoader;

  const aristotle = await loadGLBWithFallbacks(null, ARISTOTLE_CANDIDATES, { loaderFactory: factory });
  const poseidon = await loadGLBWithFallbacks(null, POSEIDON_CANDIDATES, { loaderFactory: factory });
  const akropol = await loadGLBWithFallbacks(null, AKROPOL_CANDIDATES, { loaderFactory: factory });

  return { aristotle, poseidon, akropol };
}
