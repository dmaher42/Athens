// Mark meshes that represent terrain/ground so we can raycast against them.
import * as THREE from 'three';

const NAME_HINTS = ['ground','terrain','plaza','agora','acropolis','city','wall','road','plateau','floor','soil','dirt','grass'];

function traverse(root, callback) {
  if (!root) return;
  if (typeof root.traverse === 'function') {
    root.traverse(callback);
  } else {
    callback(root);
  }
}

export function markGround(root) {
  traverse(root, (obj) => {
    if (!(obj?.isMesh || obj instanceof THREE.Mesh)) return;
    const n = (obj.name || '').toLowerCase();
    if (obj.userData?.isGround === true) return;
    if (NAME_HINTS.some((k) => n.includes(k))) obj.userData.isGround = true;
  });
}

export function collectGround(rootOrScene) {
  const out = [];
  traverse(rootOrScene, (obj) => {
    if ((obj?.isMesh || obj instanceof THREE.Mesh) && obj.userData?.isGround) out.push(obj);
  });
  return out;
}
