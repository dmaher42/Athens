import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createPlayerController } from '../src/player/playerController.js';

test('player controller treats positive axisZ input as forward motion', () => {
  const character = new THREE.Object3D();
  character.position.set(0, 0, 0);

  const keyboard = {
    axis: { x: 0, z: 1, running: false },
    isDown: () => false
  };

  const controller = createPlayerController(character, keyboard);

  const camera = { __rigState: { yaw: 0 } };

  controller.update(0.016, camera);

  assert.ok(controller.state.velocity.z > 0, 'velocity.z should be positive for forward input');
  assert.ok(character.position.z > 0, 'character should move forward along +Z for positive axisZ');
});
