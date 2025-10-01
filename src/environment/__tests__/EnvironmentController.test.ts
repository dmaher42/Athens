import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { EnvironmentController } from '../EnvironmentController.ts';

test('EnvironmentController switches between procedural and static skies cleanly', async (t) => {
  const originalPMREM = THREE.PMREMGenerator;
  const originalLoader = THREE.TextureLoader.prototype.load;

  const scene = new THREE.Scene();
  const renderer = { toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;

  const fromSceneCalls: number[] = [];
  const fromEquirectangularCalls: number[] = [];
  const proceduralTargets: Array<{ disposed: boolean; textureDisposed: boolean }> = [];
  const staticTargets: Array<{ disposed: boolean; textureDisposed: boolean }> = [];

  class MockRenderTarget {
    public disposed = false;
    public textureDisposed = false;
    public texture: { dispose: () => void; disposed?: boolean };

    constructor() {
      this.texture = {
        disposed: false,
        dispose: () => {
          this.textureDisposed = true;
          this.texture.disposed = true;
        }
      };
    }

    dispose() {
      this.disposed = true;
    }
  }

  class MockPMREMGenerator {
    fromScene() {
      const target = new MockRenderTarget();
      proceduralTargets.push(target);
      fromSceneCalls.push(1);
      return target as unknown as THREE.WebGLRenderTarget;
    }

    fromEquirectangular() {
      const target = new MockRenderTarget();
      fromEquirectangularCalls.push(1);
      staticTargets.push(target);
      return target as unknown as THREE.WebGLRenderTarget;
    }

    dispose() {}
  }

  THREE.TextureLoader.prototype.load = function (_url, onLoad) {
    const texture = new THREE.Texture();
    (texture as any).disposed = false;
    texture.dispose = () => {
      (texture as any).disposed = true;
    };
    if (typeof onLoad === 'function') {
      onLoad(texture);
    }
    return texture;
  } as any;

  (THREE as any).PMREMGenerator = MockPMREMGenerator;

  t.after(() => {
    (THREE as any).PMREMGenerator = originalPMREM;
    THREE.TextureLoader.prototype.load = originalLoader;
  });

  const controller = new EnvironmentController(scene, renderer);

  await controller.setMode('procedural');
  assert.strictEqual(fromSceneCalls.length, 1, 'procedural mode builds environment once');
  assert.ok(controller.skyController, 'procedural controller should be active');

  const proceduralTexture = scene.environment;
  assert.ok(proceduralTexture, 'procedural environment assigned');

  await controller.applySky('day');
  assert.strictEqual(fromEquirectangularCalls.length, 1, 'static sky uses equirectangular PMREM once');
  assert.strictEqual(fromSceneCalls.length, 1, 'procedural PMREM should not run during static sky');
  assert.ok(proceduralTargets[0].disposed, 'procedural render target disposed when leaving procedural mode');
  assert.ok(proceduralTargets[0].textureDisposed, 'procedural texture disposed when leaving procedural mode');

  const dayBackground = scene.background as THREE.Texture & { disposed?: boolean };
  const dayEnvironment = scene.environment as THREE.Texture & { disposed?: boolean };
  assert.ok(dayBackground, 'background texture should be set for day sky');
  assert.ok(dayEnvironment, 'environment texture should be set for day sky');
  assert.ok(staticTargets.length > 0, 'static PMREM target recorded');

  await controller.setMode('procedural');
  assert.strictEqual(fromSceneCalls.length, 2, 'procedural rebuilds after returning to cycle');
  assert.ok(dayBackground.disposed, 'day background texture disposed when switching back to procedural');
  assert.ok(staticTargets[0].textureDisposed, 'day environment texture disposed when switching back to procedural');

  controller.dispose();
  assert.strictEqual(scene.environment, null, 'dispose clears environment');
  assert.strictEqual(scene.background, null, 'dispose clears background');
});
