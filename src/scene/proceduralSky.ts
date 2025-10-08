import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { disposeAll } from '../utils/disposable.ts';

export type SkyTime = 'dawn' | 'day' | 'dusk' | 'night';

const { clamp, degToRad, radToDeg, lerp } = THREE.MathUtils;

const MIN_PMREM_INTERVAL_MS = 180; // ~5.5 Hz refresh ceiling

const SKY_BACKGROUND_COLORS: Record<SkyTime, number> = {
  dawn: 0xffcfa3,
  day: 0x87ceeb,
  dusk: 0xffb37a,
  night: 0x050b1a,
};

const NIGHT_COLOR = new THREE.Color(SKY_BACKGROUND_COLORS.night);
const DAWN_COLOR = new THREE.Color(SKY_BACKGROUND_COLORS.dawn);
const DAY_COLOR = new THREE.Color(SKY_BACKGROUND_COLORS.day);
const DUSK_COLOR = new THREE.Color(SKY_BACKGROUND_COLORS.dusk);

const MODE_PRESETS: Record<SkyTime, {
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  background: THREE.Color;
}> = {
  dawn: {
    elevation: 10,
    azimuth: 145,
    turbidity: 8,
    rayleigh: 2.2,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.7,
    background: DAWN_COLOR.clone(),
  },
  day: {
    elevation: 55,
    azimuth: 180,
    turbidity: 2.2,
    rayleigh: 3.2,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.8,
    background: DAY_COLOR.clone(),
  },
  dusk: {
    elevation: 8,
    azimuth: 215,
    turbidity: 9,
    rayleigh: 2.1,
    mieCoefficient: 0.0065,
    mieDirectionalG: 0.72,
    background: DUSK_COLOR.clone(),
  },
  night: {
    elevation: -8,
    azimuth: 180,
    turbidity: 1.2,
    rayleigh: 0.3,
    mieCoefficient: 0.001,
    mieDirectionalG: 0.9,
    background: NIGHT_COLOR.clone(),
  },
};

function buildTimePreset(hours01: number) {
  const clamped = clamp(Number.isFinite(hours01) ? hours01 : 0, 0, 1);
  const angle = clamped * Math.PI * 2;
  const dayStrength = clamp(Math.sin(angle - Math.PI / 2), -1, 1);
  const elevation = clamp(dayStrength * 70, -15, 85);
  const azimuth = ((radToDeg(angle) + 180) % 360 + 360) % 360;
  const daylight = Math.max(dayStrength, 0);
  const duskBlend = clamp(1 - Math.abs(clamped - 0.5) * 4, 0, 1);

  const turbidity = lerp(10, 2.5, clamp(daylight * 1.2, 0, 1));
  const rayleigh = lerp(0.6, 3.25, clamp(daylight * 1.1, 0, 1));
  const mieCoefficient = lerp(0.01, 0.0025, clamp(daylight * 1.2, 0, 1));
  const mieDirectionalG = lerp(0.7, 0.88, clamp(daylight * 1.1, 0, 1));

  const background = new THREE.Color();
  if (daylight <= 0.0001) {
    background.copy(NIGHT_COLOR);
  } else {
    const warmEdge = new THREE.Color().lerpColors(DAWN_COLOR, DUSK_COLOR, clamp(clamped * 2, 0, 1));
    const blend = lerp(0, 1, clamp(daylight + duskBlend * 0.5, 0, 1));
    background.lerpColors(NIGHT_COLOR, warmEdge, clamp(duskBlend, 0, 1));
    background.lerp(DAY_COLOR, clamp(daylight, 0, 1));
    background.lerp(DAY_COLOR, blend * 0.5);
  }

  return {
    elevation,
    azimuth,
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    background,
  };
}

export function createProceduralSky(renderer: THREE.WebGLRenderer) {
  const internalScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(450000);
  sky.frustumCulled = false;
  internalScene.add(sky);

  const sun = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (typeof pmrem.compileCubemapShader === 'function') {
    try { pmrem.compileCubemapShader(); } catch {}
  }
  if (typeof pmrem.compileEquirectangularShader === 'function') {
    try { pmrem.compileEquirectangularShader(); } catch {}
  }

  const uniforms = sky.material.uniforms;
  const background = MODE_PRESETS.day.background.clone();

  let disposed = false;
  let lastMode: SkyTime = 'day';
  let envTarget: THREE.WebGLRenderTarget | null = null;
  let needsRebuild = true;
  let lastPmremTime = -Infinity;

  const applyPreset = (preset: {
    elevation: number;
    azimuth: number;
    turbidity: number;
    rayleigh: number;
    mieCoefficient: number;
    mieDirectionalG: number;
    background: THREE.Color;
  }) => {
    if (!preset) return;
    const theta = degToRad(90 - clamp(preset.elevation, -90, 90));
    const phi = degToRad(((preset.azimuth % 360) + 360) % 360);

    sun.setFromSphericalCoords(1, theta, phi);
    uniforms.sunPosition.value.copy(sun);
    uniforms.turbidity.value = preset.turbidity;
    uniforms.rayleigh.value = preset.rayleigh;
    uniforms.mieCoefficient.value = preset.mieCoefficient;
    uniforms.mieDirectionalG.value = preset.mieDirectionalG;
    background.copy(preset.background);
    needsRebuild = true;
  };

  applyPreset(MODE_PRESETS.day);

  const rebuildEnvironment = (now: number) => {
    if (!needsRebuild && envTarget && now - lastPmremTime < MIN_PMREM_INTERVAL_MS) {
      return;
    }
    if (now - lastPmremTime < MIN_PMREM_INTERVAL_MS && envTarget) {
      return;
    }
    const previous = envTarget;
    envTarget = pmrem.fromScene(internalScene);
    lastPmremTime = now;
    needsRebuild = false;
    if (previous) {
      disposeAll(previous.texture, previous);
    }
  };

  return {
    setMode(mode: SkyTime) {
      if (disposed) return;
      const next = MODE_PRESETS[mode] ?? MODE_PRESETS.day;
      lastMode = mode;
      applyPreset(next);
    },
    setTime(hours01: number) {
      if (disposed) return;
      const preset = buildTimePreset(hours01);
      applyPreset(preset);
    },
    update(_dt: number) {},
    async applyTo(scene: THREE.Scene) {
      if (disposed) return;
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      rebuildEnvironment(now);
      if (!envTarget) {
        // Ensure at least one environment texture exists
        rebuildEnvironment(now + MIN_PMREM_INTERVAL_MS);
      }
      if (!envTarget) {
        return;
      }
      scene.environment = envTarget.texture;
      scene.background = background.clone();
      if (typeof window !== 'undefined') {
        const debug = (window as typeof window & { __athensDebug?: any }).__athensDebug;
        if (debug && typeof debug === 'object') {
          debug.proceduralSky = {
            mode: lastMode,
            turbidity: uniforms.turbidity.value,
            rayleigh: uniforms.rayleigh.value,
            mieCoefficient: uniforms.mieCoefficient.value,
            mieDirectionalG: uniforms.mieDirectionalG.value,
            sun: sun.clone(),
          };
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeAll(envTarget?.texture, envTarget);
      envTarget = null;
      pmrem.dispose();
      disposeAll(sky.material, (sky as any).geometry);
      internalScene.clear();
    },
  };
}

export const SKY_PROCEDURAL_BACKGROUNDS = SKY_BACKGROUND_COLORS;
