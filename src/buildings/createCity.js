import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createCityWalls } from './cityWalls.js';
import { createGround } from './ground.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround } from '../physics/groundProject.js';

export async function createCity({ renderer, scene } = {}) {
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity';

  if (scene && typeof scene.add === 'function' && !scene.children.includes(root)) {
    scene.add(root);
  }

  const ground = createGround(materials, { size: 1000, repeat: 80 });
  root.add(ground);

  const registryRoot = scene ?? root;
  markGround(registryRoot);
  let groundMeshes = collectGround(registryRoot);

  const ensureGroundMeshes = () => {
    if (!groundMeshes?.length) {
      groundMeshes = collectGround(registryRoot);
    }
    return groundMeshes;
  };

  const updateWorldMatrices = () => {
    if (scene?.updateMatrixWorld) {
      scene.updateMatrixWorld(true);
    } else {
      root.updateMatrixWorld(true);
    }
  };

  const addAndSnap = (group) => {
    if (!group) {
      return;
    }
    root.add(group);
    updateWorldMatrices();
    const grounds = ensureGroundMeshes();
    if (grounds.length) {
      snapGroupToGround(group, grounds, { hover: 0.03, fromY: 300 });
      updateWorldMatrices();
    }
  };

  const parthenonPosition = new THREE.Vector3(0, 6, 0);
  const parthenon = createParthenon(materials, { position: parthenonPosition });
  addAndSnap(parthenon);

  const agoraPosition = new THREE.Vector3(80, 0, -40);
  const agora = createAgora(materials, { position: agoraPosition });
  addAndSnap(agora);

  const wallsPath = [
    new THREE.Vector3(-200, 0, -200),
    new THREE.Vector3(200, 0, -200),
    new THREE.Vector3(200, 0, 200),
    new THREE.Vector3(-200, 0, 200),
    new THREE.Vector3(-200, 0, -200)
  ];
  const walls = createCityWalls(materials, { path: wallsPath });
  addAndSnap(walls);

  updateWorldMatrices();

  return { root, materials };
}
