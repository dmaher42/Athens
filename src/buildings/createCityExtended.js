import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createTemple } from './temple.js';
import { createStoa } from './stoa.js';
import { createTheater } from './theater.js';
import { createHouseBlock } from './houses.js';
import { createCityWalls, createGate } from './gatesWalls.js';
import { snapGroupToGround } from '../physics/groundProject.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';

export async function createCityExtended({ renderer, scene } = {}) {
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity_Extended';

  if (scene && typeof scene.add === 'function') {
    scene.add(root);
  }

  markGround(scene ?? root);
  const groundMeshes = collectGround(scene ?? root);

  const heph = createTemple(materials, {
    footprint: [22, 45],
    columns: [6, 13],
    position: new THREE.Vector3(-60, 0, 30),
    groundMeshes
  });
  heph.name = 'Temple_of_Hephaestus';
  root.add(heph);

  const stoa = createStoa(materials, {
    length: 120,
    depth: 16,
    colSpacing: 5,
    position: new THREE.Vector3(80, 0, -40),
    groundMeshes
  });
  stoa.name = 'Stoa_of_Attalos';
  root.add(stoa);

  const theater = createTheater(materials, {
    radius: 55,
    steps: 18,
    position: new THREE.Vector3(150, 0, 120),
    groundMeshes
  });
  theater.name = 'Theater_of_Dionysus';
  root.add(theater);

  const housesNW = createHouseBlock(materials, {
    rows: 3,
    cols: 4,
    spacing: 14,
    position: new THREE.Vector3(40, 0, -100),
    groundMeshes
  });
  housesNW.name = 'Houses_NW';
  root.add(housesNW);

  const housesNE = createHouseBlock(materials, {
    rows: 3,
    cols: 4,
    spacing: 14,
    position: new THREE.Vector3(120, 0, -100),
    groundMeshes
  });
  housesNE.name = 'Houses_NE';
  root.add(housesNE);

  const wallPath = [
    new THREE.Vector3(-220, 0, -200),
    new THREE.Vector3(220, 0, -200),
    new THREE.Vector3(220, 0, 220),
    new THREE.Vector3(-220, 0, 220),
    new THREE.Vector3(-220, 0, -200)
  ];
  const walls = createCityWalls(materials, {
    path: wallPath,
    towerEvery: 120,
    height: 9,
    thickness: 4,
    groundMeshes
  });
  walls.name = 'CityWalls';
  root.add(walls);

  const gate = createGate(materials, {
    width: 10,
    height: 8,
    position: new THREE.Vector3(0, 0, -200),
    facingYaw: 0,
    thickness: 4,
    groundMeshes
  });
  gate.name = 'CityGate_North';
  root.add(gate);

  root.children.forEach((child) => {
    if (!groundMeshes.length) return;
    snapGroupToGround(child, groundMeshes, { hover: 0.03 });
  });

  return { root, materials };
}

export default createCityExtended;
