import { groundYAt } from '../utils/spawn.ts';

const DEFAULT_OPTIONS = {
  gravity: 12,
  hover: 0.03,
  maxStepUp: 1,
  maxDrop: 4,
  rayStart: 1000
};

function ensureState(state, positionY) {
  if (!state || typeof state !== 'object') {
    return {
      vy: 0,
      lastGoodY: Number.isFinite(positionY) ? positionY : 0
    };
  }
  if (!Number.isFinite(state.vy)) {
    state.vy = 0;
  }
  if (!Number.isFinite(state.lastGoodY)) {
    state.lastGoodY = Number.isFinite(positionY) ? positionY : 0;
  }
  return state;
}

export function snapToGround(object3d, groundMeshes, inputState, deltaSeconds = 0, options = DEFAULT_OPTIONS) {
  if (!object3d) {
    return false;
  }

  const state = ensureState(inputState, object3d.position?.y ?? 0);
  const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  const meshes = Array.isArray(groundMeshes)
    ? groundMeshes
    : groundMeshes
      ? [groundMeshes]
      : [];

  const gravity = Number.isFinite(options?.gravity) ? options.gravity : DEFAULT_OPTIONS.gravity;
  const hover = Number.isFinite(options?.hover) ? options.hover : DEFAULT_OPTIONS.hover;
  const stepMaxRaw = Number.isFinite(options?.maxStepUp)
    ? options.maxStepUp
    : Number.isFinite(options?.stepMax)
      ? options.stepMax
      : DEFAULT_OPTIONS.maxStepUp;
  const dropMaxRaw = Number.isFinite(options?.maxDrop) ? options.maxDrop : DEFAULT_OPTIONS.maxDrop;
  const rayStart = Number.isFinite(options?.rayStart) ? options.rayStart : DEFAULT_OPTIONS.rayStart;

  const maxStepUp = Math.max(0, stepMaxRaw);
  const maxDrop = Math.max(0, dropMaxRaw);

  const position = object3d.position;
  if (!position) {
    return false;
  }

  const groundY = groundYAt(position.x, position.z, meshes, rayStart);

  if (groundY != null) {
    const targetY = groundY + hover;
    const delta = targetY - position.y;
    if (delta > 1e-5) {
      const step = Math.min(delta, maxStepUp);
      position.y = step === delta ? targetY : position.y + step;
    } else if (delta < -1e-5) {
      const step = Math.max(delta, -maxDrop);
      position.y = step === delta ? targetY : position.y + step;
    } else {
      position.y = targetY;
    }
    state.vy = 0;
    state.lastGoodY = groundY;
    return true;
  }

  if (dt > 0 && Number.isFinite(gravity) && gravity > 0) {
    state.vy += gravity * dt;
    const fallDistance = state.vy * dt;
    if (Number.isFinite(fallDistance) && fallDistance > 0) {
      const limit = maxDrop > 0 ? maxDrop : fallDistance;
      position.y -= Math.min(fallDistance, limit);
    }
  }

  const lastGoodY = Number.isFinite(state.lastGoodY) ? state.lastGoodY : position.y;
  if (lastGoodY - position.y > maxDrop + hover) {
    position.y = lastGoodY + hover;
    state.vy = 0;
    state.lastGoodY = lastGoodY;
    return true;
  }

  return false;
}
