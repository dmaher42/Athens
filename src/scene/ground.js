// src/scene/ground.js
import { createGroundLayered } from '../ground/index.js';

let __groundSingleton = null;

function hideLegacyGroundPlanes(scene, layeredGroundRoot) {
  if (!scene) return;

  const layeredObjects = new Set();
  if (layeredGroundRoot) {
    layeredGroundRoot.traverse(obj => layeredObjects.add(obj));
  }

  const NAME_MATCHER = /ground|dirt|grass|dust|plane/i;

  scene.traverse(obj => {
    if (!obj?.isMesh) return;
    if (layeredObjects.has(obj)) return;
    if (!NAME_MATCHER.test(obj.name || '')) return;

    const geometryType = obj.geometry?.type;
    if (geometryType !== 'PlaneGeometry') return;

    obj.visible = false;
  });
}

function ensureWindowGroundAccessor() {
  if (typeof window === 'undefined') return;
  window.getGround = () => __groundSingleton;
}

// Signature stays the same as your current code expects.
export async function loadGround(scene, renderer, options = {}) {
  const {
    // simple defaults
    size = 400,
    repeat = 32,
    showDirt = true,
    showGrass = true,

    // allow detailed overrides
    dirtOptions = {},
    grassOptions = {},
    tiles,
    tileGrid,
    tileSize = size,
    tileRepeat = repeat,
    tileSpacing = 0,
  } = options;

  if (!__groundSingleton) {
    __groundSingleton = createGroundLayered({
      dirtOptions: { size, repeat, height: 0, ...dirtOptions },
      grassOptions: { size, repeat, height: 0.02, ...grassOptions },
      showDirt,
      showGrass,
      tiles,
      tileGrid,
      tileSize,
      tileRepeat,
      tileSpacing,
    });

    if (__groundSingleton?.root) {
      __groundSingleton.root.userData.layeredGround = true;
    }
  }

  if (__groundSingleton?.dirt) {
    __groundSingleton.dirt.visible = !!showDirt;
  }

  if (__groundSingleton?.grass) {
    __groundSingleton.grass.visible = !!showGrass;
  }

  if (scene && __groundSingleton?.root && __groundSingleton.root.parent !== scene) {
    scene.add(__groundSingleton.root);
  }

  hideLegacyGroundPlanes(scene, __groundSingleton?.root);
  ensureWindowGroundAccessor();

  return __groundSingleton;
}
