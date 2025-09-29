import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createCityWalls } from './cityWalls.js';
import { createGround } from './ground.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround } from '../physics/groundProject.js';

export async function createCity({ renderer, scene, ground: groundOverrides } = {}) {
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity';

  if (scene && typeof scene.add === 'function' && !scene.children.includes(root)) {
    scene.add(root);
  }

  const defaultGroundOptions = { size: 1000, repeat: 80 };
  const groundOptions = {
    ...defaultGroundOptions,
    ...(groundOverrides ?? {}),
  };
  if (groundOptions.renderer === undefined) {
    groundOptions.renderer = renderer;
  }

  const groundResult = await createGround(scene, materials, groundOptions);
  const groundGroup = groundResult?.group ?? groundResult;
  if (groundGroup) {
    root.add(groundGroup);
  }

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

  const fallbackAcropolisCenter = new THREE.Vector3(0, 0, 0);
  const sceneAcropolis = scene?.userData?.acropolis ?? {};
  const acropolisCenterSource =
    groundResult?.acropolisCenter ??
    sceneAcropolis.center ??
    fallbackAcropolisCenter;
  const acropolisCenter = acropolisCenterSource instanceof THREE.Vector3
    ? acropolisCenterSource.clone()
    : new THREE.Vector3(acropolisCenterSource?.x ?? 0, acropolisCenterSource?.y ?? 0, acropolisCenterSource?.z ?? 0);

  const plateauY =
    typeof groundResult?.plateauHeight === 'number'
      ? groundResult.plateauHeight
      : (typeof sceneAcropolis.plateauHeight === 'number' ? sceneAcropolis.plateauHeight : 28);

  const parthenonPosition = new THREE.Vector3(acropolisCenter.x + 6, plateauY, acropolisCenter.z - 4);
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
