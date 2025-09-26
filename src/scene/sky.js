import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { loadTextureWithFallback } from '../utils/fail-soft-loaders.js';

const SKY_PATHS = {
  sunset: resolveAssetUrl('assets/sky/sunset_4k.jpg'),
  night: resolveAssetUrl('assets/sky/night_sky_4k.jpg')
};

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
      } else if ('encoding' in texture && THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
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

export function setEnvironment(renderer, scene, mode = 'day', options = {}) {
  if (!renderer || !scene) {
    return;
  }

  const {
    preserveBackground = false
  } = options;

  if (mode === 'day') {
    if (!preserveBackground) {
      scene.background = DAY_COLOR.clone();
    }
    scene.environment = null;
    return;
  }

  const key = mode === 'night' ? 'night' : (mode === 'sunset' ? 'sunset' : 'day');
  if (key === 'day') {
    if (!preserveBackground) {
      scene.background = DAY_COLOR.clone();
    }
    scene.environment = null;
    return;
  }

  const cached = environmentCache.get(key);
  if (cached) {
    if (!preserveBackground) {
      scene.background = cached.background;
    }
    scene.environment = cached.environment;
    return;
  }

  const texturePath = SKY_PATHS[key];
  if (!texturePath) {
    console.warn(`[sky] Unknown mode "${mode}", defaulting to day.`);
    scene.background = DAY_COLOR.clone();
    scene.environment = null;
    return;
  }

  loadEquirectSky(renderer, scene, texturePath, (result) => {
    if (result) {
      environmentCache.set(key, result);
    } else if (!environmentCache.has(key)) {
      if (!preserveBackground) {
        scene.background = DAY_COLOR.clone();
      }
      scene.environment = null;
    }
  }, { applyBackground: !preserveBackground });
}
