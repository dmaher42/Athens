import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
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
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapGroupToGround, snapObjectToGround, snapChildrenToGround } from '../physics/groundProject.js';
import { createCity } from '../buildings/createCity.js';
import { createCityExtended } from '../buildings/createCityExtended.js';
import { createOriginalUi } from '../ui/originalUi.js';
import { createTimeSky, setTimeOfDay, getTimeOfDay, attachTimeHotkeys } from '../sky/timeSky.js';
import { loadGrassMaterial } from '../materials/groundGrass.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';

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
  'models/Adventurer.glb',
  'models/Adventurer1.glb',
  'models/brokenCHar.glb',
  'models/character2.glb',
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

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

  const stats = initPerformanceStats?.();
  if (stats?.dom) {
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = '16px';
    stats.dom.style.top = '16px';
    stats.dom.style.zIndex = '5';
    stats.dom.style.pointerEvents = 'none';
    if (!container.contains(stats.dom)) {
      container.appendChild(stats.dom);
    }
  }

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
  const extendedCity = await createCityExtended({ renderer, scene });

  // --- Merge: grass material application + ground registry + snapping ---
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

  markGround(scene);
  let groundMeshes = collectGround(scene);
  if (!groundMeshes.length) {
    console.warn('[npc] no ground meshes');
  }
  if (city?.root && groundMeshes.length) {
    snapChildrenToGround(city.root, groundMeshes, { hover: 0.03, fromY: 300 });
    snapGroupToGround(city.root, groundMeshes, { hover: 0.03, fromY: 300 });
  }
  if (extendedCity?.root && groundMeshes.length) {
    snapChildrenToGround(extendedCity.root, groundMeshes, { hover: 0.03, fromY: 300 });
    snapGroupToGround(extendedCity.root, groundMeshes, { hover: 0.03, fromY: 300 });
  }
  // --- end merge ---

  let colliderMeshes = [];
  let colliders = [];
  const refreshColliders = () => {
    markColliders(scene);
    colliderMeshes = collectColliders(scene);
    colliders = buildAABBs(colliderMeshes);
  };

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

  let roadNetwork = null;
  if (options.enableRoads !== false) {
    const roadPoints = collectRoadPoints(scene);
    const roadMaterials = extendedCity?.materials || city?.materials || {};
    roadNetwork = buildRoadNetwork({
      scene,
      points: roadPoints,
      materials: roadMaterials,
      options: { width: 3.0, tileScale: 6.0 }
    });
    if (roadNetwork) {
      roadNetwork.name = 'RoadNetwork';
      if (!scene.children.includes(roadNetwork)) {
        scene.add(roadNetwork);
      }
    }
  }
  refreshColliders();

  let npcManager = null;
  if (options.enableNpcs !== false) {

    npcManager = createNpcManager(scene, { colliders });

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

  const mainCharacterOptions = options.mainCharacter ?? options.mainCharacterConfig ?? null;
  const mainCharacter = options.enableMainCharacter === false
    ? null
    : createMainCharacter(scene, {
        initialPosition: { x: 72, y: 0, z: -48 },
        ...(mainCharacterOptions || {})
      });

  const findPlayerObject = () => scene.getObjectByName('Player') || scene.getObjectByName('Hero');

  let playerObject = findPlayerObject() || mainCharacter?.object3d || null;
  let placeholderPlayer = null;

  if (!playerObject) {
    placeholderPlayer = createPlaceholderPlayer();
    scene.add(placeholderPlayer);
    playerObject = placeholderPlayer;
    if (groundMeshes?.length) {
      snapObjectToGround(placeholderPlayer, groundMeshes, { hover: 0.05, fromY: 300 });
    }
  }

  const keyboard = createKeyboard();
  const controller = createPlayerController(playerObject, keyboard, {
    walkSpeed: 5.5,
    runMultiplier: 2.5,
    flyMultiplier: 3.0,
    turnLerp: 0.18,
    flightToggleKey: 'KeyX',
    colliders,
    collisionOptions: { maxIters: 4, skin: 0.02 }
  });
  if (typeof controller?.setGroundMeshes === 'function') {
    controller.setGroundMeshes(groundMeshes);
  }

  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });

  if (mainCharacter?.ready?.then) {
    mainCharacter.ready.then(() => {
      const resolvedPlayer = mainCharacter.object3d || findPlayerObject() || scene.getObjectByName('MainCharacter');
      if (resolvedPlayer) {
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

  const resizeHandler = () => {
    const { width, height } = computeContainerSize(container);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    overlay.requestRender();
    landmarks.featureLines?.updateResolution?.();
  };

  window.addEventListener('resize', resizeHandler);

  const clock = new THREE.Clock();
  let disposed = false;
  let frameId = 0;

  const frame = () => {
    if (disposed) return;
    const delta = clock.getDelta();
    try {
      updateTrees?.(delta);
    } catch (error) {
      console.warn('[Athens] Tree animation update failed.', error);
    }
    mainCharacter?.update(delta, { groundMeshes });
    npcManager?.update(delta);
    landmarks.update?.(camera);
    stats?.update?.();
    controller?.update(delta, camera);
    ui?.update?.(delta, {
      position: playerObject?.position,
      isFlying: false,
      isRunning: controller?.isRunning?.()
    });
    followCamera?.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  };

  frameId = requestAnimationFrame(frame);

  const context = {
    renderer,
    scene,
    camera,
    stats,
    overlay,
    overlayCanvas,
    landmarks,
    roadNetwork,
    npcManager,
    mainCharacter,
    environmentController,
    city,
    extendedCity,
    container,
    ui,
    refreshColliders,
    async setEnvironmentMode(mode, envOptions = {}) {
      const result = await environmentController?.setMode?.(mode, envOptions);
      const label = formatEnvironmentLabel(result || mode);
      if (label) ui?.setTimeLabel?.(label);
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
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
