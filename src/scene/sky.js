import * as THREE from 'three';

const SKY_PATHS = {
  sunset: new URL('../../public/assets/sky/sunset_4k.jpg', import.meta.url).href,
  night: new URL('../../public/assets/sky/night_sky_4k.jpg', import.meta.url).href
};

const environmentCache = new Map();
const DAY_COLOR = new THREE.Color('#87c5eb');

export function loadEquirectSky(renderer, scene, path, onDone) {
  if (!renderer || !scene) {
    onDone?.(null);
    return;
  }

  const loader = new THREE.TextureLoader();
  loader.load(
    path,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTarget = pmrem.fromEquirectangular(texture);
      pmrem.dispose();

      const environmentTexture = envTarget.texture;
      scene.background = texture;
      scene.environment = environmentTexture;

      onDone?.({ background: texture, environment: environmentTexture });
    },
    undefined,
    (error) => {
      console.warn(`[sky] Failed to load sky texture: ${path}`, error);
      onDone?.(null);
    }
  );
}

export function setEnvironment(renderer, scene, mode = 'day') {
  if (!renderer || !scene) {
    return;
  }

  if (mode === 'day') {
    scene.background = DAY_COLOR.clone();
    scene.environment = null;
    return;
  }

  const key = mode === 'night' ? 'night' : (mode === 'sunset' ? 'sunset' : 'day');
  if (key === 'day') {
    scene.background = DAY_COLOR.clone();
    scene.environment = null;
    return;
  }

  const cached = environmentCache.get(key);
  if (cached) {
    scene.background = cached.background;
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
      scene.background = DAY_COLOR.clone();
      scene.environment = null;
    }
  });
}
