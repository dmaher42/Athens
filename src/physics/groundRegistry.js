import * as THREE from 'three';

const GROUND_KEYWORDS = [
  'ground',
  'terrain',
  'plaza',
  'agora',
  'acropolis',
  'city',
  'wall',
  'road'
];

function looksLikeGround(object) {
  if (!object || !object.name) {
    return false;
  }
  const name = String(object.name).toLowerCase();
  return GROUND_KEYWORDS.some((keyword) => name.includes(keyword));
}

function tagGround(object) {
  if (!object) {
    return;
  }
  object.userData = object.userData || {};
  object.userData.isGround = true;
}

function traverse(root, callback) {
  if (!root) {
    return;
  }
  if (typeof root.traverse === 'function') {
    root.traverse(callback);
  } else {
    callback(root);
  }
}

export function markGround(root) {
  traverse(root, (child) => {
    if (!child || !child.visible) {
      return;
    }
    if (child.isMesh || child.isSkinnedMesh || child instanceof THREE.Mesh) {
      if (child.userData?.isGround) {
        return;
      }
      if (looksLikeGround(child)) {
        tagGround(child);
      }
    }
  });
}

export function collectGround(rootOrScene) {
  const grounds = [];
  traverse(rootOrScene, (child) => {
    if (!child) {
      return;
    }
    if ((child.isMesh || child.isSkinnedMesh || child instanceof THREE.Mesh) && child.userData?.isGround) {
      grounds.push(child);
    }
  });
  return grounds;
}
