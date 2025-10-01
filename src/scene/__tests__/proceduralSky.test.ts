import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createProceduralSky } from '../proceduralSky.ts';

test('createProceduralSky sets environment and advances over time', async (t) => {
  const originalPMREM = THREE.PMREMGenerator;
  const targets: Array<{ disposed: boolean; textureDisposed: boolean }> = [];
  const fromSceneCalls: number[] = [];
  const disposeCalls: number[] = [];

  class MockRenderTarget {
    public textureDisposed = false;
    public disposed = false;
    public texture: { dispose: () => void };

    constructor() {
      this.texture = {
        dispose: () => {
          this.textureDisposed = true;
        }
      };
    }

    dispose() {
      this.disposed = true;
    }
  }

  class MockPMREMGenerator {
    constructor() {}

    fromScene() {
      const target = new MockRenderTarget();
      targets.push(target);
      fromSceneCalls.push(targets.length);
      return target as unknown as THREE.WebGLRenderTarget;
    }

    dispose() {
      disposeCalls.push(1);
    }
  }

  (THREE as any).PMREMGenerator = MockPMREMGenerator;
  t.after(() => {
    (THREE as any).PMREMGenerator = originalPMREM;
  });

  const scene = new THREE.Scene();
  const renderer = { toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;

  await t.test('initial environment build', async () => {
    const controller = await createProceduralSky({ renderer, scene });

    assert.ok(scene.environment, 'environment texture should be assigned');
    assert.strictEqual(scene.environment, scene.background, 'background should share environment texture');
    assert.strictEqual(fromSceneCalls.length, 1, 'initial PMREM build only runs once');

    controller.setCycleSpeed(1);
    const before = scene.environment;
    controller.update(0.2);
    assert.strictEqual(fromSceneCalls.length, 2, 'update triggers rebuild after throttle');
    assert.notStrictEqual(scene.environment, before, 'environment texture should refresh');
    assert.ok(targets[0].disposed, 'previous render target disposed after rebuild');
    assert.ok(targets[0].textureDisposed, 'previous texture disposed after rebuild');

    controller.setCycleSpeed(0);
    controller.update(0.05);
    assert.strictEqual(fromSceneCalls.length, 2, 'no rebuild when cycle speed is zero');

    controller.dispose();
    assert.strictEqual(scene.environment, null, 'environment cleared on dispose');
    assert.strictEqual(scene.background, null, 'background cleared on dispose');
    assert.ok(targets[targets.length - 1].disposed, 'current render target disposed on dispose');
    assert.ok(targets[targets.length - 1].textureDisposed, 'current texture disposed on dispose');
    assert.ok(disposeCalls.length >= 1, 'pmrem generator disposed for each rebuild');
  });

});
