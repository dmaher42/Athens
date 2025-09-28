import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { setEnvironment } from '../scene/sky.js';
import boot from '../core/bootstrap.js';
import createKeyboard from '../input/keyboard.js';
import { createPlayerController } from '../player/playerController.js';
import { createFollowCamera } from '../camera/followCamera.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapToGround } from '../physics/groundSnap.js';
import { createNpcManager } from '../npc/simpleNpcManager.js';

type RunOptions = {
  containerId?: string;
  skyMode?: string;
  preset?: string;
  preserveBackground?: boolean;
};

const bootFn = (boot as unknown as (() => void) | null | undefined);
console.log('[Athens] boot starting');
bootFn?.();

const DEFAULT_CONTAINER_ID = 'app';
const STATUS_SELECTOR = '[data-status-line]';

function updateStatus(message: string, level: 'info' | 'error' = 'info') {
  if (typeof document === 'undefined') {
    return;
  }
  const statusEl = document.querySelector<HTMLElement>(STATUS_SELECTOR);
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.dataset.statusLevel = level;
  }
}

function ensureContainer(id: string) {
  if (typeof document === 'undefined') {
    throw new Error('Document is not available in the current environment.');
  }
  const container = document.getElementById(id);
  if (!container) {
    throw new Error(`Athens boot: container #${id} not found.`);
  }
  return container;
}

function computeSize(element: HTMLElement) {
  const { width, height } = element.getBoundingClientRect();
  const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 1;
  const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 1;
  return {
    width: Math.max(1, Math.floor(width || fallbackWidth || 1)),
    height: Math.max(1, Math.floor(height || fallbackHeight || 1))
  };
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

export async function runAthens(options: RunOptions = {}) {
  updateStatus('Starting Athens renderer…');

  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const container = ensureContainer(containerId);

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2));

  const { width: initialWidth, height: initialHeight } = computeSize(container);
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const stats = typeof initPerformanceStats === 'function' ? initPerformanceStats() : null;
  if (stats?.dom) {
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = '0';
    stats.dom.style.top = '0';
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fbcd4');

  const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 2000);
  camera.position.set(90, 110, 180);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(120, 220, 150);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 600;

  scene.add(ambientLight);
  scene.add(directionalLight);

  const environmentMode = options.skyMode ?? options.preset ?? 'day';
  if (typeof setEnvironment === 'function') {
    try {
      await setEnvironment(renderer, scene, environmentMode, {
        preserveBackground: Boolean(options.preserveBackground)
      });
    } catch (error) {
      console.warn('[Athens][Boot] setEnvironment failed', error);
    }
  }

  if (typeof setupGround === 'function') {
    try {
      await setupGround(scene, renderer);
    } catch (error) {
      console.warn('[Athens][Boot] setupGround failed', error);
    }
  }

  markGround(scene);
  const groundMeshes = collectGround(scene);

  const playerObject = createPlaceholderPlayer();
  scene.add(playerObject);
  if (groundMeshes.length) {
    const initialState = { vy: 0, lastGoodY: playerObject.position.y };
    snapToGround(playerObject, groundMeshes, initialState, 0);
  }

  const keyboard = createKeyboard();
  const playerController = createPlayerController(playerObject, keyboard, {
    walkSpeed: 4.0,
    runMultiplier: 1.7,
    acceleration: 10,
    turnLerp: 0.18
  });
  playerController.setGroundMeshes(groundMeshes);

  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });
  followCamera.syncImmediate();

  const npcManager = createNpcManager(scene, groundMeshes);
  npcManager.setGroundMeshes(groundMeshes);
  npcManager.spawn({
    waypoints: [
      new THREE.Vector3(6, 0, 6),
      new THREE.Vector3(10, 0, 6)
    ]
  });

  const clock = new THREE.Clock();
  let frameId: number | null = null;

  const handleResize = () => {
    const { width, height } = computeSize(container);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }

  const animate = () => {
    const delta = clock.getDelta();
    if (typeof updateTrees === 'function') {
      try {
        updateTrees(delta);
      } catch (error) {
        console.warn('[Athens][Boot] updateTrees failed', error);
      }
    }

    try {
      playerController.update(delta, camera);
    } catch (error) {
      console.warn('[Athens][Boot] player update failed', error);
    }

    try {
      npcManager.update(delta);
    } catch (error) {
      console.warn('[Athens][Boot] npc update failed', error);
    }

    followCamera.update(keyboard, delta);

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  };

  animate();

  updateStatus('Athens is running.');

  const context = {
    scene,
    camera,
    renderer,
    keyboard,
    playerController,
    followCamera,
    npcManager,
    dispose() {
      if (frameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
      npcManager.dispose();
      keyboard.dispose();
      renderer.dispose();
    }
  };

  if (typeof window !== 'undefined') {
    (window as any).__athensContext = context;
  }

  return context;
}

const globalWindow = typeof window !== 'undefined' ? window : undefined;

if (globalWindow) {
  (globalWindow as any).runAthens = runAthens;
  console.log('[Athens] initializer ready');

  if (typeof globalWindow.dispatchEvent === 'function') {
    globalWindow.dispatchEvent(
      new CustomEvent('athens:initializer-ready', {
        detail: { initializer: (globalWindow as any).runAthens, source: 'boot.html' }
      })
    );
  }

  try {
    await (globalWindow as any).runAthens();
    console.log('[Athens] render loop running');
  } catch (error: unknown) {
    updateStatus('Failed to start Athens. See console for details.', 'error');
    console.error(error);
  }
}
