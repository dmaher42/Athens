import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createCityWalls } from './cityWalls.js';
import { createGround } from './ground.js';

export async function createCity({ renderer, scene } = {}) {
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity';

  const ground = createGround(materials, { size: 1000, repeat: 80 });
  root.add(ground);

  const parthenonPosition = new THREE.Vector3(0, 6, 0);
  const parthenon = createParthenon(materials, { position: parthenonPosition });
  root.add(parthenon);

  const agoraPosition = new THREE.Vector3(80, 0, -40);
  const agora = createAgora(materials, { position: agoraPosition });
  root.add(agora);

  const wallsPath = [
    new THREE.Vector3(-200, 0, -200),
    new THREE.Vector3(200, 0, -200),
    new THREE.Vector3(200, 0, 200),
    new THREE.Vector3(-200, 0, 200),
    new THREE.Vector3(-200, 0, -200)
  ];
  const walls = createCityWalls(materials, { path: wallsPath });
  root.add(walls);

  if (scene && typeof scene.add === 'function') {
    scene.add(root);
  }

  return { root, materials };
}
