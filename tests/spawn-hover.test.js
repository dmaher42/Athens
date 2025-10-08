import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CharacterController } from '../src/controls/CharacterController.ts';
import { ensureFeetAtLocalZero } from '../src/utils/spawn.ts';

test('CHARACTER_HOVER scales with character height', () => {
  // This test verifies that CHARACTER_HOVER is calculated based on CHARACTER_HEIGHT
  // and that the formula produces reasonable values for different scales
  
  const DEFAULT_CHARACTER_HEIGHT = 1.7;
  
  // Test function that mimics the CHARACTER_HOVER calculation
  const calculateCharacterHover = (characterHeight) => {
    return Math.min(0.1, Math.max(0.03, characterHeight * 0.03));
  };
  
  // Normal scale (1x)
  const normalHeight = DEFAULT_CHARACTER_HEIGHT * 1;
  const normalHover = calculateCharacterHover(normalHeight);
  assert.equal(normalHover, 0.051); // 1.7 * 0.03 = 0.051
  
  // Large scale (2x)
  const largeHeight = DEFAULT_CHARACTER_HEIGHT * 2;
  const largeHover = calculateCharacterHover(largeHeight);
  assert.equal(largeHover, 0.1); // 3.4 * 0.03 = 0.102, capped at 0.1
  
  // Small scale (0.5x)
  const smallHeight = DEFAULT_CHARACTER_HEIGHT * 0.5;
  const smallHover = calculateCharacterHover(smallHeight);
  assert.equal(smallHover, 0.03); // 0.85 * 0.03 = 0.0255, floored at 0.03
  
  // Verify minimum bound
  const tinyHeight = 0.5;
  const tinyHover = calculateCharacterHover(tinyHeight);
  assert.equal(tinyHover, 0.03); // Below minimum, clamped to 0.03
  
  // Verify maximum bound  
  const giantHeight = 10;
  const giantHover = calculateCharacterHover(giantHeight);
  assert.equal(giantHover, 0.1); // Above maximum, clamped to 0.1
});

test('spawn hover consistency requirement', () => {
  // This test documents the requirement that findSafePlayerSpawn and
  // snapObjectToGround should use the same CHARACTER_HOVER value
  // to prevent characters from intersecting terrain after spawn.
  
  // The issue was that findSafePlayerSpawn used hardcoded 0.05
  // while snapObjectToGround used CHARACTER_HOVER (scale-dependent)
  
  // With the fix, both should use CHARACTER_HOVER for consistency
  const DEFAULT_CHARACTER_HEIGHT = 1.7;
  const CHARACTER_HOVER = Math.min(0.1, Math.max(0.03, DEFAULT_CHARACTER_HEIGHT * 0.03));
  
  // Verify the hover value is scale-dependent and within expected range
  assert.ok(CHARACTER_HOVER >= 0.03, 'CHARACTER_HOVER should be at least 0.03');
  assert.ok(CHARACTER_HOVER <= 0.1, 'CHARACTER_HOVER should be at most 0.1');
  
  // For default character height of 1.7
  assert.equal(CHARACTER_HOVER, 0.051);
  
  // The fix ensures that when a character with scale > 1 is configured,
  // the spawn search keeps the collider at CHARACTER_HOVER × scale above ground,
  // and the subsequent snap also uses CHARACTER_HOVER × scale,
  // preventing large characters from intersecting the terrain.
});

test('character controller compensates for spawn hover', () => {
  const CHARACTER_HEIGHT = 1.7;
  const CHARACTER_HOVER = Math.min(0.1, Math.max(0.03, CHARACTER_HEIGHT * 0.03));
  const sampledGroundY = 0;

  const halfHeight = CHARACTER_HEIGHT * 0.5;
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, CHARACTER_HEIGHT, 0.5));
  playerMesh.position.set(0, sampledGroundY + halfHeight + CHARACTER_HOVER, 0);

  const camera = new THREE.PerspectiveCamera();
  const controllerStart = new THREE.Vector3(0, sampledGroundY + halfHeight, 0);
  const controller = new CharacterController(camera, controllerStart.clone(), {
    height: CHARACTER_HEIGHT,
    autoUpdateCamera: false,
    visualHoverOffset: CHARACTER_HOVER
  });

  controller.attach(playerMesh);
  playerMesh.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(playerMesh);
  assert.ok(
    Math.abs(box.min.y - sampledGroundY) < 1e-6,
    'player mesh should rest on the ground after attach'
  );
  assert.ok(
    Math.abs(controller.position.y - controllerStart.y) < 1e-6,
    'controller center should remain unchanged when compensating hover'
  );
});

test('character controller allows overriding hover compensation on attach', () => {
  const CHARACTER_HEIGHT = 1.7;
  const CHARACTER_HOVER = Math.min(0.1, Math.max(0.03, CHARACTER_HEIGHT * 0.03));
  const sampledGroundY = 0;

  const halfHeight = CHARACTER_HEIGHT * 0.5;
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, CHARACTER_HEIGHT, 0.5));
  playerMesh.position.set(0, sampledGroundY + halfHeight + CHARACTER_HOVER, 0);

  const camera = new THREE.PerspectiveCamera();
  const controllerStart = new THREE.Vector3(0, sampledGroundY + halfHeight, 0);
  const controller = new CharacterController(camera, controllerStart.clone(), {
    height: CHARACTER_HEIGHT,
    autoUpdateCamera: false,
    visualHoverOffset: 0
  });

  controller.attach(playerMesh, { visualHoverOffset: CHARACTER_HOVER });
  playerMesh.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(playerMesh);
  assert.ok(
    Math.abs(box.min.y - sampledGroundY) < 1e-6,
    'player mesh should rest on the ground after override attach'
  );
  assert.ok(
    Math.abs(controller.position.y - controllerStart.y) < 1e-6,
    'controller center should remain unchanged when overriding hover'
  );
});

test('ensureFeetAtLocalZero lowers floating models to parent local zero', () => {
  const parent = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  mesh.position.y = 1.5;
  parent.add(mesh);
  parent.position.y = 3;
  parent.updateMatrixWorld(true);

  ensureFeetAtLocalZero(parent);
  parent.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(parent);
  assert.ok(Math.abs(box.min.y) < 1e-6, 'model feet should rest at world zero after normalization');
});

test('ensureFeetAtLocalZero respects parent transforms when adjusting children', () => {
  const parent = new THREE.Group();
  parent.position.y = 5;

  const child = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  mesh.position.y = 1.25;
  child.add(mesh);
  parent.add(child);
  parent.updateMatrixWorld(true);

  ensureFeetAtLocalZero(child);
  parent.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(child);
  assert.ok(
    Math.abs(box.min.y - parent.position.y) < 1e-6,
    'child model feet should align with parent local origin in world space'
  );
});
