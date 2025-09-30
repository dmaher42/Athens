import * as THREE from 'three';
import { setTimeOfDay, getTimeOfDay } from '../sky/timeSky.js';

export const TIME_MODES = ['dawn', 'day', 'dusk', 'night'] as const;
export type TimeMode = (typeof TIME_MODES)[number];

type LightingContext = {
  scene?: THREE.Scene | null;
  renderer?: THREE.WebGLRenderer | null;
  sun?: THREE.DirectionalLight | null;
  ambient?: THREE.Light | null;
};

let current: TimeMode = 'day';
let paused = false;

const MODE_EXPOSURE: Record<TimeMode, number> = {
  dawn: 0.9,
  day: 1.05,
  dusk: 0.9,
  night: 0.7
};

const MODE_SUN_INTENSITY: Record<TimeMode, number> = {
  dawn: 1.6,
  day: 3.0,
  dusk: 1.6,
  night: 0.5
};

const MODE_AMBIENT_INTENSITY: Record<TimeMode, number> = {
  dawn: 0.55,
  day: 0.8,
  dusk: 0.55,
  night: 0.35
};

const SUN_DIRECTIONS: Record<TimeMode, THREE.Vector3> = {
  dawn: new THREE.Vector3(-0.35, 0.55, 0.25),
  day: new THREE.Vector3(-0.25, 0.95, 0.3),
  dusk: new THREE.Vector3(0.3, 0.55, -0.25),
  night: new THREE.Vector3(0.1, 0.2, -0.4)
};

const DEFAULT_MODE: TimeMode = 'day';

function normalizeMode(mode: string | null | undefined): TimeMode {
  if (!mode) {
    return current ?? DEFAULT_MODE;
  }
  const normalized = `${mode}`.toLowerCase();
  const found = TIME_MODES.find((value) => value === normalized);
  if (found) {
    return found;
  }
  return current ?? DEFAULT_MODE;
}

function applyLighting(mode: TimeMode, ctx: LightingContext = {}) {
  const { renderer, sun, ambient } = ctx;
  if (renderer) {
    const targetExposure = MODE_EXPOSURE[mode] ?? renderer.toneMappingExposure;
    renderer.toneMappingExposure = targetExposure;
  }
  if (sun) {
    const intensity = MODE_SUN_INTENSITY[mode] ?? sun.intensity;
    sun.intensity = intensity;
    const direction = SUN_DIRECTIONS[mode];
    if (direction) {
      sun.position.set(direction.x * 400, Math.max(direction.y * 400, 30), direction.z * 400);
    }
  }
  if (ambient) {
    const target = MODE_AMBIENT_INTENSITY[mode] ?? ambient.intensity;
    ambient.intensity = target;
  }
}

export function getTimeMode(): TimeMode {
  return current;
}

export function isTimePaused(): boolean {
  return paused;
}

export function setTimePaused(value: boolean): boolean {
  paused = Boolean(value);
  return paused;
}

export async function setTimeMode(
  mode: TimeMode | string,
  ctx: LightingContext = {}
): Promise<TimeMode> {
  const next = typeof mode === 'string' ? mode : mode ?? current;
  const requested = next ?? current;
  const applied = await setTimeOfDay(requested);
  const normalized = normalizeMode(applied ?? requested ?? current);
  current = normalized;
  applyLighting(normalized, ctx);
  return current;
}

export async function initializeTimeMode(
  mode: TimeMode | string | null | undefined,
  ctx: LightingContext = {}
): Promise<TimeMode> {
  const fallback = (getTimeOfDay?.() as TimeMode | null | undefined) ?? current;
  const requested = typeof mode === 'string' ? mode : fallback;
  const normalized = normalizeMode(requested ?? fallback ?? current);
  current = normalized;
  return setTimeMode(normalized, ctx);
}

export async function shiftTimeForward(ctx: LightingContext = {}): Promise<TimeMode> {
  const index = TIME_MODES.indexOf(current);
  const next = TIME_MODES[(index + 1) % TIME_MODES.length];
  return setTimeMode(next, ctx);
}

export async function shiftTimeBackward(ctx: LightingContext = {}): Promise<TimeMode> {
  const index = TIME_MODES.indexOf(current);
  const nextIndex = (index - 1 + TIME_MODES.length) % TIME_MODES.length;
  const previous = TIME_MODES[nextIndex];
  return setTimeMode(previous, ctx);
}
