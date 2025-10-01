import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';
import { disposeAll } from '../utils/disposable.ts';

export type EnvDeps = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
};

export type EnvAPI = {
  applySkyMode(mode: 'dawn' | 'day' | 'dusk' | 'night'): Promise<void>;
  applySkyImage(url: string): Promise<void>;
  setMode(mode: 'procedural' | 'image'): void;
  dispose(): void;
};

type ImageState = {
  background: THREE.Texture | null;
  environment: THREE.Texture | THREE.CubeTexture | null;
  renderTarget: THREE.WebGLRenderTarget | null;
};

const EMPTY_IMAGE_STATE: ImageState = {
  background: null,
  environment: null,
  renderTarget: null,
};

function cloneImageState(state: ImageState): ImageState {
  return {
    background: state.background,
    environment: state.environment,
    renderTarget: state.renderTarget,
  };
}

function disposeImageState(state: ImageState) {
  disposeAll(state.background, state.environment, state.renderTarget);
}

function normalizeSkyMode(mode: 'dawn' | 'day' | 'dusk' | 'night'): 'dawn' | 'day' | 'dusk' | 'night' {
  switch (mode) {
    case 'dawn':
    case 'day':
    case 'dusk':
    case 'night':
    default:
      return mode;
  }
}

export function createEnvironment({ scene, renderer }: EnvDeps): EnvAPI {
  if (!scene || !renderer) {
    throw new Error('[env] createEnvironment requires a scene and renderer.');
  }

  let disposed = false;
  let mode: 'procedural' | 'image' = 'procedural';
  let imageState: ImageState = { ...EMPTY_IMAGE_STATE };

  const ensureActive = () => {
    if (disposed) {
      return false;
    }
    return true;
  };

  return {
    async applySkyMode(nextMode) {
      if (!ensureActive()) {
        return;
      }

      const previousImage = cloneImageState(imageState);
      imageState = { ...EMPTY_IMAGE_STATE };

      try {
        const normalized = normalizeSkyMode(nextMode);
        await applySky(scene, renderer, normalized);
        mode = 'procedural';
      } finally {
        disposeImageState(previousImage);
      }
    },

    async applySkyImage(url: string) {
      if (!ensureActive() || !url) {
        return;
      }

      const loader = new THREE.TextureLoader();
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();

      let texture: THREE.Texture | null = null;
      try {
        texture = await new Promise<THREE.Texture>((resolve, reject) =>
          loader.load(url, resolve, undefined, reject)
        );
      } catch (error) {
        pmrem.dispose();
        throw error;
      }

      if (!texture) {
        pmrem.dispose();
        return;
      }

      texture.mapping = THREE.EquirectangularReflectionMapping;

      const renderTarget = pmrem.fromEquirectangular(texture);
      pmrem.dispose();

      const previousBackground = scene.background;
      const previousEnvironment = scene.environment as THREE.Texture | THREE.CubeTexture | null;
      const previousImage = cloneImageState(imageState);

      scene.background = texture;
      scene.environment = renderTarget.texture;

      imageState = {
        background: texture,
        environment: renderTarget.texture,
        renderTarget,
      };
      mode = 'image';

      disposeAll(previousEnvironment);
      if (
        previousBackground &&
        previousBackground !== texture &&
        (previousBackground instanceof THREE.Texture || previousBackground instanceof THREE.CubeTexture)
      ) {
        disposeAll(previousBackground);
      }

      disposeImageState(previousImage);
    },

    setMode(next) {
      if (!ensureActive()) {
        return;
      }
      mode = next === 'image' ? 'image' : 'procedural';
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeImageState(imageState);
      imageState = { ...EMPTY_IMAGE_STATE };
      const environment = scene.environment as THREE.Texture | THREE.CubeTexture | null;
      const background = scene.background;
      disposeAll(environment);
      if (background instanceof THREE.Texture || background instanceof THREE.CubeTexture) {
        disposeAll(background);
      }
      scene.environment = null;
      scene.background = null;
    },
  };
}
