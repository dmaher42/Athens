import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createGround } from './ground.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround, sampleGroundY } from '../physics/groundProject.js';
import { createTemple } from './temple.js';
import { createStoa } from './stoa.js';
import { createTheater } from './theater.js';
import { createHouseBlock } from './houses.js';
import { createCityWalls as createExtendedWalls, createGate } from './gatesWalls.js';
import { createTholos } from './tholos.js';
import { createStadium } from './stadium.js';
import { createPort } from './port.js';
import { createLandmarkLayoutResolver } from '../config/landmarkLayout.ts';

export async function createCity(options = {}) {
  const { renderer, scene, ground: groundOverrides, layout, layoutConfig } = options ?? {};
  const variant = options?.variant === 'legacy' ? 'legacy' : 'merged';

  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity';

  if (scene && typeof scene.add === 'function' && !scene.children.includes(root)) {
    scene.add(root);
  }

  const defaultGroundOptions = { size: 1000, repeat: 80 };

  // ---- Resolved ground handling (from codex/update-city-building-ground-handling) ----
  const groundConfig = groundOverrides ?? {};
  const {
    existing: existingGround = null,
    useExisting = false,
    skipCreate = false,
    ...legacyGroundOverrides
  } = groundConfig;
  const layeredGroundRoot = existingGround?.root ?? null;
  const hasLayeredGround = Boolean(layeredGroundRoot?.userData?.layeredGround);
  const shouldReuseExistingGround = hasLayeredGround || useExisting || skipCreate;

  let groundResult = null;
  if (!shouldReuseExistingGround) {
    const groundOptions = {
      ...defaultGroundOptions,
      ...legacyGroundOverrides,
    };
    if (groundOptions.renderer === undefined) {
      groundOptions.renderer = renderer;
    }

    groundResult = await createGround(scene, materials, groundOptions);
    const groundGroup = groundResult?.group ?? groundResult;
    if (groundGroup) {
      root.add(groundGroup);
    }
  } else {
    groundResult = existingGround ?? null;
  }
  // -------------------------------------------------------------------------------

  const layeredGroundMeshes = [];
  if (hasLayeredGround) {
    const layeredTiles = Array.isArray(existingGround?.tiles) ? existingGround.tiles : [];
    layeredTiles.forEach((tile, index) => {
      if (tile?.dirtGroup?.isObject3D) {
        tile.dirtGroup.userData = tile.dirtGroup.userData || {};
        tile.dirtGroup.userData.isGround = true;
        tile.dirtGroup.name = tile.dirtGroup.name || `ground:dirt:tile:${index}`;
      }
      if (tile?.dirtMesh?.isMesh) {
        tile.dirtMesh.userData = tile.dirtMesh.userData || {};
        tile.dirtMesh.userData.isGround = true;
        tile.dirtMesh.name = tile.dirtMesh.name || `ground:dirt:mesh:${index}`;
        layeredGroundMeshes.push(tile.dirtMesh);
      }
    });

    if (layeredGroundRoot) {
      layeredGroundRoot.userData = layeredGroundRoot.userData || {};
      layeredGroundRoot.userData.isGround = true;
    }
  }

  const registryRoot = scene ?? root;
  if (hasLayeredGround && layeredGroundRoot) {
    markGround(layeredGroundRoot);
  }
  markGround(registryRoot);
  let groundMeshes = collectGround(registryRoot);
  if (layeredGroundMeshes.length) {
    const merged = new Set(groundMeshes);
    layeredGroundMeshes.forEach((mesh) => {
      if (!merged.has(mesh)) {
        merged.add(mesh);
        groundMeshes.push(mesh);
      }
    });
  }

  const ensureGroundMeshes = () => {
    if (!groundMeshes?.length) {
      groundMeshes = collectGround(registryRoot);
      if (layeredGroundMeshes.length) {
        const merged = new Set(groundMeshes);
        layeredGroundMeshes.forEach((mesh) => {
          if (!merged.has(mesh)) {
            merged.add(mesh);
            groundMeshes.push(mesh);
          }
        });
      }
    }
    if (!groundMeshes?.length && layeredGroundMeshes.length) {
      return layeredGroundMeshes;
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

  const addToRoot = (group, { snap = true } = {}) => {
    if (!group) return;
    root.add(group);
    updateWorldMatrices();
    if (!snap) return;

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

  const sampleGround = (x, z, fallbackY) => {
    const grounds = ensureGroundMeshes();
    if (!grounds.length) return fallbackY;
    const sample = sampleGroundY(x, z, grounds, { fromY: 400 });
    return sample == null ? fallbackY : sample;
  };

  const resolveLayout = createLandmarkLayoutResolver({
    layout,
    layoutConfig,
    plateauHeight: acropolisMeta.plateauHeight,
    sampleGround
  });

  const acropolisCenter = acropolisMeta.center;
  const plateauY = acropolisMeta.plateauHeight;

  const parthenonFallback = new THREE.Vector3(acropolisCenter.x + 6, plateauY, acropolisCenter.z - 4);
  const parthenonConfig = resolveLayout('Parthenon', parthenonFallback);
  const parthenon = createParthenon(materials, { position: parthenonConfig.position.clone() });
  addToRoot(parthenon, { snap: false });

  const applyPlateauHeight = (object) => {
    if (!object?.isObject3D) return;
    object.position.y = acropolisMeta.plateauHeight;
  };

  const ensureNamedObject = (container, name) => {
    if (!container?.getObjectByName || typeof container.getObjectByName !== 'function') return null;
    return container.getObjectByName(name) ?? null;
  };

  const namedTargets = new Set();
  ['Parthenon', 'Acropolis'].forEach((name) => {
    const rootTarget = ensureNamedObject(root, name);
    const sceneTarget = ensureNamedObject(scene, name);
    if (rootTarget) namedTargets.add(rootTarget);
    if (sceneTarget) namedTargets.add(sceneTarget);
  });

  if (parthenon) namedTargets.add(parthenon);
  namedTargets.forEach((target) => applyPlateauHeight(target));

  const agoraFallback = new THREE.Vector3(80, 0, -40);
  const agoraConfig = resolveLayout('Agora', agoraFallback);
  const agora = createAgora(materials, { position: agoraConfig.position.clone() });
  addToRoot(agora, { snap: agoraConfig.snapToGround });

  const wallsPath = [
    new THREE.Vector3(-220, 0, -200),
    new THREE.Vector3(220, 0, -200),
    new THREE.Vector3(220, 0, 220),
    new THREE.Vector3(-220, 0, 220),
    new THREE.Vector3(-220, 0, -200)
  ];

  const walls = createExtendedWalls(materials, {
    path: wallsPath,
    towerEvery: 120,
    height: 9,
    thickness: 4,
    groundMeshes: ensureGroundMeshes()
  });
  if (walls) {
    walls.name = 'CityWalls';
    addToRoot(walls, { snap: false });
  }

  const gateFallback = new THREE.Vector3(0, 0, -200);
  const gateConfig = resolveLayout('CityGate_South', gateFallback);
  const gate = createGate(materials, {
    width: 10,
    height: 8,
    position: gateConfig.position.clone(),
    facingYaw: 0,
    thickness: 4,
    groundMeshes: ensureGroundMeshes()
  });
  if (gate) {
    gate.name = 'CityGate_South';
    if (!gate.getObjectByName('CityGate')) {
      const alias = new THREE.Object3D();
      alias.name = 'CityGate';
      gate.add(alias);
    }
    addToRoot(gate, { snap: false });
  }

  if (variant !== 'legacy') {
    const prefabGrounds = ensureGroundMeshes();

    const templeFallback = new THREE.Vector3(-60, 0, 45);
    const templeConfig = resolveLayout('Temple_of_Hephaestus', templeFallback);
    const heph = createTemple(materials, {
      footprint: [22, 45],
      columns: [6, 13],
      position: templeConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (heph) {
      heph.name = 'Temple_of_Hephaestus';
      addToRoot(heph, { snap: false });
    }

    const stoaFallback = new THREE.Vector3(80, 0, -40);
    const stoaConfig = resolveLayout('Stoa_of_Attalos', stoaFallback);
    const stoa = createStoa(materials, {
      length: 120,
      depth: 16,
      colSpacing: 5,
      position: stoaConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (stoa) {
      stoa.name = 'Stoa_of_Attalos';
      addToRoot(stoa, { snap: false });
    }

    const tholosFallback = new THREE.Vector3(-48, 0, 18);
    const tholosConfig = resolveLayout('Tholos', tholosFallback);
    const tholos = createTholos(materials, { position: tholosConfig.position.clone() });
    if (tholos) {
      addToRoot(tholos, { snap: tholosConfig.snapToGround });
    }

    const theaterFallback = new THREE.Vector3(150, 0, 120);
    const theaterConfig = resolveLayout('Theater_of_Dionysus', theaterFallback);
    const theater = createTheater(materials, {
      radius: 55,
      steps: 18,
      position: theaterConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (theater) {
      theater.name = 'Theater_of_Dionysus';
      addToRoot(theater, { snap: false });
    }

    const stadiumFallback = new THREE.Vector3(-180, 0, -260);
    const stadiumConfig = resolveLayout('Stadium', stadiumFallback);
    const stadium = createStadium(materials, {
      position: stadiumConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (stadium) {
      addToRoot(stadium, { snap: false });
    }

    const housesNWFallback = new THREE.Vector3(-90, 0, -60);
    const housesNWConfig = resolveLayout('Houses_NW', housesNWFallback);
    const housesNW = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: housesNWConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (housesNW) {
      housesNW.name = 'Houses_NW';
      addToRoot(housesNW, { snap: false });
    }

    const housesNEFallback = new THREE.Vector3(40, 0, -80);
    const housesNEConfig = resolveLayout('Houses_NE', housesNEFallback);
    const housesNE = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: housesNEConfig.position.clone(),
      groundMeshes: prefabGrounds
    });
    if (housesNE) {
      housesNE.name = 'Houses_NE';
      addToRoot(housesNE, { snap: false });
    }

    const portFallback = new THREE.Vector3(10, 0, 160);
    const portConfig = resolveLayout('Port_Quay_A', portFallback);
    const port = createPort(materials, { position: portConfig.position.clone() });
    if (port) {
      addToRoot(port, { snap: portConfig.snapToGround });
    }
  }

  updateWorldMatrices();

  return { root, materials };
}

export default createCity;
