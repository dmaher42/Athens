// src/ground/index.js
import * as THREE from 'three';
import { createDirtGround } from './dirt.js';
import { createGrassGround } from './grass.js';

/**
 * Enumerates available ground types.
 */
export const GroundType = Object.freeze({
  DIRT: 'dirt',
  GRASS: 'grass',
});

/**
 * Builds a layered ground group containing separate dirt and grass groups.
 * You can toggle visibility on each layer independently.
 *
 * @param {Object} options
 * @param {Object} [options.dirtOptions]  - Options passed to createDirtGround
 * @param {Object} [options.grassOptions] - Options passed to createGrassGround
 * @param {boolean} [options.showDirt=true]
 * @param {boolean} [options.showGrass=true]
 * @returns {{ root: THREE.Group, dirt: THREE.Group, grass: THREE.Group }}
 */
export function createGroundLayered({
  dirtOptions = {},
  grassOptions = {},
  showDirt = true,
  showGrass = true,
} = {}) {
  const root = new THREE.Group();
  root.name = 'ground:root';

  const dirt = createDirtGround(dirtOptions);
  const grass = createGrassGround(grassOptions);

  dirt.visible = !!showDirt;
  grass.visible = !!showGrass;

  root.add(dirt);
  root.add(grass);

  return { root, dirt, grass };
}
