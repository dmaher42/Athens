import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';
import { disposeAll } from '../utils/disposable.ts';

export type SkyMode = 'procedural' | string;

export class EnvironmentController {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private disposed = false;
  private currentSkyMode: SkyMode = 'procedural';
  private lastAppliedSkyId: string | null = null;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
  }

  get skyMode(): SkyMode {
    return (this.lastAppliedSkyId ?? this.currentSkyMode) as SkyMode;
  }

  async applySky(choice?: string): Promise<string | null> {
    if (this.disposed) {
      return null;
    }
    const appliedId = await applySky(this.scene, this.renderer, choice);
    this.lastAppliedSkyId = appliedId ?? null;
    return appliedId;
  }

  setMode(mode: SkyMode): void {
    if (this.disposed) {
      return;
    }
    this.currentSkyMode = mode;
    if (mode === 'procedural') {
      this.lastAppliedSkyId = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const environment = this.scene.environment as THREE.Texture | null;
    const background = this.scene.background;
    const backgroundTexture =
      background instanceof THREE.Texture || background instanceof THREE.CubeTexture
        ? background
        : null;
    disposeAll(environment, backgroundTexture);
    this.scene.environment = null;
    this.scene.background = null;
  }
}

// Optional registry for external sky images discovered at build time
let _externalSkyImages: Array<{ id: string; url: string; tags?: string[] }> = [];

/** Register external equirectangular sky JPGs (optional). No-ops if array is empty. */
export function registerExternalSkyImages(images: Array<{ id: string; url: string; tags?: string[] }>) {
  if (!Array.isArray(images)) return;
  _externalSkyImages = images.filter((i) => i && typeof i.id === 'string' && typeof i.url === 'string');
}

/** Apply a single equirectangular sky image as background+environment (optional utility). */
export async function applySkyImage(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  url: string
) {
  if (!scene || !renderer || !url) return;
  const loader = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const tex: THREE.Texture = await new Promise((resolve, reject) =>
    loader.load(url, resolve, undefined, reject)
  );
  tex.mapping = THREE.EquirectangularReflectionMapping;

  // Build PMREM for env; keep the texture as background
  const envRT = pmrem.fromEquirectangular(tex);
  scene.background = tex;
  scene.environment = envRT.texture;
}
