import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { setEnvironment } from '../scene/sky.js';
import boot, { whenBootReady } from '../core/bootstrap.js';

type StatsLike = {
  update?: () => void;
  dom?: HTMLElement;
} | null;

type RunAthensResult = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
};

type RunAthensHandle = () => Promise<RunAthensResult>;

type GetAthensContextHandle = () => Promise<RunAthensResult | undefined>;

let container: HTMLElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let stats: StatsLike = null;
let previousTime = performance.now();
let initializationTask: Promise<RunAthensResult> | null = null;
let initializedContext: RunAthensResult | null = null;
let resizeListenerAttached = false;
let loggedRenderLoop = false;

console.log('[Athens] boot starting');

try {
  await boot?.();
} catch (error) {
  console.error('[Athens] Boot invocation failed.', error);
}

await whenBootReady().catch(() => {});

declare global {
  interface Window {
    runAthens?: RunAthensHandle;
    getAthensContext?: GetAthensContextHandle;
  }
}

async function runAthens(): Promise<RunAthensResult> {
  if (initializedContext) {
    return initializedContext;
  }

  if (initializationTask) {
    return initializationTask;
  }

  initializationTask = (async () => {
    container = document.getElementById('app') as HTMLElement | null;
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

    const ambientLight = scene.children.find((child) => child instanceof THREE.AmbientLight) as THREE.AmbientLight | undefined;
    if (!ambientLight) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    }

    const directionalLight = scene.children.find((child) => child instanceof THREE.DirectionalLight) as
      | THREE.DirectionalLight
      | undefined;
    if (!directionalLight) {
      const light = new THREE.DirectionalLight(0xffffff, 1.1);
      light.position.set(120, 180, 60);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      const shadowCamera = light.shadow.camera as THREE.OrthographicCamera;
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
      setEnvironment(renderer, scene, 'day');
    } catch (error) {
      console.warn('[Athens] Failed to configure sky environment.', error);
    }

    await setupGround(scene, renderer);

    try {
      stats = initPerformanceStats() as StatsLike;
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

    const context: RunAthensResult = {
      scene,
      renderer,
      camera
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

async function getAthensContext(): Promise<RunAthensResult | undefined> {
  if (initializedContext) {
    return initializedContext;
  }

  if (initializationTask) {
    return initializationTask;
  }

  const ready = typeof window !== 'undefined' && (window as any).__AthensBootReady;
  if (ready && typeof (ready as Promise<unknown>).then === 'function') {
    console.warn('[Athens] Delaying until boot finishes…');
    await (ready as Promise<unknown>).catch(() => {});
    if (initializedContext) {
      return initializedContext;
    }
    if (initializationTask) {
      return initializationTask;
    }
  }

  console.warn('[Athens] Boot not ready; proceeding cautiously.');
  return undefined;
}

(window as any).runAthens = runAthens;
(window as any).getAthensContext = getAthensContext;
window.dispatchEvent(
  new CustomEvent('athens:initializer-ready', {
    detail: { initializer: (window as any).runAthens, source: 'index.html' }
  })
);
console.log('[Athens] initializer ready');

try {
  await runAthens();
} catch (error) {
  console.error('[Athens] Failed to initialize.', error);
}

function resizeRenderer() {
  if (!container || !renderer || !camera) {
    return;
  }

  const { clientWidth, clientHeight } = container;
  const width = clientWidth || window.innerWidth || 1;
  const height = clientHeight || window.innerHeight || 1;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frame(now: number) {
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

