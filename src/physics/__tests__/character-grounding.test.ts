import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { ensureCapsuleIntersection } from '../collisionWorld.ts';
import { CharacterController } from '../../controls/CharacterController.ts';

const NO_INPUT = { forward: 0, right: 0, jump: false, sprint: false } as const;

function createWorldFromGeometry(geometry: THREE.BufferGeometry) {
  const bvh = new MeshBVH(geometry, { lazyGeneration: false });
  ensureCapsuleIntersection(bvh);
  return { bvh, colliderMesh: null };
}

test('character remains grounded on a simple floor', () => {
  const camera = new THREE.PerspectiveCamera();
  const floor = new THREE.BoxGeometry(10, 1, 10);
  floor.translate(0, -0.5, 0);
  const world = createWorldFromGeometry(floor);

  const controller = new CharacterController(camera, new THREE.Vector3(0, 1, 0));

  for (let i = 0; i < 120; i += 1) {
    controller.update(1 / 60, NO_INPUT, world);
  }

  assert.ok(controller.onGround, 'controller should detect ground contact');
  assert.ok(controller.position.y >= 0.3, 'controller should not sink below the floor');
});

test('character slides up an inclined plane without tunneling', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.lookAt(new THREE.Vector3(0, 1.6, 1));

  const slope = new THREE.BoxGeometry(8, 0.5, 8);
  slope.rotateX(-Math.PI / 6);
  slope.translate(0, 2.5, 0);
  const world = createWorldFromGeometry(slope);

  const start = new THREE.Vector3(0, 1.0, -3.0);
  const controller = new CharacterController(camera, start);

  const input = { forward: 1, right: 0, jump: false, sprint: false };
  const initialY = controller.position.y;
  const initialZ = controller.position.z;

  for (let i = 0; i < 180; i += 1) {
    controller.update(1 / 60, input, world);
  }

  assert.ok(controller.position.y > initialY + 0.05, 'controller should climb the slope');
  assert.ok(
    Math.abs(controller.position.z - initialZ) > 0.05,
    'controller should advance along the slope'
  );
});
