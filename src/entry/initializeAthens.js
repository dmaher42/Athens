import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { createEnvironmentController } from '../scene/sky.js';
import { loadLandmarks } from '../landmarks-loader.js';
import { createLandmarkOverlay } from '../map/landmarks.js';
import { buildRoadNetwork } from '../roads/roadNetwork.js';
import { createNpcManager } from '../npc/npcSystem.js';

const DEFAULT_CONTAINER_ID = 'app';
const DEFAULT_OVERLAY_ID = 'landmark-overlay';
const DEFAULT_GEOJSON_URL = 'data/athens_places.geojson';

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
    const npcConfigs = Array.isArray(options.npcConfigs) && options.npcConfigs.length
      ? options.npcConfigs
      : [
          {
            modelUrl: 'models/npc_athenian.glb',
            initialPosition: { x: 8, y: 0, z: -6 },
            waypoints: [
              { x: 8, y: 0, z: -6 },
              { x: -6, y: 0, z: -8 },
              { x: -4, y: 0, z: 6 },
              { x: 10, y: 0, z: 4 }
            ]
          },
          {
            modelUrl: 'models/hoplite_npc.glb',
            initialPosition: { x: -12, y: 0, z: 12 },
            waypoints: [
              { x: -12, y: 0, z: 12 },
              { x: -2, y: 0, z: 18 },
              { x: 6, y: 0, z: 10 },
              { x: -4, y: 0, z: 4 }
            ]
          }
        ];
    npcConfigs.slice(0, 3).forEach((config) => {
      npcManager.spawn(config);
    });
  }

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
    npcManager?.update(delta);
    landmarks.update?.(camera);
    stats?.update?.();
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
      npcManager?.dispose?.();
      roadNetwork?.dispose?.();
      landmarks?.dispose?.();
      environmentController?.dispose?.();
      if (stats?.dom && stats.dom.parentNode === container) {
        container.removeChild(stats.dom);
      }
      renderer.dispose();
    }
  };

  if (typeof window !== 'undefined') {
    window.__athens = window.__athens || {};
    window.__athens.environment = context.environmentController;
    window.__athens.setSkyMode = (mode, envOptions) => context.setEnvironmentMode(mode, envOptions);
  }

  return context;
}

export default initializeAthens;
