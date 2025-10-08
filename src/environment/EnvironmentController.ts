import * as THREE from 'three';
import { createEnvironment, type EnvAPI, type EnvDeps } from './envCore.ts';
import { disposeAll } from '../utils/disposable.ts';

export type SkyMode = 'procedural' | string;

function normalizeChoice(choice?: string | null): string | null {
  if (!choice || typeof choice !== 'string') {
    return null;
  }
  return choice.trim();
}

function canonicalSkyMode(choice?: string | null): 'dawn' | 'day' | 'dusk' | 'night' {
  const normalized = normalizeChoice(choice)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  switch (normalized) {
    case 'dawn':
    case 'sunrise':
      return 'dawn';
    case 'dusk':
    case 'sunset':
    case 'evening':
    case 'golden-hour':
    case 'goldenhour':
      return 'dusk';
    case 'night':
    case 'midnight':
    case 'night-sky':
    case 'starlit-night':
      return 'night';
    default:
      return 'day';
  }
}

export class EnvironmentController {
  private readonly api: EnvAPI;
  private disposed = false;
  private currentSkyMode: SkyMode = 'procedural';
  private lastAppliedSkyId: string | null = null;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.api = createEnvironment({ scene, renderer });
  }

  get skyMode(): SkyMode {
    return (this.lastAppliedSkyId ?? this.currentSkyMode) as SkyMode;
  }

  async applySky(choice?: string): Promise<string | null> {
    if (this.disposed) {
      return null;
    }
    const target = canonicalSkyMode(choice);
    await this.api.applySkyMode(target);
    this.lastAppliedSkyId = choice ?? target;
    this.currentSkyMode = target;
    this.api.setMode('procedural');
    return this.lastAppliedSkyId;
  }

  setMode(mode: SkyMode): void {
    if (this.disposed) {
      return;
    }
    this.currentSkyMode = mode;
    if (mode === 'procedural') {
      this.lastAppliedSkyId = null;
      this.api.setMode('procedural');
    } else {
      this.api.setMode('image');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentSkyMode = 'procedural';
    this.lastAppliedSkyId = null;
    this.api.dispose();
  }
}

export type EnvironmentControllerArgs = EnvDeps;

export function createEnvironmentController({ scene, renderer }: EnvironmentControllerArgs): EnvironmentController {
  return new EnvironmentController(scene, renderer);
}

let _externalSkyImages: Array<{ id: string; url: string; tags?: string[] }> = [];

export function registerExternalSkyImages(images: Array<{ id: string; url: string; tags?: string[] }>) {
  if (!Array.isArray(images)) return;
  _externalSkyImages = images.filter((i) => i && typeof i.id === 'string' && typeof i.url === 'string');
}

export async function applySkyImage(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  url: string
) {
  if (!scene || !renderer || !url) return;
  const loader = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const tex: THREE.Texture = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const envRT = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  const previousBackground = scene.background;
  const previousEnvironment = scene.environment as THREE.Texture | THREE.CubeTexture | null;
  scene.background = tex;
  scene.environment = envRT.texture;
  disposeAll(previousEnvironment);
  if (
    previousBackground &&
    previousBackground !== tex &&
    (previousBackground instanceof THREE.Texture || previousBackground instanceof THREE.CubeTexture)
  ) {
    disposeAll(previousBackground);
  }
}

export { createEnvironment, type EnvAPI, type EnvDeps } from './envCore.ts';
