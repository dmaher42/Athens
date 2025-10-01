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

const ATHENS_PLAN_PRESET = {
  Agora: { x: -40, y: 'ground', z: 30 },
  Stoa_of_Attalos: { x: -20, y: 'ground', z: 20 },
  Tholos: { x: -48, y: 'ground', z: 18 },
  Theater_of_Dionysus: { x: 35, y: 'ground', z: 15 },
  Stadium: { x: 80, y: 'ground', z: 10 },
  CityGate_South: { x: 10, y: 'ground', z: 110 },
  Port_Quay_A: { x: 10, y: 'ground', z: 160 },
  Houses_NW: { x: -90, y: 'ground', z: -60 },
  Houses_NE: { x: 40, y: 'ground', z: -80 },
  Temple_of_Hephaestus: { x: -60, y: 'ground', z: 45 },
  Parthenon: { x: 6, y: 'acropolis', z: -4 }
};

function applyConfigOverride(current, override) {
  if (!override) return current;

  if (override instanceof THREE.Vector3) {
    return { x: override.x, y: override.y, z: override.z };
  }

  if (Array.isArray(override)) {
    const [ox, oy, oz] = override;
    return {
      x: Number.isFinite(ox) ? ox : current.x,
      y: Number.isFinite(oy) ? oy : current.y,
      z: Number.isFinite(oz) ? oz : current.z
    };
  }

  if (typeof override === 'number') {
    return { ...current, y: override };
  }

  if (typeof override === 'object') {
    const next = { ...current };
    if ('x' in override && override.x !== undefined) {
      const parsed = Number(override.x);
      next.x = Number.isFinite(parsed) ? parsed : override.x;
    }
    if ('y' in override && override.y !== undefined) {
      const parsed = Number(override.y);
      next.y = Number.isFinite(parsed) ? parsed : override.y;
    }
    if ('z' in override && override.z !== undefined) {
      const parsed = Number(override.z);
      next.z = Number.isFinite(parsed) ? parsed : override.z;
    }
    return next;
  }

  return current;
}

function createLayoutResolver({ layout, layoutConfig, plateauHeight, sampleGround }) {
  const normalizedLayout = typeof layout === 'string' && layout ? layout : 'classic';
  const normalizedConfig = layoutConfig && typeof layoutConfig === 'object' ? layoutConfig : {};
  const positionOverrides =
    normalizedConfig.positions && typeof normalizedConfig.positions === 'object'
      ? normalizedConfig.positions
      : null;

  return (key, fallback = new THREE.Vector3()) => {
    const fallbackVec = fallback instanceof THREE.Vector3
      ? fallback.clone()
      : new THREE.Vector3(fallback?.x ?? 0, fallback?.y ?? 0, fallback?.z ?? 0);

    let resolved = fallbackVec.clone();

    if (normalizedLayout === 'athensPlan' && ATHENS_PLAN_PRESET[key]) {
      const preset = ATHENS_PLAN_PRESET[key];
      resolved.set(
        Number.isFinite(preset.x) ? preset.x : fallbackVec.x,
        preset.y ?? fallbackVec.y,
        Number.isFinite(preset.z) ? preset.z : fallbackVec.z
      );
    }

    const layers = [];
    if (normalizedConfig[key] !== undefined) layers.push(normalizedConfig[key]);
    if (positionOverrides?.[key] !== undefined) layers.push(positionOverrides[key]);

    let config = { x: resolved.x, y: resolved.y, z: resolved.z };
    for (const layer of layers) {
      config = applyConfigOverride(config, layer);
    }

    const finalX = Number.isFinite(config.x) ? config.x : fallbackVec.x;
    const finalZ = Number.isFinite(config.z) ? config.z : fallbackVec.z;

    let finalY = config.y;
    let snapToGround = false;

    if (finalY === 'ground') {
      const sample = sampleGround ? sampleGround(finalX, finalZ) : null;
      if (typeof sample === 'number' && Number.isFinite(sample)) {
        finalY = sample;
      } else {
        finalY = fallbackVec.y;
      }
      snapToGround = true;
    } else if (finalY === 'acropolis') {
      finalY = typeof plateauHeight === 'number' ? plateauHeight : fallbackVec.y;
    } else if (!Number.isFinite(finalY)) {
      finalY = fallbackVec.y;
    } else {
      snapToGround = false;
    }

    const position = new THREE.Vector3(
      Number.isFinite(finalX) ? finalX : fallbackVec.x,
      Number.isFinite(finalY) ? finalY : fallbackVec.y,
      Number.isFinite(finalZ) ? finalZ : fallbackVec.z
    );

    return { position, snapToGround };
  };
}

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

  const sampleGround = (x, z) => {
    const grounds = ensureGroundMeshes();
    if (!grounds.length) return null;
    return sampleGroundY(x, z, grounds, { fromY: 400 });
  };

  const resolveLayout = createLayoutResolver({
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
