import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createFollowCamera } from '../followCamera.js';

test('follow camera reacts to pointer dragging', () => {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Object3D();

  const followCamera = createFollowCamera(camera, target, {
    offset: new THREE.Vector3(0, 2, -6),
    lerp: 1,
    pointerSensitivity: 0.01
  });

  followCamera.syncImmediate?.();
  const initialPosition = camera.position.clone();

  const listeners = new Map();
  const pointerElement = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setPointerCapture() {},
    releasePointerCapture() {}
  };

  followCamera.setPointerLockElement?.(pointerElement);

  const pointerDown = listeners.get('pointerdown');
  assert.ok(pointerDown, 'pointerdown handler should be registered');
  pointerDown({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 10,
    clientY: 10
  });

  const pointerMove = listeners.get('pointermove');
  assert.ok(pointerMove, 'pointermove handler should be registered');
  pointerMove({
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 30,
    clientY: 6
  });

  const pointerUp = listeners.get('pointerup');
  assert.ok(pointerUp, 'pointerup handler should be registered');
  pointerUp({ pointerId: 1 });

  followCamera.update(undefined, 1 / 60);

  assert.ok(camera.position.x > initialPosition.x, 'camera should rotate horizontally');
  assert.ok(camera.position.y !== initialPosition.y || camera.position.z !== initialPosition.z);

  followCamera.dispose?.();
});
