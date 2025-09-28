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

const keywordMatch = (name) => {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  const normalized = name.toLowerCase();
  for (let i = 0; i < COLLIDER_KEYWORDS.length; i += 1) {
    if (normalized.includes(COLLIDER_KEYWORDS[i])) {
      return true;
    }
  }
  return false;
};

export function markColliders(root) {
  if (!root || typeof root.traverse !== 'function') {
    return;
  }
  root.traverse((child) => {
    if (!child || !child.isMesh) {
      return;
    }
    const userData = child.userData || (child.userData = {});
    if (userData.collider === true) {
      userData.isCollider = true;
      return;
    }
    if (userData.collider === false) {
      userData.isCollider = false;
      return;
    }
    if (keywordMatch(child.name)) {
      userData.isCollider = true;
    }
  });
}

export function collectColliders(root) {
  const colliders = [];
  if (!root || typeof root.traverse !== 'function') {
    return colliders;
  }
  root.traverse((child) => {
    if (child && child.isMesh && child.userData?.isCollider === true) {
      colliders.push(child);
    }
  });
  return colliders;
}

function computeWorldAABB(mesh, target) {
  if (!mesh || !mesh.isMesh || !mesh.geometry) {
    return null;
  }
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (!geometry.boundingBox) {
    return null;
  }
  target.copy(geometry.boundingBox);
  target.applyMatrix4(mesh.matrixWorld);
  return target;
}

export function buildAABBs(meshes) {
  const result = [];
  const list = Array.isArray(meshes) ? meshes : [];
  for (let i = 0; i < list.length; i += 1) {
    const mesh = list[i];
    const box = computeWorldAABB(mesh, new THREE.Box3());
    if (box) {
      result.push({ mesh, box });
    }
  }
  return result;
}

export function updateAABBs(entries) {
  if (!Array.isArray(entries)) {
    return entries;
  }
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || !entry.mesh || !entry.box) {
      continue;
    }
    const box = computeWorldAABB(entry.mesh, entry.box);
    if (!box) {
      entry.box.makeEmpty();
    }
  }
  return entries;
}

