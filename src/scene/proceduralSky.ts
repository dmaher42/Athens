import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface ProceduralSkyOptions {
  timeOfDay?: number;
  cycleSpeed?: number;
  atmosphere?: {
    turbidity?: number;
    rayleigh?: number;
    mieCoefficient?: number;
    mieDirectionalG?: number;
    exposure?: number;
  };
}

export interface ProceduralSkyController {
  update(dt: number): void;
  setTimeOfDay(hours: number): void;
  setCycleSpeed(hoursPerSecond: number): void;
  setAtmosphere(values: {
    turbidity?: number;
    rayleigh?: number;
    mieCoefficient?: number;
    mieDirectionalG?: number;
    exposure?: number;
  }): void;
  dispose(): void;
}

const FULL_DAY_HOURS = 24;
const MIN_REBUILD_INTERVAL = 0.1; // seconds (10 Hz)
const DEFAULT_TIME_OF_DAY = 12;
const DEFAULT_CYCLE_SPEED = 0.25; // hours per second

const DEFAULT_ATMOSPHERE = {
  turbidity: 10,
  rayleigh: 2,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  exposure: 0.5
} as const;

type AtmosphereState = Required<typeof DEFAULT_ATMOSPHERE>;

type CreateParams = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  options?: ProceduralSkyOptions;
};

export async function createProceduralSky({
  renderer,
  scene,
  options = {}
}: CreateParams): Promise<ProceduralSkyController> {
  if (!renderer) {
    throw new Error('[proceduralSky] renderer is required');
  }
  if (!scene) {
    throw new Error('[proceduralSky] scene is required');
  }

  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(10000);
  skyScene.add(sky);

  const sun = new THREE.Vector3();
  const uniforms = sky.material.uniforms;

  const atmosphere: AtmosphereState = {
    turbidity: options.atmosphere?.turbidity ?? DEFAULT_ATMOSPHERE.turbidity,
    rayleigh: options.atmosphere?.rayleigh ?? DEFAULT_ATMOSPHERE.rayleigh,
    mieCoefficient: options.atmosphere?.mieCoefficient ?? DEFAULT_ATMOSPHERE.mieCoefficient,
    mieDirectionalG: options.atmosphere?.mieDirectionalG ?? DEFAULT_ATMOSPHERE.mieDirectionalG,
    exposure: options.atmosphere?.exposure ?? DEFAULT_ATMOSPHERE.exposure
  };

  const initialRendererExposure = renderer.toneMappingExposure ?? 1;

  let timeOfDay = normalizeHours(options.timeOfDay ?? DEFAULT_TIME_OF_DAY);
  let cycleSpeed = Number.isFinite(options.cycleSpeed) ? Number(options.cycleSpeed) : DEFAULT_CYCLE_SPEED;
  let disposed = false;
  let elapsed = 0;
  let lastRebuildTime = -Infinity;
  let dirty = true;
  let currentTarget: THREE.WebGLRenderTarget | null = null;

  applyAtmosphere();
  updateSun();
  await rebuildEnvironment(true);

  function normalizeHours(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_TIME_OF_DAY;
    }
    let hours = value % FULL_DAY_HOURS;
    if (hours < 0) {
      hours += FULL_DAY_HOURS;
    }
    return hours;
  }

  function applyAtmosphere() {
    if (uniforms.turbidity) {
      uniforms.turbidity.value = atmosphere.turbidity;
    }
    if (uniforms.rayleigh) {
      uniforms.rayleigh.value = atmosphere.rayleigh;
    }
    if (uniforms.mieCoefficient) {
      uniforms.mieCoefficient.value = atmosphere.mieCoefficient;
    }
    if (uniforms.mieDirectionalG) {
      uniforms.mieDirectionalG.value = atmosphere.mieDirectionalG;
    }
    renderer.toneMappingExposure = atmosphere.exposure;
    dirty = true;
  }

  function updateSun() {
    const dayFraction = timeOfDay / FULL_DAY_HOURS;
    const angle = (dayFraction - 0.25) * Math.PI * 2;
    const elevation = Math.sin(angle) * (Math.PI / 2);
    const azimuth = Math.PI + angle;
    sun.setFromSphericalCoords(1, Math.max(0, Math.PI / 2 - elevation), azimuth);
    if (uniforms.sunPosition) {
      uniforms.sunPosition.value.copy(sun);
    }
    dirty = true;
  }

  function disposeRenderTarget(target: THREE.WebGLRenderTarget | null) {
    if (!target) return;
    try {
      target.texture?.dispose?.();
    } catch {}
    try {
      target.dispose();
    } catch {}
  }

  async function rebuildEnvironment(force = false) {
    if (disposed) {
      return;
    }
    if (!dirty && !force) {
      return;
    }
    if (!force && elapsed - lastRebuildTime < MIN_REBUILD_INTERVAL) {
      return;
    }
    dirty = false;
    lastRebuildTime = elapsed;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(skyScene, 0.1);
    pmrem.dispose();

    const previousTarget = currentTarget;
    currentTarget = target;
    scene.environment = target.texture;
    scene.background = target.texture;

    if (previousTarget && previousTarget !== target) {
      disposeRenderTarget(previousTarget);
    }
  }

  function update(dt: number) {
    if (disposed) return;
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    elapsed += safeDt;

    if (cycleSpeed !== 0 && safeDt > 0) {
      timeOfDay = normalizeHours(timeOfDay + cycleSpeed * safeDt);
      updateSun();
    }

    void rebuildEnvironment(false);
  }

  function setTimeOfDay(hours: number) {
    if (disposed) return;
    timeOfDay = normalizeHours(hours);
    updateSun();
  }

  function setCycleSpeed(value: number) {
    if (disposed) return;
    if (!Number.isFinite(value)) {
      cycleSpeed = 0;
      return;
    }
    cycleSpeed = value;
  }

  function setAtmosphere(values: {
    turbidity?: number;
    rayleigh?: number;
    mieCoefficient?: number;
    mieDirectionalG?: number;
    exposure?: number;
  }) {
    if (disposed || !values || typeof values !== 'object') {
      return;
    }
    if (Number.isFinite(values.turbidity)) {
      atmosphere.turbidity = Number(values.turbidity);
    }
    if (Number.isFinite(values.rayleigh)) {
      atmosphere.rayleigh = Number(values.rayleigh);
    }
    if (Number.isFinite(values.mieCoefficient)) {
      atmosphere.mieCoefficient = Number(values.mieCoefficient);
    }
    if (Number.isFinite(values.mieDirectionalG)) {
      atmosphere.mieDirectionalG = Number(values.mieDirectionalG);
    }
    if (Number.isFinite(values.exposure)) {
      atmosphere.exposure = Number(values.exposure);
    }
    applyAtmosphere();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;

    if (scene.environment === currentTarget?.texture) {
      scene.environment = null;
    }
    if (scene.background === currentTarget?.texture) {
      scene.background = null;
    }

    disposeRenderTarget(currentTarget);
    currentTarget = null;

    if (sky.parent) {
      sky.parent.remove(sky);
    }
    disposeObject(sky);

    renderer.toneMappingExposure = initialRendererExposure;
  }

  function disposeObject(object: THREE.Object3D | THREE.Material | THREE.BufferGeometry) {
    if (!object) return;
    if ('dispose' in object && typeof (object as any).dispose === 'function') {
      try {
        (object as any).dispose();
      } catch {}
    }
    if ((object as any).geometry) {
      disposeObject((object as any).geometry);
    }
    if ((object as any).material) {
      disposeObject((object as any).material);
    }
  }

  const controller: ProceduralSkyController = {
    update,
    setTimeOfDay,
    setCycleSpeed,
    setAtmosphere,
    dispose
  };

  return controller;
}
