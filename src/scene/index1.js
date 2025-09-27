import * as THREE from 'three';
import { createDirtGround } from './dirt.js';
import { createGrassGround } from './grass.js';

export const GroundType = Object.freeze({
  DIRT: 'dirt',
  GRASS: 'grass',
});

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
