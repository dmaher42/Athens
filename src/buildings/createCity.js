import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createParthenon } from './parthenon.js';
import { createAgora } from './agora.js';
import { createCityWalls } from './cityWalls.js';
import { createGround } from './ground.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround } from '../physics/groundProject.js';

// LAYOUT_APPLY_START
// Lightweight post-build layout applier: respects options.layoutConfig.positions and spacing
const __LANDMARK_KEYS = [
  'Agora', 'Stoa', 'Stoa_of_Attalos', 'Tholos', 'Theater', 'Theater_of_Dionysus', 'Stadium', 'CityGate', 'CityGate_South', 'Port', 'Port_Quay_A'
];
const __NAME_ALIASES = {
  Agora: ['Agora', 'AgoraGroup'],
  Stoa: ['Stoa', 'Stoa_of_Attalos', 'StoaAttalos'],
  Stoa_of_Attalos: ['Stoa_of_Attalos', 'Stoa', 'StoaAttalos'],
  Tholos: ['Tholos'],
  Theater: ['Theater', 'Theatre', 'Theater_of_Dionysus', 'Theatre_of_Dionysus'],
  Theater_of_Dionysus: ['Theater_of_Dionysus', 'Theatre_of_Dionysus', 'Theater', 'Theatre'],
  Stadium: ['Stadium', 'Stadion'],
  CityGate: ['CityGate', 'SouthGate', 'Gate_South', 'CityGate_South'],
  CityGate_South: ['CityGate_South', 'CityGate', 'SouthGate', 'Gate_South'],
  Port: ['Port', 'Harbor', 'Harbour', 'Quay', 'Port_Quay_A'],
  Port_Quay_A: ['Port_Quay_A', 'Port', 'Harbor', 'Harbour', 'Quay']
};

function __findByNames(root, names) {
  if (!root) return null;
  // exact first
  for (const n of names) {
    const hit = root.getObjectByName?.(n);
    if (hit) return hit;
  }
  // fuzzy
  const lowers = names.map((n) => String(n).toLowerCase());
  let best = null;
  root.traverse?.((o) => {
    if (!o?.name) return;
    const nm = o.name.toLowerCase();
    for (const needle of lowers) {
      if (nm === needle || nm.includes(needle)) {
        best = best || o;
        break;
      }
    }
  });
  return best;
}

function __setWorldPositionSafe(obj, x, y, z) {
  if (!obj) return false;
  try {
    const T = (typeof THREE !== 'undefined') ? THREE : (globalThis?.THREE);
    if (obj.parent && obj.parent.worldToLocal && T?.Vector3) {
      obj.parent.updateMatrixWorld?.(true);
      const wp = new T.Vector3(x, y, z);
      obj.position.copy(obj.parent.worldToLocal(wp));
    } else {
      // fallback: local set (may be off if parent is transformed, but safe)
      obj.position.set(x, y, z);
    }
    obj.updateMatrixWorld?.(true);
    return true;
  } catch {
    obj.position.set(x, y, z);
    return true;
  }
}

function __applyAthensLayout(root, options) {
  const cfg = options?.layoutConfig || {};
  const spacingMul = Number.isFinite(cfg.spacing) ? cfg.spacing : 1.0;
  const overrides = cfg.positions || {};
  // very simple spread defaults (scaled by spacing)
  const defaults = {
    Agora: { x: 0, y: 80, z: 0 },
    Stoa: { x: 200, y: 82, z: 50 },
    Stoa_of_Attalos: { x: 200, y: 82, z: 50 },
    Tholos: { x: -150, y: 82, z: 80 },
    Theater: { x: 300, y: 78, z: -200 },
    Theater_of_Dionysus: { x: 300, y: 78, z: -200 },
    Stadium: { x: -300, y: 85, z: 250 },
    CityGate: { x: 0, y: 80, z: -400 },
    CityGate_South: { x: 0, y: 80, z: -420 },
    Port: { x: 0, y: 75, z: 500 },
    Port_Quay_A: { x: 80, y: 75, z: 520 }
  };
  // apply spacing multiplier
  for (const k of Object.keys(defaults)) {
    defaults[k] = { x: defaults[k].x * spacingMul, y: defaults[k].y, z: defaults[k].z * spacingMul };
  }

  const results = {};
  for (const key of __LANDMARK_KEYS) {
    const aliases = __NAME_ALIASES[key] || [key];
    const obj = __findByNames(root, aliases);
    if (!obj) {
      results[key] = 'not-found';
      continue;
    }
    const src = overrides[key] || defaults[key];
    if (!src) {
      results[key] = 'no-pos';
      continue;
    }
    const x = Number.isFinite(src.x) ? src.x : obj.position.x;
    const y = Number.isFinite(src.y) ? src.y : obj.position.y;
    const z = Number.isFinite(src.z) ? src.z : obj.position.z;
    const ok = __setWorldPositionSafe(obj, x, y, z);
    results[key] = ok ? `moved (${x.toFixed?.(2) || x}, ${y.toFixed?.(2) || y}, ${z.toFixed?.(2) || z})` : 'failed';
  }
  try {
    console.info('[Athens/Layout]', results);
  } catch {}
}
// LAYOUT_APPLY_END

export async function createCity({ renderer, scene, ground: groundOverrides } = {}) {
  const options = arguments[0] ?? {};
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity';

  if (scene && typeof scene.add === 'function' && !scene.children.includes(root)) {
    scene.add(root);
  }

  const defaultGroundOptions = { size: 1000, repeat: 80 };
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

  // LAYOUT_APPLY_START
  // If using athensPlan, apply layout overrides/spread after build so nothing is squashed.
  if (options?.layout === 'athensPlan') {
    __applyAthensLayout(scene ?? root, options);
  } else if (options?.layoutConfig?.positions) {
    // even without athensPlan flag, respect explicit positions when provided
    __applyAthensLayout(scene ?? root, options);
  }
  // LAYOUT_APPLY_END

  return { root, materials };
}
