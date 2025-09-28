import * as THREE from 'three';

const tempBottom = new THREE.Vector3();
const tempTop = new THREE.Vector3();
const tempAttempt = new THREE.Vector3();
const tempPrevPos = new THREE.Vector3();
const tempActualMove = new THREE.Vector3();
const tempRemaining = new THREE.Vector3();
const tempBox = new THREE.Box3();
const tempMtv = new THREE.Vector3();
const tempNormal = new THREE.Vector3();

const BLOCKED_NORMALS = [];

export class Capsule {
  constructor(radius = 0.5, height = 1.6) {
    this.radius = Number.isFinite(radius) ? Math.max(0, radius) : 0.5;
    this.height = Number.isFinite(height) ? Math.max(0, height) : 0;
    this.position = new THREE.Vector3();
  }

  setPosition(x = 0, y = 0, z = 0) {
    this.position.set(x, y, z);
    return this;
  }

  getPosition(target) {
    if (target && target.isVector3) {
      target.copy(this.position);
      return target;
    }
    return this.position.clone();
  }

  clone() {
    const capsule = new Capsule(this.radius, this.height);
    capsule.position.copy(this.position);
    return capsule;
  }
}

export function expandAABB(box, radius, target = new THREE.Box3()) {
  target.copy(box);
  target.min.x -= radius;
  target.min.y -= radius;
  target.min.z -= radius;
  target.max.x += radius;
  target.max.y += radius;
  target.max.z += radius;
  return target;
}

function getSegmentPoints(capsule, bottomTarget, topTarget) {
  const halfHeight = capsule.height * 0.5;
  const { x, y, z } = capsule.position;
  bottomTarget.set(x, y - halfHeight, z);
  topTarget.set(x, y + halfHeight, z);
}

function chooseMtv(xDepthMin, xDepthMax, zDepthMin, zDepthMax, yDepthMin, yDepthMax) {
  let bestDepth = Infinity;
  tempMtv.set(0, 0, 0);

  if (xDepthMin >= 0 && xDepthMin < bestDepth) {
    bestDepth = xDepthMin;
    tempMtv.set(-xDepthMin, 0, 0);
  }
  if (xDepthMax >= 0 && xDepthMax < bestDepth) {
    bestDepth = xDepthMax;
    tempMtv.set(xDepthMax, 0, 0);
  }
  if (zDepthMin >= 0 && zDepthMin < bestDepth) {
    bestDepth = zDepthMin;
    tempMtv.set(0, 0, -zDepthMin);
  }
  if (zDepthMax >= 0 && zDepthMax < bestDepth) {
    bestDepth = zDepthMax;
    tempMtv.set(0, 0, zDepthMax);
  }
  if (yDepthMin >= 0 && yDepthMin < bestDepth) {
    bestDepth = yDepthMin;
    tempMtv.set(0, -yDepthMin, 0);
  }
  if (yDepthMax >= 0 && yDepthMax < bestDepth) {
    bestDepth = yDepthMax;
    tempMtv.set(0, yDepthMax, 0);
  }

  if (!Number.isFinite(bestDepth) || bestDepth === Infinity) {
    return null;
  }

  return tempMtv.lengthSq() > 0 ? tempMtv : null;
}

export function segmentAABBOverlap(p0, p1, box) {
  const x = p0.x;
  const z = p0.z;

  if (x < box.min.x || x > box.max.x) return null;
  if (z < box.min.z || z > box.max.z) return null;

  const segMinY = Math.min(p0.y, p1.y);
  const segMaxY = Math.max(p0.y, p1.y);

  if (segMaxY < box.min.y || segMinY > box.max.y) return null;

  const xDepthMin = x - box.min.x;
  const xDepthMax = box.max.x - x;
  const zDepthMin = z - box.min.z;
  const zDepthMax = box.max.z - z;
  const yDepthMin = segMaxY - box.min.y;
  const yDepthMax = box.max.y - segMinY;

  return chooseMtv(xDepthMin, xDepthMax, zDepthMin, zDepthMax, yDepthMin, yDepthMax);
}

export function resolveCapsuleVsAABBs(capsule, delta, aabbs, { maxIters = 3, skin = 0.01 } = {}) {
  const results = { moved: new THREE.Vector3() };
  if (!capsule || !delta || !aabbs || aabbs.length === 0) {
    if (capsule && delta) {
      capsule.position.add(delta);
      results.moved.copy(delta);
    }
    return results;
  }

  const iterationCount = Math.max(1, Math.floor(maxIters));
  const skinWidth = Number.isFinite(skin) ? Math.max(0, skin) : 0.01;

  tempRemaining.copy(delta);
  results.moved.set(0, 0, 0);

  for (let iter = 0; iter < iterationCount; iter += 1) {
    if (tempRemaining.lengthSq() <= 1e-10) {
      break;
    }

    tempAttempt.copy(tempRemaining);
    tempPrevPos.copy(capsule.position);
    capsule.position.add(tempAttempt);

    let collided = false;
    BLOCKED_NORMALS.length = 0;

    getSegmentPoints(capsule, tempBottom, tempTop);

    for (let i = 0; i < aabbs.length; i += 1) {
      const entry = aabbs[i];
      if (!entry || !entry.box) continue;
      const expanded = expandAABB(entry.box, capsule.radius + skinWidth, tempBox);
      const mtv = segmentAABBOverlap(tempBottom, tempTop, expanded);
      if (!mtv) continue;

      collided = true;
      capsule.position.add(mtv);
      const lengthSq = mtv.lengthSq();
      if (lengthSq > 1e-12) {
        tempNormal.copy(mtv).multiplyScalar(-1 / Math.sqrt(lengthSq));
        const slot = BLOCKED_NORMALS.length;
        if (!BLOCKED_NORMALS[slot]) {
          BLOCKED_NORMALS[slot] = new THREE.Vector3();
        }
        BLOCKED_NORMALS[slot].copy(tempNormal);
      }

      // Update segment points for successive tests
      getSegmentPoints(capsule, tempBottom, tempTop);
    }

    tempActualMove.subVectors(capsule.position, tempPrevPos);
    results.moved.add(tempActualMove);

    tempRemaining.sub(tempActualMove);

    if (BLOCKED_NORMALS.length > 0) {
      for (let n = 0; n < BLOCKED_NORMALS.length; n += 1) {
        const normal = BLOCKED_NORMALS[n];
        const push = tempRemaining.dot(normal);
        if (push > 0) {
          tempRemaining.addScaledVector(normal, -push);
        }
      }
    }

    if (!collided) {
      break;
    }
  }

  return results;
}
