import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createCityWalls } from './cityWalls.js';
import { createGround } from './ground.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround } from '../physics/groundProject.js';

export async function createCity({ renderer, scene, ground: groundOverrides } = {}) {
  const options = arguments[0] ?? {};
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

  // ACROPOLIS_START
  const acropolisMeta = (() => {
    const fallbackCenter = new THREE.Vector3(0, 0, 0);
    const sceneAcropolis = scene?.userData?.acropolis ?? {};

    const centerCandidate = groundResult?.acropolisCenter ?? sceneAcropolis.center ?? fallbackCenter;
    const center = fallbackCenter.clone();
    if (centerCandidate instanceof THREE.Vector3) {
      center.copy(centerCandidate);
    } else if (Array.isArray(centerCandidate)) {
      const [x = 0, y = 0, z = 0] = centerCandidate;
      center.set(x ?? 0, y ?? 0, z ?? 0);
    } else if (centerCandidate && typeof centerCandidate === 'object') {
      center.set(centerCandidate.x ?? 0, centerCandidate.y ?? 0, centerCandidate.z ?? 0);
    }

    const plateauHeight = typeof groundResult?.plateauHeight === 'number'
      ? groundResult.plateauHeight
      : (typeof sceneAcropolis.plateauHeight === 'number' ? sceneAcropolis.plateauHeight : 28);

    return { center, plateauHeight };
  })();
  // ACROPOLIS_END

  const acropolisCenter = acropolisMeta.center;
  const plateauY = acropolisMeta.plateauHeight;

  const parthenonPosition = new THREE.Vector3(acropolisCenter.x + 6, plateauY, acropolisCenter.z - 4);
  const parthenon = createParthenon(materials, { position: parthenonPosition });
  addAndSnap(parthenon);

  // ACROPOLIS_START
  const applyPlateauHeight = (object) => {
    if (!object?.isObject3D) {
      return;
    }
    object.position.y = acropolisMeta.plateauHeight;
  };

  const ensureNamedObject = (container, name) => {
    if (!container?.getObjectByName || typeof container.getObjectByName !== 'function') {
      return null;
    }
    return container.getObjectByName(name) ?? null;
  };

  const namedTargets = new Set();
  ['Parthenon', 'Acropolis'].forEach((name) => {
    const rootTarget = ensureNamedObject(root, name);
    const sceneTarget = ensureNamedObject(scene, name);
    if (rootTarget) {
      namedTargets.add(rootTarget);
    }
    if (sceneTarget) {
      namedTargets.add(sceneTarget);
    }
  });

  if (parthenon) {
    namedTargets.add(parthenon);
  }

  namedTargets.forEach((target) => applyPlateauHeight(target));
  // ACROPOLIS_END

  const agoraPosition = new THREE.Vector3(80, 0, -40);
  const agora = createAgora(materials, { position: agoraPosition });
  // AGORA_OVERRIDE_START
  if (options?.layoutConfig?.positions?.Agora) {
    const p = options.layoutConfig.positions.Agora;
    agora.position.set(p.x, p.y, p.z);
  }
  // AGORA_OVERRIDE_END
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
