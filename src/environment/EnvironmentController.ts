import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';

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
    this.disposed = true;
  }
}
