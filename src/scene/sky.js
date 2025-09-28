import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { loadTextureAsyncWithFallback } from '../utils/fail-soft-loaders.js';
import { createPhotoSkydome } from '../sky/photoSkydome.js';
import { resolvePreset as resolveSkyPreset } from '../sky/presets.js';

const BUNDLED_SKY_BASE = new URL('../sky/', import.meta.url);

function bundledSkyAsset(path) {
  try {
    return new URL(path, BUNDLED_SKY_BASE).href;
  } catch (error) {
    console.warn('[sky] Failed to resolve bundled sky asset', path, error);
    return null;
  }
}

function normalizeSkyAlias(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function externalSkyAsset(filename) {
  if (!filename) {
    return null;
  }
  const sanitized = `${filename}`.trim().replace(/^\/+/, '');
  if (!sanitized) {
    return null;
  }
  return resolveAssetUrl(`assets/sky/${sanitized}`);
}

function createSkySources(primaryFiles = [], fallbackBundled = [], labelPrefix = 'Sky panorama') {
  const seen = new Set();
  const sources = [];
  const pushEntry = (url, label) => {
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    sources.push(label ? { url, label } : { url });
  };

  const formatLabel = (file, prefix) => {
    if (!prefix) {
      return file ? `Sky panorama (${file})` : 'Sky panorama';
    }
    return file ? `${prefix} (${file})` : prefix;
  };

  (Array.isArray(primaryFiles) ? primaryFiles : [primaryFiles]).forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      pushEntry(externalSkyAsset(entry), formatLabel(entry, labelPrefix));
      return;
    }
    if (typeof entry === 'object') {
      const url = entry.url ?? externalSkyAsset(entry.file ?? entry.path ?? '');
      const label = entry.label ?? labelPrefix;
      pushEntry(url, label);
    }
  });

  const fallbackLabelPrefix = labelPrefix ? `${labelPrefix} fallback` : 'Sky panorama fallback';
  (Array.isArray(fallbackBundled) ? fallbackBundled : [fallbackBundled]).forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      pushEntry(bundledSkyAsset(entry), formatLabel(entry, fallbackLabelPrefix));
      return;
    }
    if (typeof entry === 'object') {
      const url = entry.url ?? bundledSkyAsset(entry.file ?? entry.path ?? '');
      const label = entry.label ?? fallbackLabelPrefix;
      pushEntry(url, label);
    }
  });

  return sources;
}

const PHOTO_PRESET_DEFINITIONS = [
  {
    key: 'high_noon',
    name: 'High Noon',
    environment: 'day',
    baseFiles: ['high_noon.jpg'],
    fallbackBundled: ['high_noon.jpg', 'sunset.jpg'],
    radius: 18000,
    aliases: ['day', 'noon', 'midday', 'high noon', 'high-noon', 'high_noon']
  },
  {
    key: 'golden_dawn',
    name: 'Golden Dawn',
    environment: 'sunset',
    baseFiles: ['golden_hour.jpg', 'sunset_4k.jpg'],
    fallbackBundled: ['golden_hour.jpg', 'sunset.jpg'],
    radius: 20000,
    yawDeg: -25,
    aliases: ['sunrise', 'dawn', 'golden dawn', 'golden_dawn']
  },
  {
    key: 'golden_dusk',
    name: 'Golden Dusk',
    environment: 'sunset',
    baseFiles: ['golden_hour.jpg', 'sunset_4k.jpg'],
    fallbackBundled: ['golden_hour.jpg', 'sunset.jpg'],
    radius: 20000,
    yawDeg: 35,
    aliases: ['sunset', 'dusk', 'evening', 'golden hour', 'golden_hour', 'golden-dusk']
  },
  {
    key: 'blue_hour',
    name: 'Blue Hour',
    environment: 'sunset',
    baseFiles: ['blue_hour.jpg', 'sunset_4k.jpg'],
    fallbackBundled: ['blue_hour.jpg', 'sunset.jpg'],
    radius: 20000,
    aliases: ['blue hour', 'blue_hour', 'blue-hour']
  },
  {
    key: 'starlit_night',
    name: 'Starlit Night',
    environment: 'night',
    baseFiles: ['night_sky_4k.jpg', 'night_sky.jpg'],
    fallbackBundled: ['night_sky.jpg'],
    radius: 22000,
    opacity: 1,
    aliases: ['night', 'night sky', 'night_sky', 'night-sky', 'starlit night', 'starlit_night']
  }
];

const PHOTO_PRESET_ALIAS = new Map();
const PHOTO_PRESET_BY_ALIAS = new Map();
const ENVIRONMENT_ALIAS = new Map();
const FALLBACK_ENVIRONMENT_SOURCES = new Map();

function registerFallbackSources(key, baseFiles, fallbackFiles, label) {
  const normalizedKey = normalizeSkyAlias(key);
  if (!normalizedKey || FALLBACK_ENVIRONMENT_SOURCES.has(normalizedKey)) {
    return;
  }
  const sources = Object.freeze(createSkySources(baseFiles, fallbackFiles, label));
  FALLBACK_ENVIRONMENT_SOURCES.set(normalizedKey, sources);
}

const BUILT_PHOTO_PRESETS = {};

for (const definition of PHOTO_PRESET_DEFINITIONS) {
  const {
    name,
    key,
    aliases = [],
    baseFiles = [],
    fallbackBundled = [],
    ...rest
  } = definition;

  const sources = Object.freeze(createSkySources(baseFiles, fallbackBundled, `${name} photo sky`));
  const preset = Object.freeze({ ...rest, name, sources });
  BUILT_PHOTO_PRESETS[name] = preset;

  const aliasSet = new Set([name, key, ...aliases]);
  aliasSet.forEach((alias) => {
    const normalized = normalizeSkyAlias(alias);
    if (!normalized) {
      return;
    }
    PHOTO_PRESET_ALIAS.set(normalized, name);
    PHOTO_PRESET_BY_ALIAS.set(normalized, preset);
    if (!ENVIRONMENT_ALIAS.has(normalized)) {
      ENVIRONMENT_ALIAS.set(normalized, preset.environment ?? 'day');
    }
  });

  registerFallbackSources(key ?? name, baseFiles, fallbackBundled, `${name} sky panorama`);
}

const fallbackLinks = [
  ['day', 'high_noon'],
  ['golden_hour', 'golden_dusk'],
  ['sunset', 'golden_dusk'],
  ['dusk', 'golden_dusk'],
  ['evening', 'golden_dusk'],
  ['dawn', 'golden_dawn'],
  ['sunrise', 'golden_dawn'],
  ['blue_hour', 'blue_hour'],
  ['night', 'starlit_night'],
  ['night_sky', 'starlit_night'],
  ['starlit_night', 'starlit_night']
];

fallbackLinks.forEach(([alias, target]) => {
  const normalizedAlias = normalizeSkyAlias(alias);
  const normalizedTarget = normalizeSkyAlias(target);
  if (!normalizedAlias || !normalizedTarget) {
    return;
  }
  if (FALLBACK_ENVIRONMENT_SOURCES.has(normalizedAlias)) {
    return;
  }
  const sources = FALLBACK_ENVIRONMENT_SOURCES.get(normalizedTarget);
  if (sources) {
    FALLBACK_ENVIRONMENT_SOURCES.set(normalizedAlias, sources);
  }
});

['day', 'sunset', 'night'].forEach((key) => {
  const normalized = normalizeSkyAlias(key);
  if (normalized && !ENVIRONMENT_ALIAS.has(normalized)) {
    ENVIRONMENT_ALIAS.set(normalized, key);
  }
});

const PHOTO_SKY_PRESETS = Object.freeze(BUILT_PHOTO_PRESETS);

const DEFAULT_ENVIRONMENT_PRESET = new Map([
  ['day', 'High Noon'],
  ['sunset', 'Golden Dusk'],
  ['night', 'Starlit Night']
]);

let activePhotoSkydome = null;
let activePhotoPreset = null;

function disposeActivePhotoSky() {
  if (!activePhotoSkydome) {
    return;
  }

  try {
    activePhotoSkydome.dispose?.();
  } catch (error) {
    console.warn('[sky] Failed to dispose previous photo skydome.', error);
  }

  activePhotoSkydome = null;
  activePhotoPreset = null;
}

function resolvePhotoPresetName(mode) {
  if (!mode || typeof mode !== 'string') {
    return null;
  }

  const trimmed = mode.trim();
  if (!trimmed) {
    return null;
  }

  if (PHOTO_SKY_PRESETS[trimmed]) {
    return trimmed;
  }

  const normalized = normalizeSkyAlias(trimmed);
  if (!normalized) {
    return null;
  }

  const aliasMatch = PHOTO_PRESET_ALIAS.get(normalized);
  if (aliasMatch && PHOTO_SKY_PRESETS[aliasMatch]) {
    return aliasMatch;
  }

  try {
    const preset = resolveSkyPreset(mode);
    if (preset && PHOTO_SKY_PRESETS[preset]) {
      return preset;
    }
    const presetAlias = normalizeSkyAlias(preset);
    if (presetAlias) {
      const resolvedAlias = PHOTO_PRESET_ALIAS.get(presetAlias);
      if (resolvedAlias && PHOTO_SKY_PRESETS[resolvedAlias]) {
        return resolvedAlias;
      }
    }
  } catch (error) {
    console.warn('[sky] Unable to resolve photo sky preset.', error);
  }

  return null;
}

function resolveEnvironmentKey(mode) {
  if (!mode || typeof mode !== 'string') {
    return 'day';
  }

  const photoPresetName = resolvePhotoPresetName(mode);
  if (photoPresetName) {
    const preset = PHOTO_SKY_PRESETS[photoPresetName];
    if (preset?.environment) {
      return preset.environment;
    }
  }

  const normalized = normalizeSkyAlias(mode);
  if (normalized && ENVIRONMENT_ALIAS.has(normalized)) {
    return ENVIRONMENT_ALIAS.get(normalized);
  }

  try {
    const preset = resolveSkyPreset(mode);
    if (preset && PHOTO_SKY_PRESETS[preset]?.environment) {
      return PHOTO_SKY_PRESETS[preset].environment;
    }
    const resolvedAlias = normalizeSkyAlias(preset);
    if (resolvedAlias && ENVIRONMENT_ALIAS.has(resolvedAlias)) {
      return ENVIRONMENT_ALIAS.get(resolvedAlias);
    }
  } catch (error) {
    console.warn('[sky] Failed to resolve environment preset.', error);
  }

  return 'day';
}

async function ensurePhotoSky(renderer, scene, presetName, options = {}) {
  if (!renderer || !scene) {
    return null;
  }

  const normalizedPreset = typeof presetName === 'string' ? presetName : null;
  const presetConfig = normalizedPreset ? PHOTO_SKY_PRESETS[normalizedPreset] : null;

  if (!presetConfig) {
    disposeActivePhotoSky();
    return null;
  }

  if (
    activePhotoSkydome &&
    activePhotoPreset === normalizedPreset &&
    scene.children.includes(activePhotoSkydome.mesh)
  ) {
    if (typeof options.opacity === 'number') {
      activePhotoSkydome.setAmount(options.opacity);
    }
    if (typeof options.yawDeg === 'number') {
      activePhotoSkydome.setYaw(options.yawDeg);
    }
    return activePhotoSkydome;
  }

  disposeActivePhotoSky();

  try {
    const skydome = await createPhotoSkydome({
      scene,
      renderer,
      sources: presetConfig.sources,
      radius: presetConfig.radius ?? 18000,
      initialYawDeg: typeof options.yawDeg === 'number' ? options.yawDeg : presetConfig.yawDeg ?? 0,
      initialOpacity: typeof options.opacity === 'number' ? options.opacity : presetConfig.opacity ?? 1
    });

    if (presetConfig.prefetch && Array.isArray(presetConfig.prefetch)) {
      skydome.prefetchSources(presetConfig.prefetch).catch((error) => {
        console.debug('[sky] Photo sky prefetch skipped.', error);
      });
    }

    activePhotoSkydome = skydome;
    activePhotoPreset = normalizedPreset;
    return skydome;
  } catch (error) {
    console.warn(`[sky] Failed to create photo skydome for preset "${normalizedPreset}".`, error);
    disposeActivePhotoSky();
    return null;
  }
}

function getEnvironmentSources(presetName, environmentKey) {
  const normalizedPreset = normalizeSkyAlias(presetName);
  if (normalizedPreset) {
    const preset = PHOTO_PRESET_BY_ALIAS.get(normalizedPreset);
    if (preset?.sources?.length) {
      return preset.sources;
    }
    const fallbackPresetSources = FALLBACK_ENVIRONMENT_SOURCES.get(normalizedPreset);
    if (fallbackPresetSources) {
      return fallbackPresetSources;
    }
  }

  const normalizedEnvironment = normalizeSkyAlias(environmentKey);
  if (normalizedEnvironment) {
    const fallbackEnvironmentSources = FALLBACK_ENVIRONMENT_SOURCES.get(normalizedEnvironment);
    if (fallbackEnvironmentSources) {
      return fallbackEnvironmentSources;
    }
  }

  return null;
}

const environmentCache = new Map();
const environmentLoaders = new Map();
const DAY_COLOR = new THREE.Color('#87c5eb');

function applyEnvironmentResult(scene, result, { preserveBackground } = {}) {
  if (!scene) {
    return;
  }

  if (!result || !result.environment) {
    scene.environment = null;
    if (!preserveBackground) {
      scene.background = DAY_COLOR.clone();
    }
    return;
  }

  scene.environment = result.environment;
  if (!preserveBackground && result.background) {
    scene.background = result.background;
  }
}

function normalizeSkySources(input) {
  if (!input) {
    return [];
  }
  const list = Array.isArray(input) ? input : [input];
  const normalized = [];
  const seen = new Set();
  list.forEach((entry) => {
    if (!entry) return;
    const item = typeof entry === 'string' ? { url: entry } : entry;
    const url = item?.url;
    if (!url || seen.has(url)) return;
    seen.add(url);
    normalized.push({ ...item });
  });
  return normalized;
}

async function loadSkyTextureSequence(sources, loader, options = {}) {
  const normalized = normalizeSkySources(sources);
  let fallbackResult = null;

  for (const source of normalized) {
    if (!source?.url) {
      continue;
    }
    const label = source.label ? `sky texture "${source.label}"` : 'sky texture';
    try {
      const texture = await loadTextureAsyncWithFallback(source.url, {
        ...options,
        loader,
        label
      });
      if (texture?.userData?.isFallbackTexture) {
        fallbackResult = fallbackResult ?? { texture, source };
        console.warn(`[sky] ${label} unavailable at ${source.url}; using fallback placeholder.`);
        continue;
      }
      return { texture, source };
    } catch (error) {
      console.warn(`[sky] Failed to load ${label} from ${source.url}`, error);
    }
  }

  return fallbackResult;
}

export function loadEquirectSky(renderer, scene, sources, onDone, options = {}) {
  if (!renderer || !scene) {
    if (typeof onDone === 'function') {
      onDone(null);
    }
    return Promise.resolve(null);
  }

  const {
    loader: loaderOption = null,
    applyBackground = true,
    applyEnvironment = true
  } = options;

  const textureLoader = loaderOption instanceof THREE.Loader ? loaderOption : new THREE.TextureLoader();
  const candidateSources = normalizeSkySources(sources);

  if (candidateSources.length === 0) {
    if (applyBackground) {
      scene.background = DAY_COLOR.clone();
    }
    if (applyEnvironment) {
      scene.environment = null;
    }
    if (typeof onDone === 'function') {
      onDone(null);
    }
    return Promise.resolve(null);
  }

  const promise = (async () => {
    const loaded = await loadSkyTextureSequence(candidateSources, textureLoader);
    if (!loaded || !loaded.texture || loaded.texture.userData?.isFallbackTexture) {
      if (applyBackground) {
        scene.background = DAY_COLOR.clone();
      }
      if (applyEnvironment) {
        scene.environment = null;
      }
      return null;
    }

    const { texture, source } = loaded;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    if ('colorSpace' in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else {
      const srgbEncoding = Reflect.get(THREE, 'sRGBEncoding');
      if ('encoding' in texture && srgbEncoding) {
        texture.encoding = srgbEncoding;
      }
    }
    texture.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromEquirectangular(texture);
    pmrem.dispose();

    const result = {
      background: texture,
      environment: target.texture,
      renderTarget: target,
      source
    };

    if (applyBackground) {
      scene.background = texture;
    }
    if (applyEnvironment) {
      scene.environment = target.texture;
    }

    return result;
  })().catch((error) => {
    console.warn('[sky] Failed to load sky texture.', error);
    if (applyBackground) {
      scene.background = DAY_COLOR.clone();
    }
    if (applyEnvironment) {
      scene.environment = null;
    }
    return null;
  });

  if (typeof onDone === 'function') {
    promise.then((result) => onDone(result ?? null));
  }

  return promise;
}

async function ensureEnvironment(renderer, scene, {
  cacheKey,
  presetName,
  environmentKey,
  preserveBackground
} = {}) {
  if (!renderer || !scene) {
    return null;
  }

  const normalizedCacheKey =
    cacheKey ??
    normalizeSkyAlias(presetName) ??
    normalizeSkyAlias(environmentKey) ??
    'day';

  const cached = environmentCache.get(normalizedCacheKey);
  if (cached) {
    applyEnvironmentResult(scene, cached, { preserveBackground });
    return cached;
  }

  const inflight = environmentLoaders.get(normalizedCacheKey);
  if (inflight) {
    const result = await inflight;
    applyEnvironmentResult(scene, result, { preserveBackground });
    return result;
  }

  const sources = getEnvironmentSources(presetName, environmentKey);
  if (!sources || sources.length === 0) {
    applyEnvironmentResult(scene, null, { preserveBackground });
    return null;
  }

  const loadPromise = loadEquirectSky(renderer, scene, sources, null, {
    applyBackground: !preserveBackground,
    applyEnvironment: true
  })
    .then((result) => {
      if (result && result.environment) {
        environmentCache.set(normalizedCacheKey, result);
      }
      return result;
    })
    .catch((error) => {
      console.warn(`[sky] Failed to load sky environment for ${presetName ?? environmentKey}.`, error);
      return null;
    });

  environmentLoaders.set(normalizedCacheKey, loadPromise);

  const result = await loadPromise;
  environmentLoaders.delete(normalizedCacheKey);

  if (!result) {
    applyEnvironmentResult(scene, null, { preserveBackground });
    return null;
  }

  applyEnvironmentResult(scene, result, { preserveBackground });
  return result;
}

export async function setEnvironment(renderer, scene, mode = 'day', options = {}) {
  if (!renderer || !scene) {
    return null;
  }

  const {
    preserveBackground = true,
    enablePhotoSky = false,
    photoSkyOptions = {}
  } = options;

  const photoPresetName = resolvePhotoPresetName(mode);
  const presetName = photoPresetName ?? (typeof mode === 'string' ? resolveSkyPreset(mode) : null);
  const environmentKey = resolveEnvironmentKey(mode);
  const environmentPresetName =
    photoPresetName && PHOTO_SKY_PRESETS[photoPresetName]
      ? photoPresetName
      : DEFAULT_ENVIRONMENT_PRESET.get(environmentKey) ?? photoPresetName ?? environmentKey;
  const cacheKey = normalizeSkyAlias(environmentPresetName) ?? normalizeSkyAlias(environmentKey) ?? 'day';
  const shouldUsePhotoSky = Boolean(enablePhotoSky && photoPresetName && PHOTO_SKY_PRESETS[photoPresetName]);

  if (shouldUsePhotoSky && !preserveBackground) {
    scene.background = null;
  }

  let environmentResult = null;

  if (!shouldUsePhotoSky) {
    environmentResult = await ensureEnvironment(renderer, scene, {
      cacheKey,
      presetName: environmentPresetName,
      environmentKey,
      preserveBackground
    });
  }

  let photoResult = null;
  if (shouldUsePhotoSky) {
    photoResult = await ensurePhotoSky(renderer, scene, photoPresetName, photoSkyOptions);
    if (!photoResult) {
      environmentResult = await ensureEnvironment(renderer, scene, {
        cacheKey,
        presetName: environmentPresetName,
        environmentKey,
        preserveBackground
      });
    }
  } else {
    disposeActivePhotoSky();
  }

  if (!shouldUsePhotoSky && !environmentResult) {
    applyEnvironmentResult(scene, null, { preserveBackground });
  }

  return {
    environment: scene.environment,
    environmentPreset: environmentPresetName,
    photoSky: photoResult,
    preset: presetName,
    mode: environmentKey
  };
}

export function createEnvironmentController(renderer, scene, controllerOptions = {}) {
  const { initialMode = null, defaultOptions = {} } = controllerOptions ?? {};
  let disposed = false;
  let lastMode = null;
  let lastOptions = { ...defaultOptions };
  let lastResult = null;
  let requestToken = 0;

  const applyMode = async (mode, overrideOptions = {}) => {
    if (disposed) {
      return null;
    }
    const token = ++requestToken;
    const mergedOptions = { ...defaultOptions, ...overrideOptions };
    const result = await setEnvironment(renderer, scene, mode, mergedOptions);
    if (disposed) {
      return null;
    }
    if (token === requestToken) {
      lastMode = mode;
      lastOptions = mergedOptions;
      lastResult = result;
    }
    return result;
  };

  const controller = {
    async setMode(mode, overrideOptions = {}) {
      return applyMode(mode, overrideOptions);
    },
    async refresh(overrideOptions = {}) {
      if (lastMode == null) {
        return null;
      }
      return applyMode(lastMode, { ...lastOptions, ...overrideOptions });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      requestToken++;
      disposeActivePhotoSky();
      lastMode = null;
      lastResult = null;
    },
    get mode() {
      return lastMode;
    },
    get lastResult() {
      return lastResult;
    }
  };

  if (initialMode != null) {
    controller.setMode(initialMode, defaultOptions).catch((error) => {
      console.warn('[sky] Failed to apply initial environment mode.', error);
    });
  }

  return controller;
}
