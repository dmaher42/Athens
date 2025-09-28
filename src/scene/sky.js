import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { loadTextureWithFallback } from '../utils/fail-soft-loaders.js';
import { createPhotoSkydome } from '../sky/photoSkydome.js';
import { resolvePreset as resolveSkyPreset } from '../sky/presets.js';

const SKY_PATHS = {
  sunset: resolveAssetUrl('assets/sky/sunset_4k.jpg'),
  night: resolveAssetUrl('assets/sky/night_sky_4k.jpg')
};

const BUNDLED_SKY_BASE = new URL('../sky/', import.meta.url);

function bundledSkyAsset(path) {
  try {
    return new URL(path, BUNDLED_SKY_BASE).href;
  } catch (error) {
    console.warn('[sky] Failed to resolve bundled sky asset', path, error);
    return null;
  }
}

const PHOTO_SKY_PRESETS = Object.freeze({
  'High Noon': {
    environment: 'day',
    sources: [
      { url: resolveAssetUrl('assets/sky/high_noon.jpg'), label: 'High Noon photo sky' },
      { url: bundledSkyAsset('high_noon.jpg'), label: 'Bundled high noon fallback' },
      { url: bundledSkyAsset('sunset.jpg'), label: 'Bundled sunset fallback' }
    ],
    radius: 18000
  },
  'Golden Dawn': {
    environment: 'sunset',
    sources: [
      { url: resolveAssetUrl('assets/sky/golden_hour.jpg'), label: 'Golden hour dawn photo sky' },
      { url: bundledSkyAsset('golden_hour.jpg'), label: 'Bundled golden hour fallback' },
      { url: bundledSkyAsset('sunset.jpg'), label: 'Bundled sunset fallback' }
    ],
    yawDeg: -25,
    radius: 20000
  },
  'Golden Dusk': {
    environment: 'sunset',
    sources: [
      { url: resolveAssetUrl('assets/sky/golden_hour.jpg'), label: 'Golden hour dusk photo sky' },
      { url: bundledSkyAsset('golden_hour.jpg'), label: 'Bundled golden hour fallback' },
      { url: bundledSkyAsset('sunset.jpg'), label: 'Bundled sunset fallback' }
    ],
    yawDeg: 35,
    radius: 20000
  },
  'Blue Hour': {
    environment: 'sunset',
    sources: [
      { url: resolveAssetUrl('assets/sky/blue_hour.jpg'), label: 'Blue hour photo sky' },
      { url: bundledSkyAsset('blue_hour.jpg'), label: 'Bundled blue hour fallback' },
      { url: bundledSkyAsset('sunset.jpg'), label: 'Bundled sunset fallback' }
    ],
    radius: 20000
  },
  'Starlit Night': {
    environment: 'night',
    sources: [
      { url: resolveAssetUrl('assets/sky/night_sky_4k.jpg'), label: 'Night sky photo panorama' },
      { url: resolveAssetUrl('assets/sky/night_sky.jpg'), label: 'Night sky (optional external)' },
      { url: bundledSkyAsset('night_sky.jpg'), label: 'Bundled night sky fallback' }
    ],
    opacity: 1,
    radius: 22000
  }
});

const ENVIRONMENT_ALIAS = new Map([
  ['day', 'day'],
  ['sunrise', 'sunset'],
  ['sunset', 'sunset'],
  ['dawn', 'sunset'],
  ['dusk', 'sunset'],
  ['evening', 'sunset'],
  ['night', 'night'],
  ['starlit night', 'night']
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

function resolveEnvironmentKey(mode) {
  if (!mode || typeof mode !== 'string') {
    return 'day';
  }

  const normalized = mode.trim().toLowerCase();
  if (!normalized) {
    return 'day';
  }

  const directPreset = PHOTO_SKY_PRESETS[mode];
  if (directPreset?.environment) {
    return directPreset.environment;
  }

  for (const [name, preset] of Object.entries(PHOTO_SKY_PRESETS)) {
    if (name.toLowerCase() === normalized && preset?.environment) {
      return preset.environment;
    }
  }

  if (ENVIRONMENT_ALIAS.has(normalized)) {
    return ENVIRONMENT_ALIAS.get(normalized);
  }

  try {
    const preset = resolveSkyPreset(mode);
    if (preset && typeof preset === 'string') {
      const presetKey = preset.trim().toLowerCase();
      if (ENVIRONMENT_ALIAS.has(presetKey)) {
        return ENVIRONMENT_ALIAS.get(presetKey);
      }
      const presetConfig = PHOTO_SKY_PRESETS[preset];
      if (presetConfig?.environment) {
        return presetConfig.environment;
      }
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

  const normalized = trimmed.toLowerCase();
  for (const name of Object.keys(PHOTO_SKY_PRESETS)) {
    if (name.toLowerCase() === normalized) {
      return name;
    }
  }

  switch (normalized) {
    case 'day':
      return 'High Noon';
    case 'sunrise':
    case 'dawn':
      return 'Golden Dawn';
    case 'sunset':
    case 'dusk':
    case 'evening':
      return 'Golden Dusk';
    case 'blue hour':
      return 'Blue Hour';
    case 'night':
    case 'night sky':
    case 'starlit night':
      return 'Starlit Night';
    default:
      break;
  }

  try {
    const preset = resolveSkyPreset(mode);
    if (preset && PHOTO_SKY_PRESETS[preset]) {
      return preset;
    }
  } catch (error) {
    console.warn('[sky] Unable to resolve photo sky preset.', error);
  }

  return null;
}

const environmentCache = new Map();
const DAY_COLOR = new THREE.Color('#87c5eb');

export function loadEquirectSky(renderer, scene, path, onDone, options = {}) {
  if (!renderer || !scene) {
    onDone?.(null);
    return;
  }

  const {
    applyBackground = true,
    applyEnvironment = true
  } = options;

  const loader = new THREE.TextureLoader();
  loadTextureWithFallback(path, {
    loader,
    label: 'sky texture',
    fallbackColor: DAY_COLOR.getHex(),
    onLoad: (texture, { fallback }) => {
      if (fallback) {
        if (applyBackground) {
          scene.background = DAY_COLOR.clone();
        }
        if (applyEnvironment) {
          scene.environment = null;
        }
        onDone?.(null);
        return;
      }

      texture.mapping = THREE.EquirectangularReflectionMapping;
      if ('colorSpace' in texture && THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else {
        const srgbEncoding = Reflect.get(THREE, 'sRGBEncoding');
        if ('encoding' in texture && srgbEncoding) {
          texture.encoding = srgbEncoding;
        }
      }

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTarget = pmrem.fromEquirectangular(texture);
      pmrem.dispose();

      const environmentTexture = envTarget.texture;

      if (applyBackground) {
        scene.background = texture;
      }

      if (applyEnvironment) {
        scene.environment = environmentTexture;
      }

      onDone?.({ background: texture, environment: environmentTexture });
    },
    onFallback: (error) => {
      if (error) {
        console.warn(`[sky] Failed to load sky texture: ${path}`, error);
      }
    }
  });
}

export async function setEnvironment(renderer, scene, mode = 'day', options = {}) {
  if (!renderer || !scene) {
    return null;
  }

  const {
    preserveBackground = false,
    enablePhotoSky = true,
    photoSkyOptions = {}
  } = options;

  const photoPresetName = resolvePhotoPresetName(mode);
  const presetName = photoPresetName ?? (typeof mode === 'string' ? resolveSkyPreset(mode) : null);
  const environmentKey = resolveEnvironmentKey(mode);
  const shouldUsePhotoSky = Boolean(enablePhotoSky && photoPresetName && PHOTO_SKY_PRESETS[photoPresetName]);

  if (environmentKey === 'day') {
    if (!preserveBackground) {
      scene.background = DAY_COLOR.clone();
    }
    scene.environment = null;
  } else if (!shouldUsePhotoSky) {
    const cached = environmentCache.get(environmentKey);
    if (cached) {
      if (!preserveBackground) {
        scene.background = cached.background;
      }
      scene.environment = cached.environment;
    } else {
      const texturePath = SKY_PATHS[environmentKey];
      if (!texturePath) {
        console.warn(`[sky] Unknown mode "${mode}", defaulting to day.`);
        if (!preserveBackground) {
          scene.background = DAY_COLOR.clone();
        }
        scene.environment = null;
      } else {
        loadEquirectSky(
          renderer,
          scene,
          texturePath,
          (result) => {
            if (result) {
              environmentCache.set(environmentKey, result);
            } else if (!environmentCache.has(environmentKey)) {
              if (!preserveBackground) {
                scene.background = DAY_COLOR.clone();
              }
              scene.environment = null;
            }
          },
          { applyBackground: !preserveBackground }
        );
      }
    }
  }

  let photoResult = null;
  if (shouldUsePhotoSky) {
    photoResult = await ensurePhotoSky(renderer, scene, photoPresetName, photoSkyOptions);
  } else {
    disposeActivePhotoSky();
  }

  return { environment: scene.environment, photoSky: photoResult, preset: presetName, mode: environmentKey };
}
