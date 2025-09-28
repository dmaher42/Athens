import * as THREE from 'three';

const TEMP_DIRECTION = new THREE.Vector3();

export function buildPathPoints(grid, cells) {
  const points = [];
  if (!grid || !Array.isArray(cells)) {
    return points;
  }
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (!cell) continue;
    const { cx, cz } = cell;
    const world = grid.cellToWorld?.(cx, cz);
    if (world) {
      points.push(world);
    }
  }
  return points;
}

export function createPathFollower() {
  const state = {
    points: [],
    segment: 0,
    arrivalRadius: 0.25,
    velocity: new THREE.Vector3(),
    yaw: 0,
    active: false
  };

  return {
    setPath(points) {
      state.points = Array.isArray(points) ? points : [];
      state.segment = 0;
      state.active = state.points.length > 0;
      state.velocity.set(0, 0, 0);
      if (state.active && state.points[0]) {
        const first = state.points[0];
        TEMP_DIRECTION.set(first.x, 0, first.z);
        state.yaw = Number.isFinite(state.yaw) ? state.yaw : 0;
      }
    },
    clear() {
      state.points = [];
      state.segment = 0;
      state.active = false;
      state.velocity.set(0, 0, 0);
    },
    isActive() {
      return state.active;
    },
    getYaw() {
      return state.yaw;
    },
    update(object3d, dt, { speed = 1.6, turn = 0.18 } = {}) {
      const result = { arrived: false, moved: 0 };
      if (!state.active || !object3d) {
        return result;
      }
      if (!object3d.position || !Number.isFinite(dt) || dt <= 0) {
        return result;
      }

      const arrivalSq = state.arrivalRadius * state.arrivalRadius;
      let remainingDt = dt;
      while (state.active && remainingDt > 0) {
        const target = state.points[state.segment];
        if (!target) {
          state.active = false;
          state.velocity.set(0, 0, 0);
          break;
        }

        TEMP_DIRECTION.subVectors(target, object3d.position);
        TEMP_DIRECTION.y = 0;
        const distSq = TEMP_DIRECTION.lengthSq();
        if (distSq <= arrivalSq) {
          if (state.segment >= state.points.length - 1) {
            state.active = false;
            state.velocity.set(0, 0, 0);
            result.arrived = true;
            break;
          }
          state.segment += 1;
          continue;
        }

        const dist = Math.sqrt(distSq);
        if (dist <= 1e-6) {
          break;
        }
        TEMP_DIRECTION.multiplyScalar(1 / dist);
        const maxStep = speed * remainingDt;
        const step = Math.min(dist, maxStep);
        object3d.position.x += TEMP_DIRECTION.x * step;
        object3d.position.z += TEMP_DIRECTION.z * step;
        result.moved += step;

        const desiredYaw = Math.atan2(TEMP_DIRECTION.x, TEMP_DIRECTION.z);
        const currentYaw = Number.isFinite(state.yaw) ? state.yaw : object3d.rotation?.y || 0;
        const lerp = THREE.MathUtils.clamp(turn, 0, 1);
        const nextYaw = lerp >= 1 ? desiredYaw : THREE.MathUtils.lerpAngle(currentYaw, desiredYaw, lerp);
        state.yaw = nextYaw;
        if (object3d.rotation) {
          object3d.rotation.y = nextYaw;
        }

        state.velocity.set(TEMP_DIRECTION.x * speed, 0, TEMP_DIRECTION.z * speed);
        break;
      }

      return result;
    }
  };
}

export default createPathFollower;
