import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createFollowCamera } from '../followCamera.js';

test('follow camera responds to keyboard look input', () => {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Object3D();

  const followCamera = createFollowCamera(camera, target, {
    offset: new THREE.Vector3(0, 2, -6),
    lerp: 1,
    yawSpeed: 2,
    pitchSpeed: 1
  });

  followCamera.syncImmediate?.();
  const initialYaw = camera.__rigState?.yaw ?? 0;
  const initialPitch = camera.__rigState?.pitch ?? 0;

  followCamera.update({ axis: { lookX: 1, lookY: 0.5 } }, 0.5);

  const stateAfterFirst = camera.__rigState;
  assert.ok(stateAfterFirst, 'rig state should exist after update');
  const yawAfterFirst = stateAfterFirst.yaw;
  const pitchAfterFirst = stateAfterFirst.pitch;
  assert.ok(yawAfterFirst > initialYaw, 'yaw should increase from positive lookX');
  assert.ok(pitchAfterFirst > initialPitch, 'pitch should increase from positive lookY');

  const positionAfterFirst = camera.position.clone();

  followCamera.update({ axis: { lookX: -1, lookY: -1 } }, 0.5);

  assert.ok(camera.__rigState.yaw < yawAfterFirst, 'yaw should decrease from negative lookX');
  assert.ok(camera.__rigState.pitch < pitchAfterFirst, 'pitch should decrease from negative lookY');
  assert.ok(
    positionAfterFirst.distanceToSquared(camera.position) > 1e-8,
    'camera position should change when look input changes'
  );

  let addEventListenerCalled = false;
  const pointerElement = {
    addEventListener() {
      addEventListenerCalled = true;
    },
    removeEventListener() {}
  };

  followCamera.setPointerLockElement?.(pointerElement);
  assert.equal(addEventListenerCalled, false, 'mouse listeners should not be registered');

  followCamera.dispose?.();
});
