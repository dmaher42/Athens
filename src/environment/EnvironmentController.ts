import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';
import { createProceduralSky, ProceduralSkyController } from '../scene/proceduralSky.ts';
import { disposeAll } from '../utils/disposable.ts';

export type SkyMode = 'procedural' | string;

export class EnvironmentController {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private disposed = false;
  private currentSkyMode: SkyMode = 'procedural';
  private lastAppliedSkyId: string | null = null;
  private proceduralSkyController: ProceduralSkyController | null = null;
  private proceduralSkyPromise: Promise<ProceduralSkyController | null> | null = null;
  private proceduralSkyToken = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
  }

  get skyMode(): SkyMode {
    return (this.lastAppliedSkyId ?? this.currentSkyMode) as SkyMode;
  }

  get skyController(): ProceduralSkyController | null {
    return this.proceduralSkyController;
  }

  async applySky(choice?: string): Promise<string | null> {
    if (this.disposed) {
      return null;
    }
    if (this.shouldUseProcedural(choice)) {
      this.currentSkyMode = 'procedural';
      this.lastAppliedSkyId = null;
      const controller = await this.ensureProceduralSky();
      return controller ? 'procedural' : null;
    }

    const appliedId = await this.applyStaticSky(choice);
    if (appliedId) {
      this.currentSkyMode = appliedId as SkyMode;
    }
    return appliedId;
  }

  async setMode(mode: SkyMode): Promise<string | null> {
    if (this.disposed) {
      return null;
    }
    if (mode === 'procedural') {
      this.currentSkyMode = 'procedural';
      this.lastAppliedSkyId = null;
      const controller = await this.ensureProceduralSky();
      return controller ? 'procedural' : null;
    }

    this.currentSkyMode = mode;
    return this.applyStaticSky(mode);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentSkyMode = 'procedural';
    this.lastAppliedSkyId = null;
    this.disposeProceduralSky();
    this.disposeSceneEnvironment();
    this.updateDebugSky(null);
  }

  // TODO: Remove legacy sky modules (src/scene/sky.ts, src/scene/sky.js) once all callers migrate.

  private async ensureProceduralSky(): Promise<ProceduralSkyController | null> {
    if (this.disposed) {
      return null;
    }
    if (this.proceduralSkyController) {
      return this.proceduralSkyController;
    }
    if (this.proceduralSkyPromise) {
      return this.proceduralSkyPromise;
    }

    this.disposeSceneEnvironment();

    const token = ++this.proceduralSkyToken;
    this.proceduralSkyPromise = createProceduralSky({
      renderer: this.renderer,
      scene: this.scene
    })
      .then((controller) => {
        if (this.proceduralSkyToken !== token) {
          try {
            controller.dispose();
          } catch {}
          return this.proceduralSkyController;
        }
        this.proceduralSkyController = controller;
        this.updateDebugSky(controller);
        return controller;
      })
      .catch((error) => {
        if (this.proceduralSkyToken === token) {
          this.proceduralSkyPromise = null;
        }
        this.updateDebugSky(null);
        throw error;
      });

    return this.proceduralSkyPromise;
  }

  private disposeProceduralSky(): void {
    this.proceduralSkyToken += 1;
    if (this.proceduralSkyController) {
      try {
        this.proceduralSkyController.dispose();
      } catch {}
    }
    this.proceduralSkyController = null;
    this.proceduralSkyPromise = null;
  }

  private disposeSceneEnvironment(): void {
    const env = this.scene.environment;
    const background = this.scene.background;
    const textures: Array<THREE.Texture | THREE.CubeTexture> = [];

    if (env instanceof THREE.Texture || env instanceof THREE.CubeTexture) {
      textures.push(env);
    }
    if (background instanceof THREE.Texture || background instanceof THREE.CubeTexture) {
      if (!textures.includes(background)) {
        textures.push(background);
      }
    }

    if (textures.length) {
      disposeAll(textures);
    }

    this.scene.environment = null;
    this.scene.background = null;
  }

  private async applyStaticSky(choice?: string): Promise<string | null> {
    this.disposeProceduralSky();
    this.disposeSceneEnvironment();
    const appliedId = await applySky(this.scene, this.renderer, choice);
    this.lastAppliedSkyId = appliedId ?? null;
    this.updateDebugSky(null);
    return appliedId;
  }

  private shouldUseProcedural(choice?: string): boolean {
    const normalized = this.normalizeSkyId(choice);
    if (normalized === 'procedural') {
      return true;
    }
    if (!choice && typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search || '');
        return this.normalizeSkyId(params.get('sky')) === 'procedural';
      } catch {}
    }
    return false;
  }

  private normalizeSkyId(value?: string | null): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    return trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private updateDebugSky(controller: ProceduralSkyController | null): void {
    if (typeof window === 'undefined') {
      return;
    }
    const globalWindow = window as typeof window & { __athensDebug?: Record<string, any> };
    const debug = globalWindow.__athensDebug || {};
    debug.skyController = controller ?? null;
    globalWindow.__athensDebug = debug;
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
