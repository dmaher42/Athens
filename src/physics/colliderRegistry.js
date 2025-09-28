import * as THREE from 'three';

const COLLIDER_KEYWORDS = [
  'parthenon',
  'agora',
  'stoa',
  'wall',
  'citywall',
  'temple',
  'building',
  'house',
  'column',
  'rock',
  'statue',
  'prop',
  'gate'
];

const keywordCache = COLLIDER_KEYWORDS.map((word) => word.toLowerCase());

function shouldMarkCollider(object) {
  if (!object || typeof object !== 'object') {
    return false;
  }
  if (object.userData && object.userData.collider === true) {
    return true;
  }
  if (!object.name || typeof object.name !== 'string') {
    return false;
  }
  const name = object.name.toLowerCase();
  for (let i = 0; i < keywordCache.length; i += 1) {
    if (name.includes(keywordCache[i])) {
      return true;
    }
  }
  return false;
}

export function markColliders(root) {
  if (!root) return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.children && current.children.length) {
      for (let i = 0; i < current.children.length; i += 1) {
        stack.push(current.children[i]);
      }
    }
    if (current.isMesh && shouldMarkCollider(current)) {
      current.userData = current.userData || {};
      current.userData.isCollider = true;
    }
  }
}

export function collectColliders(root) {
  const colliders = [];
  if (!root) return colliders;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.children && current.children.length) {
      for (let i = 0; i < current.children.length; i += 1) {
        stack.push(current.children[i]);
      }
    }
    if (current.isMesh && current.userData && current.userData.isCollider === true) {
      colliders.push(current);
    }
  }
  return colliders;
}

function computeWorldAABB(mesh, target) {
  if (!mesh || !mesh.geometry || !target) return target;
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (geometry.boundingBox) {
    target.copy(geometry.boundingBox);
    target.applyMatrix4(mesh.matrixWorld);
  } else {
    target.makeEmpty();
  }
  return target;
}

export function buildAABBs(meshes) {
  const list = Array.isArray(meshes) ? meshes : [];
  const results = [];
  for (let i = 0; i < list.length; i += 1) {
    const mesh = list[i];
    if (!mesh || !mesh.isMesh) continue;
    const box = new THREE.Box3();
    computeWorldAABB(mesh, box);
    results.push({ mesh, box });
  }
  return results;
}

export function updateAABBs(aabbs) {
  if (!Array.isArray(aabbs)) return aabbs;
  for (let i = 0; i < aabbs.length; i += 1) {
    const entry = aabbs[i];
    if (!entry || !entry.mesh || !entry.box) continue;
    computeWorldAABB(entry.mesh, entry.box);
  }
  return aabbs;
}

export default {
  markColliders,
  collectColliders,
  buildAABBs,
  updateAABBs
};
