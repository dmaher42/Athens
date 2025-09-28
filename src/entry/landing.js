import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { setEnvironment } from '../scene/sky.js';
import boot, { whenBootReady } from '../core/bootstrap.js';

/**
 * @typedef {{
 *   update?: () => void;
 *   dom?: HTMLElement;
 * } | null} StatsLike
 */

/**
 * @typedef {{
 *   scene: THREE.Scene;
 *   renderer: THREE.WebGLRenderer;
 *   camera: THREE.PerspectiveCamera;
 * }} RunAthensResult
 */

/** @typedef {() => Promise<RunAthensResult>} RunAthensHandle */
/** @typedef {() => Promise<RunAthensResult | undefined>} GetAthensContextHandle */

/** @type {HTMLElement | null} */
let container = null;
/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {StatsLike} */
let stats = null;
let previousTime = performance.now();
/** @type {Promise<RunAthensResult> | null} */
let initializationTask = null;
/** @type {RunAthensResult | null} */
let initializedContext = null;
let resizeListenerAttached = false;
let loggedRenderLoop = false;
/** @type {Promise<any> | null} */
let bootPromise = null;
let bootLogEmitted = false;

/**
 * @returns {Promise<void>}
 */
async function waitForDomReady() {
  if (typeof document === 'undefined') return;
  if (document.readyState === 'complete' || document.readyState === 'interactive') return;

  await new Promise((resolve) => {
    const handleReady = () => {
      document.removeEventListener('DOMContentLoaded', handleReady);
      resolve();
    };
    document.addEventListener('DOMContentLoaded', handleReady, { once: true });
  });
}

/**
 * @returns {{ promise: Promise<any>; started: boolean } | null}
 */
function ensureBootStarted() {
  if (typeof boot !== 'function') return null;

  let started = false;

  if (!bootPromise) {
    started = true;

    if (!bootLogEmitted) {
      console.log('[Athens] boot starting');
      bootLogEmitted = true;
    }

    const promise = Promise.resolve()
      .then(() => boot())
      .catch((error) => {
        console.error('[Athens] Boot invocation failed.', error);
        throw error;
      });

    bootPromise = promise;
  }

  if (!bootPromise) return null;
  return { promise: bootPromise, started };
}

/**
 * @returns {Promise<RunAthensResult>}
 */
async function runAthens() {
  if (initializedContext) return initializedContext;
  if (initializationTask) return initializationTask;

  initializationTask = (async () => {
    const bootState = ensureBootStarted();
    const bootTask = bootState?.promise ?? null;
    const bootStartedHere = bootState?.started ?? false;

    if (bootTask && !bootStartedHere) {
      try {
        await bootTask;
      } catch (error) {
        initializationTask = null;
        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    if (bootTask) {
      const bootReady = whenBootReady();
      if (!bootStartedHere) {
        try {
          await bootReady;
        } catch (error) {
          initializationTask = null;
          throw error instanceof Error ? error : new Error(String(error));
        }
      } else {
        // if we started boot here, don't block; just observe readiness
        bootReady.catch(() => {});
      }
    }

    await waitForDomReady();

    container = document.getElementById('app');
    if (!container) {
      initializationTask = null;
      throw new Error('Missing #app container for Athens renderer.');
    }

    renderer = renderer ?? new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    if (!container.contains(renderer.domElement)) {
      container.appendChild(renderer.domElement);
    }

    scene = scene ?? new THREE.Scene();

    camera = camera ?? new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    camera.position.set(90, 110, 180);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    if (!scene.children.includes(camera)) {
      scene.add(camera);
    }

    if (!scene.children.find((child) => child instanceof THREE.AmbientLight)) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    }

    if (!scene.children.find((child) => child instanceof THREE.DirectionalLight)) {
      const light = new THREE.DirectionalLight(0xffffff, 1.1);
      light.position.set(120, 180, 60);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      const shadowCamera = light.shadow.camera;
      shadowCamera.near = 0.5;
      shadowCamera.far = 500;
      shadowCamera.left = -200;
      shadowCamera.right = 200;
      shadowCamera.top = 200;
      shadowCamera.bottom = -200;
      scene.add(light);
    }

    resizeRenderer();
    if (!resizeListenerAttached) {
      window.addEventListener('resize', resizeRenderer);
      resizeListenerAttached = true;
    }

    try {
      await setEnvironment(renderer, scene, 'day');
    } catch (error) {
      console.warn('[Athens] Failed to configure sky environment.', error);
    }

    await setupGround(scene, renderer);

    try {
      stats = /** @type {StatsLike} */ (initPerformanceStats());
      if (stats?.dom) {
        stats.dom.style.position = 'absolute';
        stats.dom.style.left = '0';
        stats.dom.style.top = '0';
      }
    } catch (error) {
      console.warn('[Athens] Performance stats are unavailable.', error);
      stats = null;
    }

    previousTime = performance.now();
    requestAnimationFrame(frame);

    if (!loggedRenderLoop) {
      console.log('[Athens] render loop running');
      loggedRenderLoop = true;
    }

    /** @type {RunAthensResult} */
    const context = {
      scene,
      renderer,
      camera,
    };

    initializedContext = context;
    return context;
  })();

  try {
    return await initializationTask;
  } finally {
    initializationTask = null;
  }
}

const globalWindow = /** @type {Window & { runAthens?: RunAthensHandle; getAthensContext?: GetAthensContextHandle; }} */ (window);

globalWindow.runAthens = runAthens;
globalWindow.getAthensContext = async () => {
  if (initializedContext) return initializedContext;

  if (initializationTask) {
    try {
      return await initializationTask;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

window.dispatchEvent(
  new CustomEvent('athens:initializer-ready', {
    detail: { initializer: runAthens, source: 'index.html' },
  })
);
console.log('[Athens] initializer ready');

try {
  await runAthens();
} catch (error) {
  console.error('[Athens] Failed to initialize.', error);
}

function resizeRenderer() {
  if (!container || !renderer || !camera) return;

  const { clientWidth, clientHeight } = container;
  const width = clientWidth || window.innerWidth || 1;
  const height = clientHeight || window.innerHeight || 1;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/**
 * @param {number} now
 */
function frame(now) {
  if (!renderer || !scene || !camera) {
    previousTime = now;
    requestAnimationFrame(frame);
    return;
  }

  const deltaSeconds = (now - previousTime) / 1000;
  previousTime = now;

  try {
    updateTrees(deltaSeconds);
  } catch (error) {
    console.warn('[Athens] Tree update failed.', error);
  }

  stats?.update?.();
  renderer.render(scene, camera);

  requestAnimationFrame(frame);
}
