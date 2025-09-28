import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const RAY_ORIGIN = new THREE.Vector3();
const RAYCASTER = new THREE.Raycaster();
const DEFAULT_OPTIONS = {
  gravity: 12,
  stepMax: 0.6,
  hover: 0.03
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

function chooseHit(intersections) {
  if (!Array.isArray(intersections) || intersections.length === 0) {
    return null;
  }
  for (let i = 0; i < intersections.length; i += 1) {
    const hit = intersections[i];
    if (hit && hit.object && hit.point) {
      return hit;
    }
  }
  return null;
}

export function snapToGround(object3d, groundMeshes, inputState, deltaSeconds = 0, options = DEFAULT_OPTIONS) {
  if (!object3d) {
    return false;
  }

  const state = ensureState(inputState, object3d.position?.y ?? 0);
  const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  const meshes = Array.isArray(groundMeshes) ? groundMeshes : [];

  const gravity = Number.isFinite(options?.gravity) ? options.gravity : DEFAULT_OPTIONS.gravity;
  const stepMax = Number.isFinite(options?.stepMax) ? options.stepMax : DEFAULT_OPTIONS.stepMax;
  const hover = Number.isFinite(options?.hover) ? options.hover : DEFAULT_OPTIONS.hover;

  if (dt > 0) {
    state.vy += gravity * dt;
  }

  const vy = state.vy;
  const fallDistance = vy * dt;
  const position = object3d.position;
  const predictedY = position.y - fallDistance;

  if (meshes.length > 0) {
    RAY_ORIGIN.copy(position);
    RAY_ORIGIN.y += 1.2;

    RAYCASTER.ray.origin.copy(RAY_ORIGIN);
    RAYCASTER.ray.direction.copy(DOWN);
    RAYCASTER.near = 0;
    RAYCASTER.far = Math.max(5, 1.2 + stepMax + hover + Math.abs(vy * 0.5));

    const intersections = RAYCASTER.intersectObjects(meshes, false);
    const hit = chooseHit(intersections);

    if (hit) {
      const hitY = hit.point.y;
      const delta = hitY - predictedY;
      if (Math.abs(delta) <= stepMax) {
        position.y = hitY + hover;
        state.vy = 0;
        state.lastGoodY = hitY;
        return true;
      }
    }
  }

  position.y = predictedY;
  state.vy = vy;

  const lastGoodY = Number.isFinite(state.lastGoodY) ? state.lastGoodY : position.y;
  if (lastGoodY - position.y > 2) {
    position.y = lastGoodY + hover;
    state.vy = 0;
    state.lastGoodY = lastGoodY;
    return true;
  }

  return false;
}
