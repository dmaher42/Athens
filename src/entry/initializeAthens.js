import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { createEnvironmentController } from '../scene/sky.js';
import { loadLandmarks } from '../landmarks-loader.js';
import { createLandmarkOverlay } from '../map/landmarks.js';
import { buildRoadNetwork } from '../roads/roadNetwork.js';
import { createNpcManager } from '../npc/npcSystem.js';
import { createMainCharacter } from '../npc/mainCharacter.js';
import { createKeyboard } from '../input/keyboard.js';
import { createFollowCamera } from '../camera/followCamera.js';
import { createPlayerController } from '../player/playerController.js';
import { assetUrl } from '../utils/assetUrl.js';

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
  if (!Array.isArray(modelUrls) || modelUrls.length === 0) {
    return [];
  }

  const radius = 18;

  return modelUrls.map((modelUrl, index) => {
    const angle = (index / modelUrls.length) * Math.PI * 2;
    const waypoints = buildNpcPatrolPath(radius, angle);
    return {
      modelUrl,
      initialPosition: waypoints[0],
      waypoints
    };
  });
}

function ensureContainerElement(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('initializeAthens requires a browser document.');
  }
  if (options.container instanceof HTMLElement) {
    return options.container;
  }
  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const element = document.getElementById(containerId);
  if (!element) {
    throw new Error(`Athens container #${containerId} not found.`);
  }
  return element;
}

function computeContainerSize(element) {
  const rect = element.getBoundingClientRect?.();
  const width = rect && rect.width ? rect.width : element.clientWidth || window.innerWidth || 1;
  const height = rect && rect.height ? rect.height : element.clientHeight || window.innerHeight || 1;
  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height))
  };
}

function ensureOverlayCanvas(container, overlayCanvasId) {
  const existing = typeof document !== 'undefined' ? document.getElementById(overlayCanvasId) : null;
  if (existing instanceof HTMLCanvasElement) {
    return existing;
  }

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
  if (!scene) {
    return;
  }
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

  const environmentController = createEnvironmentController(renderer, scene);
  await environmentController.setMode?.('high_noon');

  await setupGround(scene, renderer);

  const landmarks = await loadLandmarks({
    scene,
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL
  });

  const overlayCanvasId = options.overlayCanvasId ?? DEFAULT_OVERLAY_ID;
  const overlayCanvas = ensureOverlayCanvas(container, overlayCanvasId);
  const overlay = await createLandmarkOverlay(overlayCanvas, {
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL
  });
  landmarks.featureLines?.updateResolution?.();

  let roadNetwork = null;
  if (options.enableRoads !== false) {
    roadNetwork = buildRoadNetwork({ scene, landmarks: landmarks.markers });
  }

  let npcManager = null;
  if (options.enableNpcs !== false) {
    npcManager = createNpcManager(scene);
    const defaultNpcConfigs = createDefaultNpcConfigs(
      Array.isArray(options.npcModelUrls) && options.npcModelUrls.length
        ? options.npcModelUrls
        : DEFAULT_NPC_MODEL_URLS
    );
    const npcConfigs = Array.isArray(options.npcConfigs) && options.npcConfigs.length
      ? options.npcConfigs
      : defaultNpcConfigs;

    npcConfigs.forEach((config) => {
      if (!config || typeof config !== 'object') {
        return;
      }
      npcManager.spawn(config);
    });
  }

  const mainCharacterOptions = options.mainCharacter ?? options.mainCharacterConfig ?? null;
  const mainCharacter = options.enableMainCharacter === false
    ? null
    : createMainCharacter(scene, {
        initialPosition: { x: 4, y: 0, z: 4 },
        ...(mainCharacterOptions || {})
      });

  const findPlayerObject = () => scene.getObjectByName('Player') || scene.getObjectByName('Hero');

  let playerObject = findPlayerObject() || mainCharacter?.object3d || null;
  let placeholderPlayer = null;

  if (!playerObject) {
    placeholderPlayer = createPlaceholderPlayer();
    scene.add(placeholderPlayer);
    playerObject = placeholderPlayer;
  }

  const keyboard = createKeyboard();
  const controller = createPlayerController(playerObject, keyboard, {
    walkSpeed: 4.0,
    runMultiplier: 1.7,
    turnLerp: 0.18
  });
  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });

  if (mainCharacter?.ready?.then) {
    mainCharacter.ready.then(() => {
      const resolvedPlayer = mainCharacter.object3d || findPlayerObject() || scene.getObjectByName('MainCharacter');
      if (resolvedPlayer) {
        controller.setObject(resolvedPlayer);
        followCamera.setTarget(resolvedPlayer);
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
    if (disposed) {
      return;
    }
    const delta = clock.getDelta();
    try {
      updateTrees?.(delta);
    } catch (error) {
      console.warn('[Athens] Tree animation update failed.', error);
    }
    mainCharacter?.update(delta);
    npcManager?.update(delta);
    landmarks.update?.(camera);
    stats?.update?.();
    controller?.update(delta, camera);
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
    container,
    setEnvironmentMode(mode, envOptions = {}) {
      return environmentController?.setMode?.(mode, envOptions);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', resizeHandler);
      overlay?.destroy?.();
      if (overlayCanvas.parentNode === container) {
        container.removeChild(overlayCanvas);
      }
      mainCharacter?.dispose?.();
      npcManager?.dispose?.();
      roadNetwork?.dispose?.();
      landmarks?.dispose?.();
      environmentController?.dispose?.();
      if (stats?.dom && stats.dom.parentNode === container) {
        container.removeChild(stats.dom);
      }
      renderer.dispose();
      keyboard?.dispose?.();
    }
  };

  if (typeof window !== 'undefined') {
    window.__athens = window.__athens || {};
    window.__athens.environment = context.environmentController;
    window.__athens.mainCharacter = context.mainCharacter;
    window.__athens.setSkyMode = (mode, envOptions) => context.setEnvironmentMode(mode, envOptions);
  }

  return context;
}

export default initializeAthens;
