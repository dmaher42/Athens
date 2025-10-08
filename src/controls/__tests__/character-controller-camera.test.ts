import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { CharacterController } from '../CharacterController.ts';
import { createFollowCamera } from '../../camera/followCamera.js';
import type { CharacterControllerWorld } from '../CharacterController.ts';

const NO_INPUT = Object.freeze({ forward: 0, right: 0, jump: false, sprint: false });

function createWorld(): CharacterControllerWorld {
  return {} as CharacterControllerWorld;
}

test('follow camera retains offset after controller update', () => {
  const camera = new THREE.PerspectiveCamera();
  const start = new THREE.Vector3(0, 1, 0);
  const controller = new CharacterController(camera, start);

  const avatar = new THREE.Object3D();
  controller.attach(avatar);
  controller.setPosition(start.clone());

  const offset = new THREE.Vector3(1, 2, -3);
  const followCamera = createFollowCamera(camera, avatar, { offset, lerp: 1 });
  followCamera.syncImmediate?.();

  const expectedOffset = offset.clone();
  const initialOffset = camera.position.clone().sub(avatar.position);
  assert.ok(initialOffset.distanceTo(expectedOffset) < 1e-6, 'initial camera offset should match');

  controller.velocity.set(0.6, 0, 0.4);
  controller.update(1 / 60, NO_INPUT, createWorld());

  const alignmentDelta = controller.position.clone().sub(avatar.position);
  assert.ok(alignmentDelta.length() < 1e-6, 'attached object should remain aligned with controller');

  followCamera.update?.(undefined, 0);
  const updatedOffset = camera.position.clone().sub(avatar.position);
  assert.ok(
    updatedOffset.distanceTo(expectedOffset) < 1e-5,
    'follow camera should retain configured offset after controller tick'
  );
});
