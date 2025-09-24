import * as THREE from 'three';

const SKY_PATHS = {
  sunset: 'public/assets/sky/sunset_4k.jpg',
  night: 'public/assets/sky/night_sky_4k.jpg'
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
  loader.load(
    path,
    (texture) => {
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
    undefined,
    (error) => {
      console.warn(`[sky] Failed to load sky texture: ${path}`, error);
      onDone?.(null);
    }
  );
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
