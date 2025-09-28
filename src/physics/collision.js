import * as THREE from 'three';

const EPSILON = 1e-6;

export class Capsule {
  constructor(radius = 0.5, height = 1.6) {
    this.radius = Number.isFinite(radius) && radius > 0 ? radius : 0.5;
    this.height = Number.isFinite(height) && height >= 0 ? height : 0;
    this.center = new THREE.Vector3();
  }

  setPosition(x, y, z) {
    this.center.set(x, y, z);
    return this;
  }

  getPosition(target = new THREE.Vector3()) {
    target.copy(this.center);
    return target;
  }

  clone() {
    const copy = new Capsule(this.radius, this.height);
    copy.center.copy(this.center);
    return copy;
  }
}

const EXPANDED_BOX = new THREE.Box3();
const CAPSULE_BOTTOM = new THREE.Vector3();
const CAPSULE_TOP = new THREE.Vector3();
const CAPSULE_MID = new THREE.Vector3();
const MTV_MID = new THREE.Vector3();
const MTV_TOP = new THREE.Vector3();
const MTV_BOTTOM = new THREE.Vector3();
const PUSH_VECTOR = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const DELTA_VEC = new THREE.Vector3();
const START_POS = new THREE.Vector3();

function isPointInsideBox(point, box) {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

function computeMTVForPoint(point, box, target) {
  if (!isPointInsideBox(point, box)) {
    return null;
  }

  let best = Infinity;

  const left = point.x - box.min.x;
  if (left < best) {
    best = left;
    target.set(-left, 0, 0);
  }

  const right = box.max.x - point.x;
  if (right < best) {
    best = right;
    target.set(right, 0, 0);
  }

  const down = point.y - box.min.y;
  if (down < best) {
    best = down;
    target.set(0, -down, 0);
  }

  const up = box.max.y - point.y;
  if (up < best) {
    best = up;
    target.set(0, up, 0);
  }

  const back = point.z - box.min.z;
  if (back < best) {
    best = back;
    target.set(0, 0, -back);
  }

  const forward = box.max.z - point.z;
  if (forward < best) {
    best = forward;
    target.set(0, 0, forward);
  }

  if (best === Infinity) {
    return null;
  }

  return target;
}

export function expandAABB(box, radius) {
  EXPANDED_BOX.copy(box);
  const r = Number.isFinite(radius) ? radius : 0;
  EXPANDED_BOX.min.x -= r;
  EXPANDED_BOX.min.y -= r;
  EXPANDED_BOX.min.z -= r;
  EXPANDED_BOX.max.x += r;
  EXPANDED_BOX.max.y += r;
  EXPANDED_BOX.max.z += r;
  return EXPANDED_BOX;
}

export function segmentAABBOverlap(p0, p1, box) {
  const x = p0.x;
  const z = p0.z;
  if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) {
    return false;
  }
  const segMinY = Math.min(p0.y, p1.y);
  const segMaxY = Math.max(p0.y, p1.y);
  if (segMaxY < box.min.y || segMinY > box.max.y) {
    return false;
  }
  return true;
}

function computeCapsuleMTV(capsule, expandedBox, skin) {
  const halfHeight = Math.max(0, capsule.height) * 0.5;
  CAPSULE_BOTTOM.set(capsule.center.x, capsule.center.y - halfHeight, capsule.center.z);
  CAPSULE_TOP.set(capsule.center.x, capsule.center.y + halfHeight, capsule.center.z);

  if (!segmentAABBOverlap(CAPSULE_BOTTOM, CAPSULE_TOP, expandedBox)) {
    return null;
  }

  const segMinY = Math.min(CAPSULE_BOTTOM.y, CAPSULE_TOP.y);
  const segMaxY = Math.max(CAPSULE_BOTTOM.y, CAPSULE_TOP.y);
  const overlapMin = Math.max(segMinY, expandedBox.min.y);
  const overlapMax = Math.min(segMaxY, expandedBox.max.y);
  const clampedY = THREE.MathUtils.clamp((overlapMin + overlapMax) * 0.5, segMinY, segMaxY);

  CAPSULE_MID.set(capsule.center.x, clampedY, capsule.center.z);

  let bestVector = null;
  let bestMagnitude = -Infinity;

  const candidates = [
    computeMTVForPoint(CAPSULE_MID, expandedBox, MTV_MID),
    computeMTVForPoint(CAPSULE_TOP, expandedBox, MTV_TOP),
    computeMTVForPoint(CAPSULE_BOTTOM, expandedBox, MTV_BOTTOM)
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (!candidate) {
      continue;
    }
    const lengthSq = candidate.lengthSq();
    if (lengthSq > bestMagnitude && lengthSq > EPSILON) {
      bestMagnitude = lengthSq;
      bestVector = candidate;
    }
  }

  if (!bestVector) {
    return null;
  }

  const depth = Math.sqrt(bestMagnitude);
  if (depth <= EPSILON) {
    return null;
  }

  NORMAL.copy(bestVector).multiplyScalar(1 / depth);
  const correction = Math.max(depth - skin, 0);
  if (correction <= EPSILON) {
    return null;
  }

  PUSH_VECTOR.copy(NORMAL).multiplyScalar(correction);
  return PUSH_VECTOR;
}

export function resolveCapsuleVsAABBs(capsule, delta, aabbs, { maxIters = 3, skin = 0.01 } = {}) {
  const moved = new THREE.Vector3();
  if (!capsule || !delta) {
    return { moved };
  }

  const colliders = Array.isArray(aabbs) ? aabbs : [];

  DELTA_VEC.copy(delta);
  if (DELTA_VEC.lengthSq() <= EPSILON) {
    return { moved };
  }

  START_POS.copy(capsule.center);
  capsule.center.add(DELTA_VEC);

  if (colliders.length > 0) {
    const iterations = Math.max(1, Math.floor(maxIters));
    for (let iter = 0; iter < iterations; iter += 1) {
      let collided = false;
      for (let i = 0; i < colliders.length; i += 1) {
        const entry = colliders[i];
        if (!entry || !entry.box) {
          continue;
        }
        const expanded = expandAABB(entry.box, capsule.radius);
        const correction = computeCapsuleMTV(capsule, expanded, skin);
        if (!correction) {
          continue;
        }
        capsule.center.add(correction);
        collided = true;
      }
      if (!collided) {
        break;
      }
    }
  }

  moved.copy(capsule.center).sub(START_POS);
  return { moved };
}

