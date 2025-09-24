// src/sky/photoSkydome.js
import THREE from '../three.js';

const sharedTextureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const ENVIRONMENT_OPACITY_THRESHOLD = 0.6;

function normalizeSources(list) {
  const seen = new Set();
  const normalized = [];
  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (!entry) return;
    const item = typeof entry === 'string' ? { url: entry } : entry;
    const url = item?.url;
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    normalized.push({ ...item });
  });
  return normalized;
}

async function loadTextureWithCache(url, loader = sharedTextureLoader) {
  if (!url) {
    throw new Error('PhotoSkydome: invalid texture URL.');
  }
  if (!textureCache.has(url)) {
    const promise = loader.loadAsync(url)
      .then((texture) => {
        if ('SRGBColorSpace' in THREE) {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else if ('sRGBEncoding' in THREE) {
          texture.encoding = THREE.sRGBEncoding;
        }
        return texture;
      })
      .catch((error) => {
        textureCache.delete(url);
        throw error;
      });
    textureCache.set(url, promise);
  }
  return textureCache.get(url);
}

async function loadTextureSequence(sources, loader) {
  let lastError = null;
  for (const source of sources) {
    if (!source?.url) {
      continue;
    }
    try {
      const texture = await loadTextureWithCache(source.url, loader);
      return { texture, source };
    } catch (error) {
      lastError = error;
      const label = source.label ? ` ("${source.label}")` : '';
      console.warn(`PhotoSkydome: failed to load texture${label} from ${source.url}`, error);
    }
  }
  throw lastError || new Error('Unable to load any photo skydome texture.');
}

async function prefetchTextureSources(sources, loader) {
  const normalized = normalizeSources(sources);
  await Promise.all(normalized.map(async (source) => {
    try {
      await loadTextureWithCache(source.url, loader);
    } catch (error) {
      const label = source.label ? ` ("${source.label}")` : '';
      console.debug(`PhotoSkydome: prefetch skipped for${label} ${source.url}`, error);
    }
  }));
}

export async function createPhotoSkydome({
  scene,
  renderer,
  url = new URL('./milkyway.jpg', import.meta.url).href,
  sources = null,
  radius = 5000,
  initialYawDeg = 0,
  loader = null
}) {
  const textureLoader = loader instanceof THREE.Loader ? loader : sharedTextureLoader;
  const initialSources = Array.isArray(sources) && sources.length > 0
    ? normalizeSources(sources)
    : normalizeSources(url ? [{ url, label: 'default sky texture' }] : []);

  if (initialSources.length === 0) {
    throw new Error('No sky texture source provided for photo skydome.');
  }

  const { texture: initialTexture, source: initialSource } = await loadTextureSequence(initialSources, textureLoader);

  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    map: initialTexture,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'PhotoSkydome';
  dome.renderOrder = -1000;
  dome.rotation.y = THREE.MathUtils.degToRad(initialYawDeg);
  dome.userData.skyTextureSource = initialSource;
  scene.add(dome);

  let defaultSources = initialSources;
  let currentTexture = initialTexture;
  let currentSource = initialSource;
  let currentOpacity = 0;
  let envRenderTarget = null;
  let envTexture = null;
  let loadToken = 0;

  const updateEnvironmentVisibility = () => {
    if (!scene) return;
    if (currentOpacity >= ENVIRONMENT_OPACITY_THRESHOLD && envTexture) {
      scene.environment = envTexture;
    } else if (scene.environment === envTexture) {
      scene.environment = null;
    }
  };

  const refreshEnvironment = () => {
    if (!renderer || !currentTexture) {
      if (envRenderTarget) {
        envRenderTarget.dispose();
        envRenderTarget = null;
      }
      envTexture = null;
      updateEnvironmentVisibility();
      return null;
    }

    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromEquirectangular(currentTexture);
    pmrem.dispose();

    if (envRenderTarget) {
      envRenderTarget.dispose();
    }
    envRenderTarget = target;
    envTexture = target.texture;
    updateEnvironmentVisibility();
    return envTexture;
  };

  const applyTexture = (texture, source) => {
    currentTexture = texture;
    currentSource = source;
    material.map = texture;
    if (texture) {
      texture.needsUpdate = true;
    }
    material.needsUpdate = true;
    dome.userData.skyTextureSource = source;
    refreshEnvironment();
  };

  const setOpacity = (amount) => {
    const clamped = THREE.MathUtils.clamp(amount, 0, 1);
    currentOpacity = clamped;
    material.opacity = clamped;
    updateEnvironmentVisibility();
  };

  applyTexture(initialTexture, initialSource);
  setOpacity(0);

  return {
    mesh: dome,
    get texture() {
      return currentTexture;
    },
    get source() {
      return currentSource;
    },
    get opacity() {
      return currentOpacity;
    },
    setAmount(amount) {
      setOpacity(amount);
    },
    setYaw(deg) {
      dome.rotation.y = THREE.MathUtils.degToRad(deg);
    },
    async swapTexture({ url: overrideUrl, sources: overrideSources = [], label } = {}) {
      const combined = [];
      if (overrideUrl) {
        combined.push({ url: overrideUrl, label });
      }
      if (Array.isArray(overrideSources)) {
        combined.push(...overrideSources);
      }
      const candidateSources = normalizeSources(combined.length > 0 ? combined : defaultSources);
      if (candidateSources.length === 0) {
        throw new Error('Photo skydome swapTexture called without any sources.');
      }

      const requestId = ++loadToken;
      const { texture, source } = await loadTextureSequence(candidateSources, textureLoader);
      if (requestId !== loadToken) {
        return null;
      }
      defaultSources = candidateSources;
      applyTexture(texture, source);
      return { texture, source };
    },
    async prefetchSources(list = []) {
      await prefetchTextureSources(list, textureLoader);
    },
    refreshEnvironmentMap() {
      return refreshEnvironment();
    },
    refreshEnvironment() {
      return refreshEnvironment();
    },
    dispose() {
      scene.remove(dome);
      geometry.dispose();
      material.dispose();
      if (envRenderTarget) {
        envRenderTarget.dispose();
        envRenderTarget = null;
      }
    }
  };
}
