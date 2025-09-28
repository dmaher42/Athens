import * as THREE from 'three';
import { createStats } from '../debug/statsShim.js';
import { setupGround, updateTrees } from '../main.js';
import { loadLandmarks } from '../landmarks-loader.js';
import { createLandmarkOverlay } from '../map/landmarks.js';
import { buildRoadNetwork } from '../roads/roadNetwork.js';
import { collectRoadPoints } from '../roads/collectRoadPoints.js';
import { createNpcManager } from '../npc/npcSystem.js';
import { createMainCharacter } from '../npc/mainCharacter.js';
import { createKeyboard } from '../input/keyboard.js';
import { createFollowCamera } from '../camera/followCamera.js';
import { createPlayerController } from '../player/playerController.js';
import { assetUrl } from '../utils/assetUrl.js';
import { createGameLoop } from '../engine/loop.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';
import { sampleGroundY, snapGroupToGround, snapObjectToGround, snapChildrenToGround } from '../physics/groundProject.js';
import { createCity } from '../buildings/createCity.js';
import { createCityExtended } from '../buildings/createCityExtended.js';
import { createOriginalUi } from '../ui/originalUi.js';
import { createTimeSky, setTimeOfDay, getTimeOfDay, attachTimeHotkeys } from '../sky/timeSky.js';
import { loadGrassMaterial } from '../materials/groundGrass.js';
import { buildNavMeshFromMeshes } from '../navmesh/buildNavMesh.js';
import { createNavMeshPathfinder } from '../navmesh/pathfinder.js';

const DEFAULT_STATS_STYLE = 'position:fixed;left:0;top:0;z-index:9999';

let stats = null;
let statsVisible = true;

const updateStatsVisibility = () => {
  const panel = stats?.dom;
  if (panel) {
    panel.style.display = statsVisible ? '' : 'none';
  }
};

const registerGlobalStatsHelpers = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.getStats !== 'function') {
    window.getStats = () => stats;
  }

  window.toggleStatsVisibility = (forceVisible) => {
    if (typeof forceVisible === 'boolean') {
      statsVisible = forceVisible;
    } else {
      statsVisible = !statsVisible;
    }
    updateStatsVisibility();
    return statsVisible;
  };
};

const statsReady = (async () => {
  stats = await createStats();
  if (stats.dom && typeof document !== 'undefined' && document.body) {
    stats.dom.style.cssText = DEFAULT_STATS_STYLE;
    document.body.appendChild(stats.dom);
  }
  registerGlobalStatsHelpers();
  updateStatsVisibility();
  return stats;
})();

const ENVIRONMENT_LABELS = {
  high_noon: 'High Noon',
  day: 'High Noon',
  golden_hour: 'Golden Hour',
  dawn: 'Golden Dawn',
  dusk: 'Dusk',
  midnight: 'Midnight',
  night: 'Midnight'
};

const formatEnvironmentLabel = (mode) => {
  if (!mode) return '';
  const normalized = String(mode).toLowerCase();
  return ENVIRONMENT_LABELS[normalized] || normalized.replace(/_/g, ' ');
};

const DEFAULT_CONTAINER_ID = 'app';
const DEFAULT_OVERLAY_ID = 'landmark-overlay';
const DEFAULT_GEOJSON_URL = 'data/athens_places.geojson';

const DEFAULT_NPC_MODEL_URLS = [
  'models/Adventurer1.glb',
  'models/brokenCHar.glb',
  'models/character3.glb',
  assetUrl('assets/models/hoplite_npc.glb'),
  assetUrl('assets/models/npc_athenian.glb')
];

function buildNpcPatrolPath(radius, angle, height = 0) {
  const baseX = Math.cos(angle) * radius;
  const baseZ = Math.sin(angle) * radius;
  const offset = Math.max(2, radius * 0.25);
  const waypoint = (x, z) => ({ x, y: height, z });
  return [
    waypoint(baseX, baseZ),
    waypoint(baseX + Math.cos(angle + Math.PI / 4) * offset, baseZ + Math.sin(angle + Math.PI / 4) * offset),
    waypoint(baseX + Math.cos(angle - Math.PI / 4) * offset, baseZ + Math.sin(angle - Math.PI / 4) * offset)
  ];
}

function createDefaultNpcConfigs(modelUrls = DEFAULT_NPC_MODEL_URLS) {
  if (!Array.isArray(modelUrls) || modelUrls.length === 0) return [];
  const radius = 18;
  return modelUrls.map((modelUrl, index) => {
    const angle = (index / modelUrls.length) * Math.PI * 2;
    const waypoints = buildNpcPatrolPath(radius, angle);
    return { modelUrl, initialPosition: waypoints[0], waypoints };
  });
}

const DEFAULT_PLAYER_START = new THREE.Vector3(6, 0, -12);
const PLAYER_SEARCH_STEP = 4;
const PLAYER_SEARCH_RINGS = 10;
const PLAYER_COLLIDER_MARGIN = 1.5;

const _spawnCandidate = new THREE.Vector3();

function toVector3(input, fallback = DEFAULT_PLAYER_START) {
  if (!input) return fallback.clone();
  if (input.isVector3) return input.clone();
  const result = fallback.clone();
  const { x, y, z } = input;
  if (Number.isFinite(x)) result.x = Number(x);
  if (Number.isFinite(y)) result.y = Number(y);
  if (Number.isFinite(z)) result.z = Number(z);
  return result;
}

function pointIntersectsColliders(x, y, z, colliders, margin = PLAYER_COLLIDER_MARGIN) {
  if (!Array.isArray(colliders) || colliders.length === 0) return false;
  for (let i = 0; i < colliders.length; i += 1) {
    const entry = colliders[i];
    const box = entry?.box;
    if (!box) continue;
    const minX = box.min.x - margin;
    const maxX = box.max.x + margin;
    if (x < minX || x > maxX) continue;
    const minZ = box.min.z - margin;
    const maxZ = box.max.z + margin;
    if (z < minZ || z > maxZ) continue;
    const minY = box.min.y - 2;
    const maxY = box.max.y + 3;
    if (y >= minY && y <= maxY) {
      return true;
    }
  }
  return false;
}

function findSafePlayerSpawn({
  hint,
  groundMeshes,
  colliders,
  hover = 0.05,
  fromY = 400
} = {}) {
  const base = toVector3(hint, DEFAULT_PLAYER_START);
  if (!groundMeshes?.length) {
    return base.clone();
  }

  const attemptPosition = (x, z) => {
    const groundY = sampleGroundY(x, z, groundMeshes, { fromY });
    if (groundY == null) {
      return null;
    }
    const finalY = groundY + hover;
    if (pointIntersectsColliders(x, finalY, z, colliders)) {
      return null;
    }
    return new THREE.Vector3(x, finalY, z);
  };

  const baseAttempt = attemptPosition(base.x, base.z);
  if (baseAttempt) {
    return baseAttempt;
  }

  for (let ring = 1; ring <= PLAYER_SEARCH_RINGS; ring += 1) {
    const radius = PLAYER_SEARCH_STEP * ring;
    const steps = Math.max(6, ring * 8);
    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      const attempt = attemptPosition(x, z);
      if (attempt) {
        return attempt;
      }
    }
  }

  const fallbackY = sampleGroundY(base.x, base.z, groundMeshes, { fromY });
  const resolvedY = fallbackY == null ? base.y : fallbackY + hover;
  _spawnCandidate.set(base.x, resolvedY, base.z);
  return _spawnCandidate.clone();
}

function ensureContainerElement(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('initializeAthens requires a browser document.');
  }
  if (options.container instanceof HTMLElement) return options.container;
  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const element = document.getElementById(containerId);
  if (!element) throw new Error(`Athens container #${containerId} not found.`);
  return element;
}

function computeContainerSize(element) {
  const rect = element.getBoundingClientRect?.();
  const width = rect && rect.width ? rect.width : element.clientWidth || window.innerWidth || 1;
  const height = rect && rect.height ? rect.height : element.clientHeight || window.innerHeight || 1;
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}

function ensureOverlayCanvas(container, overlayCanvasId) {
  const existing = typeof document !== 'undefined' ? document.getElementById(overlayCanvasId) : null;
  if (existing instanceof HTMLCanvasElement) return existing;

  const canvas = document.createElement('canvas');
  canvas.id = overlayCanvasId;
  canvas.style.position = 'absolute';
  canvas.style.top = '16px';
  canvas.style.right = '16px';
  canvas.style.width = 'min(420px, 32vw)';
  canvas.style.height = 'min(420px, 32vh)';
  canvas.style.maxWidth = '95vw';
  canvas.style.maxHeight = '60vh';
  canvas.style.border = '1px solid rgba(30, 41, 59, 0.35)';
  canvas.style.background = 'rgba(15, 23, 42, 0.25)';
  canvas.style.backdropFilter = 'blur(4px)';
  canvas.style.borderRadius = '12px';
  canvas.style.zIndex = '4';
  canvas.style.touchAction = 'none';
  canvas.style.pointerEvents = 'auto';
  container.appendChild(canvas);
  return canvas;
}

function ensureLights(scene) {
  if (!scene) return;
  if (!scene.children.some((child) => child.isAmbientLight)) {
    scene.add(new THREE.AmbientLight(0xfef7e5, 0.55));
  }
  if (!scene.children.some((child) => child.isDirectionalLight)) {
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(160, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -240;
    sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 240;
    sun.shadow.camera.bottom = -240;
    scene.add(sun);
  }
}

function createPlaceholderPlayer() {
  const group = new THREE.Group();
  group.name = 'Player';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65, metalness: 0.15 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.1 });

  if (typeof THREE.CapsuleGeometry === 'function') {
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.6, 12, 24), bodyMaterial);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    group.add(capsule);
  } else {
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16), bodyMaterial);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    group.add(cylinder);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), accentMaterial);
  head.position.y = 1.1;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  return group;
}

export async function initializeAthens(options = {}) {
  const container = ensureContainerElement(options);
  container.style.position = container.style.position || 'relative';

  const { width: initialWidth, height: initialHeight } = computeContainerSize(container);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.zIndex = '0';

  if (!container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 2000);
  camera.position.set(90, 110, 180);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(camera);

  ensureLights(scene);

  statsReady
    .then((created) => {
      if (!created?.dom) {
        return;
      }
      created.dom.style.position = 'absolute';
      created.dom.style.left = '16px';
      created.dom.style.top = '16px';
      created.dom.style.zIndex = '5';
      created.dom.style.pointerEvents = 'none';
      if (!container.contains(created.dom)) {
        container.appendChild(created.dom);
      }
      updateStatsVisibility();
    })
    .catch(() => {
      // Ignore stats setup errors.
    });

  await createTimeSky(renderer, scene, 'day');
  if (typeof attachTimeHotkeys === 'function') {
    try {
      attachTimeHotkeys();
    } catch (error) {
      console.warn('[Athens] Failed to attach sky hotkeys.', error);
    }
  }

  const environmentController = {
    mode: getTimeOfDay() || 'day',
    async setMode(mode) {
      try {
        const resolved = await setTimeOfDay(mode);
        if (resolved) this.mode = resolved;
        return this.mode;
      } catch (error) {
        console.warn('[Athens] Failed to set time of day.', error);
        return this.mode;
      }
    },
    dispose() {
      // placeholder for compatibility
    }
  };

  await setupGround(scene, renderer);

  const city = await createCity({ renderer, scene });

  // Grass material application for main ground
  const mainGround = city?.root?.getObjectByName?.('Ground:MainGrass');
  if (mainGround?.isMesh) {
    try {
      const grassMaterial = await loadGrassMaterial(renderer, { repeat: 80 });
      if (grassMaterial) {
        const previous = mainGround.material;
        mainGround.material = grassMaterial;
        if (previous && previous !== grassMaterial && typeof previous.dispose === 'function') {
          previous.dispose();
        }
      }
    } catch (error) {
      console.warn('[Athens] Unable to apply grass material to main ground plane.', error);
    }
  }

  // Extended city (provides root + shared materials)
  const extendedRes = await createCityExtended({ renderer, scene });
  const extendedCity = extendedRes?.root ?? null;
  const sharedMaterials = extendedRes?.materials ?? null;

  // Ground registry + snapping
  markGround(scene);
  const groundMeshes = collectGround(scene);
  if (!groundMeshes.length) {
    console.warn('[npc] no ground meshes');
  }
  if (city?.root && groundMeshes.length) {
    const snapOpts = { hover: 0.03, fromY: 300 };
    snapChildrenToGround(city.root, groundMeshes, snapOpts);
    snapGroupToGround(city.root, groundMeshes, snapOpts);
  }
  if (extendedCity && groundMeshes.length) {
    snapGroupToGround(extendedCity, groundMeshes, { hover: 0.03, fromY: 300 });
  }

  markColliders(scene);
  const colliderMeshes = collectColliders(scene);
  const colliders = buildAABBs(colliderMeshes);

  const mainCharacterOptions = options.mainCharacter ?? options.mainCharacterConfig ?? null;
  const spawnHint = mainCharacterOptions?.initialPosition ?? DEFAULT_PLAYER_START;
  const playerSpawn = findSafePlayerSpawn({
    hint: spawnHint,
    groundMeshes,
    colliders,
    hover: 0.05,
    fromY: 400
  });

  // Landmarks & overlay
  const landmarks = await loadLandmarks({
    scene,
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL,
    groundMeshes
  });

  const overlayCanvasId = options.overlayCanvasId ?? DEFAULT_OVERLAY_ID;
  const overlayCanvas = ensureOverlayCanvas(container, overlayCanvasId);
  const overlay = await createLandmarkOverlay(overlayCanvas, {
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL
  });
  landmarks.featureLines?.updateResolution?.();

  const ui = createOriginalUi({ container, overlayCanvas, environmentController });
  ui?.setTimeLabel?.(formatEnvironmentLabel(environmentController?.mode) || 'High Noon');

  // Roads built from collected points (use extended/shared materials if available)
  let roadNetwork = null;
  if (options.enableRoads !== false) {
    const roadPoints = collectRoadPoints(scene);
    if (roadPoints.length >= 2) {
      const roadGroup = buildRoadNetwork({
        scene,
        points: roadPoints,
        materials: sharedMaterials || city?.materials || {},
        options: { width: 3.0, tileScale: 6.0 }
      });
      roadGroup.name = 'RoadNetwork';
      scene.add(roadGroup);
      roadNetwork = roadGroup;
    }
  }

  // Navmesh
  let navMesh = null;
  let navPathfinder = null;
  if (groundMeshes.length) {
    const navSources = [...groundMeshes];
    if (roadNetwork?.traverse) {
      roadNetwork.traverse((child) => {
        if (child && (child.isMesh || child instanceof THREE.Mesh)) {
          navSources.push(child);
        }
      });
    }
    try {
      navMesh = buildNavMeshFromMeshes(navSources);
      if (navMesh) {
        navPathfinder = createNavMeshPathfinder(navMesh);
      }
    } catch (error) {
      console.warn('[Athens][NavMesh] Failed to build navmesh.', error);
      navMesh = null;
      navPathfinder = null;
    }
  }

  // NPCs
  let npcManager = null;
  if (options.enableNpcs !== false) {
    // merged: pass both navmesh/timeSource and colliders
    npcManager = createNpcManager(scene, groundMeshes, {
      colliders,
      navMesh,
      pathfinder: navPathfinder,
      timeSource: getTimeOfDay
    });

    // Example extra NPC with simple path
    const p0 = new THREE.Vector3(5, 0, 5);
    const p1 = new THREE.Vector3(20, 0, 5);
    const npcRoot = scene.getObjectByName('NPC_1') || new THREE.Object3D();
    npcRoot.name = 'NPC_1';
    if (!npcRoot.parent) scene.add(npcRoot);
    npcManager.spawn({
      object3d: npcRoot,
      waypoints: [p0, p1],
      walkSpeed: 1.6,
      accel: 5.0,
      turn: 0.18
    });

    const defaultNpcConfigs = createDefaultNpcConfigs(
      Array.isArray(options.npcModelUrls) && options.npcModelUrls.length
        ? options.npcModelUrls
        : DEFAULT_NPC_MODEL_URLS
    );
    const npcConfigs = Array.isArray(options.npcConfigs) && options.npcConfigs.length
      ? options.npcConfigs
      : defaultNpcConfigs;

    npcConfigs.forEach((config) => {
      if (!config || typeof config !== 'object') return;
      npcManager.spawn(config);
    });
  }

  // Main character
  const mainCharacter = options.enableMainCharacter === false
    ? null
    : createMainCharacter(scene, {
        ...(mainCharacterOptions || {}),
        initialPosition: playerSpawn
      });

  const findPlayerObject = () => scene.getObjectByName('Player') || scene.getObjectByName('Hero');

  const placeAtSpawn = (object) => {
    if (!object) return;
    object.position.copy(playerSpawn);
    if (groundMeshes?.length) {
      const snapped = snapObjectToGround(object, groundMeshes, { hover: 0.05, fromY: 400 });
      if (snapped) {
        playerSpawn.y = object.position.y;
      }
    }
  };

  let playerObject = findPlayerObject() || mainCharacter?.object3d || null;
  let placeholderPlayer = null;

  if (!playerObject) {
    placeholderPlayer = createPlaceholderPlayer();
    placeAtSpawn(placeholderPlayer);
    scene.add(placeholderPlayer);
    playerObject = placeholderPlayer;
  } else {
    placeAtSpawn(playerObject);
  }

  // Controls & camera
  const keyboard = createKeyboard();
  const controller = createPlayerController(playerObject, keyboard, {
    walkSpeed: 5.5,
    runMultiplier: 2.5,
    acceleration: 12,
    turnLerp: 0.18,
    colliders
  });
  controller.setGroundMeshes(groundMeshes);
  controller.setColliders?.(colliders);

  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });

  if (mainCharacter?.ready?.then) {
    mainCharacter.ready.then(() => {
      const resolvedPlayer = mainCharacter.object3d || findPlayerObject() || scene.getObjectByName('MainCharacter');
      if (resolvedPlayer) {
        placeAtSpawn(resolvedPlayer);
        controller.setObject?.(resolvedPlayer);
        followCamera.setTarget?.(resolvedPlayer);
        playerObject = resolvedPlayer;
        if (placeholderPlayer && placeholderPlayer.parent) {
          placeholderPlayer.parent.remove(placeholderPlayer);
        }
      }
    });
  }

  followCamera.update();

  // Resize
  const resizeHandler = () => {
    const { width, height } = computeContainerSize(container);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    overlay.requestRender();
    landmarks.featureLines?.updateResolution?.();
  };
  window.addEventListener('resize', resizeHandler);

  // Main loop
  let disposed = false;
  let statsForFrame = null;

  const updateFrame = (delta, { skippedLargeDt }) => {
    if (disposed) {
      statsForFrame = stats;
      statsForFrame?.begin?.();
      statsForFrame?.end?.();
      statsForFrame = null;
      return;
    }

    statsForFrame = stats;
    statsForFrame?.begin?.();

    try {
      try {
        updateTrees?.(delta);
      } catch (error) {
        console.warn('[Athens] Tree animation update failed.', error);
      }

      const npcContext = { groundMeshes, skippedLargeDt: Boolean(skippedLargeDt) };
      mainCharacter?.update?.(delta, npcContext);
      npcManager?.update?.(delta, { skippedLargeDt: Boolean(skippedLargeDt) });
      landmarks.update?.(camera);

      if (!skippedLargeDt) {
        controller?.update?.(delta, camera);
      }

      ui?.update?.(delta, {
        position: playerObject?.position,
        isFlying: false,
        isRunning: controller?.isRunning?.(),
        skippedLargeDt: Boolean(skippedLargeDt)
      });

      followCamera?.update?.();
    } catch (error) {
      console.warn('[Athens] Frame update failed.', error);
    }
  };

  const renderFrame = () => {
    try {
      if (!disposed) {
        renderer.render(scene, camera);
      }
    } finally {
      statsForFrame?.end?.();
      statsForFrame = null;
    }
  };

  const gameLoop = createGameLoop(updateFrame, renderFrame);
  gameLoop.start();

  // Context / teardown
  const context = {
    renderer,
    scene,
    camera,
    stats,
    overlay,
    overlayCanvas,
    landmarks,
    roadNetwork,
    navMesh,
    navPathfinder,
    npcManager,
    mainCharacter,
    environmentController,
    city,
    extendedCity,
    container,
    ui,
    async setEnvironmentMode(mode, envOptions = {}) {
      const result = await environmentController?.setMode?.(mode, envOptions);
      const label = formatEnvironmentLabel(result || mode);
      if (label) ui?.setTimeLabel?.(label);
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gameLoop?.dispose?.();
      window.removeEventListener('resize', resizeHandler);
      overlay?.destroy?.();
      if (overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
      }
      mainCharacter?.dispose?.();
      npcManager?.dispose?.();
      roadNetwork?.dispose?.();
      landmarks?.dispose?.();
      environmentController?.dispose?.();
      ui?.dispose?.();
      if (stats?.dom && stats.dom.parentNode === container) {
        container.removeChild(stats.dom);
      }
      renderer.dispose();
      keyboard?.dispose?.();
      city?.dispose?.();
      extendedCity?.dispose?.();
    }
  };

  if (typeof window !== 'undefined') {
    window.__athens = window.__athens || {};
    window.__athens.environment = context.environmentController;
    window.__athens.mainCharacter = context.mainCharacter;
    window.__athens.setSkyMode = (mode, envOptions) => context.setEnvironmentMode(mode, envOptions);
    window.__athens.city = context.city;
    window.__athens.extendedCity = context.extendedCity;
    window.__athens.ui = context.ui;
  }

  return context;
}

export default initializeAthens;
