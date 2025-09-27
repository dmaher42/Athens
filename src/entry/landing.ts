import * as THREE from 'three';
import { setupGround, updateTrees, initPerformanceStats } from '../main.js';
import { setEnvironment } from '../scene/sky.js';

type StatsLike = {
  update?: () => void;
  dom?: HTMLElement;
} | null;

type RunAthensHandle = () => {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
};

let container: HTMLElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let stats: StatsLike = null;
let previousTime = performance.now();

const runAthens: RunAthensHandle = () => {
  if (!scene || !renderer || !camera) {
    throw new Error('Athens has not finished initializing.');
  }
  return { scene, renderer, camera };
};

declare global {
  interface Window {
    runAthens?: RunAthensHandle;
  }
}

window.runAthens = runAthens;

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

async function initializeAthens() {
  let bootModule: { boot?: () => unknown; default?: () => unknown } | null = null;
  try {
    bootModule = await import('../core/bootstrap.js');
  } catch (error) {
    console.warn('[Athens] Optional bootstrap module failed to load.', error);
  }

  const boot = typeof bootModule?.boot === 'function'
    ? bootModule.boot
    : typeof bootModule?.default === 'function'
      ? bootModule.default
      : undefined;

  await boot?.();

  container = document.getElementById('app') as HTMLElement | null;
  if (!container) {
    throw new Error('Missing #app container for Athens renderer.');
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(90, 110, 180);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(120, 180, 60);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  const shadowCamera = directionalLight.shadow.camera as THREE.OrthographicCamera;
  shadowCamera.near = 0.5;
  shadowCamera.far = 500;
  shadowCamera.left = -200;
  shadowCamera.right = 200;
  shadowCamera.top = 200;
  shadowCamera.bottom = -200;
  scene.add(directionalLight);

  resizeRenderer();
  window.addEventListener('resize', resizeRenderer);

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

  window.dispatchEvent(
    new CustomEvent('athens:initializer-ready', {
      detail: { initializer: runAthens, source: 'entry/landing.ts' }
    })
  );
}

initializeAthens().catch((error) => {
  console.error('[Athens] Failed to initialize.', error);
});
