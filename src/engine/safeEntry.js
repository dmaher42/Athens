import * as THREE from 'three';
import { applySky } from '../scene/sky.ts';

export function createSafeScene(canvasSelector = 'canvas') {
  const canvas = typeof document !== 'undefined' ? document.querySelector(canvasSelector) : null;
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas || undefined });
  renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
  renderer.setSize(typeof window !== 'undefined' ? window.innerWidth : 1, typeof window !== 'undefined' ? window.innerHeight : 1, false);
  renderer.setClearColor(0x202834, 1);
  renderer.setClearAlpha(1);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202834);

  const camera = new THREE.PerspectiveCamera(60, (typeof window !== 'undefined' ? window.innerWidth : 1) / (typeof window !== 'undefined' ? window.innerHeight || 1 : 1), 0.1, 2000);
  camera.position.set(0, 3.5, 7);
  scene.add(camera);

  let skyReady = false;
  applySky(scene, renderer)
    .catch((error) => {
      console.warn('[safeEntry] applySky failed.', error);
    })
    .finally(() => {
      skyReady = true;
    });

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.1);
  directional.position.set(5, 10, 7);
  scene.add(directional);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4fa3ff, roughness: 0.6, metalness: 0 })
  );
  cube.position.y = 1;
  scene.add(cube);

  const grid = new THREE.GridHelper(40, 40, 0x6aa0ff, 0x2a3550);
  scene.add(grid);

  const onResize = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight || 1;
    camera.aspect = width / (height || 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize, { passive: true });
  }

  const update = (dt = 0) => {
    cube.rotation.y += dt;
  };

  const render = () => {
    if (!skyReady) {
      return;
    }
    renderer.render(scene, camera);
  };

  const dispose = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onResize);
    }
    renderer.dispose();
  };

  return { renderer, scene, camera, update, render, dispose };
}

export default createSafeScene;
