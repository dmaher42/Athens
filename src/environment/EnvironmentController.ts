import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';
import { disposeAll } from '../utils/disposable.ts';

export type SkyMode = 'procedural';

export class EnvironmentController {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private disposed = false;
  private currentSkyMode: SkyMode = 'procedural';

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
  }

  get skyMode(): SkyMode {
    return this.currentSkyMode;
  }

  async applySky(choice?: string) {
    if (this.disposed) {
      return null;
    }
    return applySky(this.scene, this.renderer, choice);
  }

  setMode(mode: SkyMode): void {
    if (this.disposed) {
      return;
    }
    this.currentSkyMode = mode;
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
