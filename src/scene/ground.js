// src/scene/ground.js
import { createGroundLayered } from '../ground/index.js';
import { updateGroundDebugOverlay, clearGroundDebugOverlay } from '../ground/debug.js';

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

function ensureWindowGroundAccessor(groundLayers) {
  if (typeof window === 'undefined') return;
  window.getGround = () => groundLayers;
  window.showGround = () => {
    if (groundLayers?.dirt) groundLayers.dirt.visible = true;
    if (groundLayers?.grass) groundLayers.grass.visible = true;
    if (groundLayers?.foundationBlend) groundLayers.foundationBlend.visible = true;
  };
}

function isGroundDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('groundDebug') === '1';
  } catch {
    return false;
  }
}

function isSlopeDemoEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('slopeDemo') === '1';
  } catch {
    return false;
  }
}

// Signature stays the same as your current code expects.
export async function loadGround(scene, renderer, options = {}) {
  const {
    // simple defaults
    size = 400,
    repeat = 32,
    showDirt,
    showGrass,

    // allow detailed overrides
    dirtOptions = {},
    grassOptions = {},
    tiles,
    tileGrid,
    tileSize = size,
    tileRepeat = repeat,
    tileSpacing = 0,
    addElevationSkirts = false,
    addFoundationBlendRing = false,
    preventTileSeams,
    stabilizeTileOverlap,
    heightFn,
  } = options;

  const hasShowDirtOverride = Object.prototype.hasOwnProperty.call(options, 'showDirt');
  const hasShowGrassOverride = Object.prototype.hasOwnProperty.call(options, 'showGrass');

  const initialShowDirt = hasShowDirtOverride ? !!showDirt : true;
  const initialShowGrass = hasShowGrassOverride ? !!showGrass : true;

  if (!__groundSingleton) {
    let effectiveHeightFn = typeof heightFn === 'function' ? heightFn : undefined;
    if (!effectiveHeightFn && isSlopeDemoEnabled()) {
      effectiveHeightFn = (x) => 0.002 * x;
    }

    const layeredOptions = {
      dirtOptions: { size, repeat, height: 0, ...dirtOptions },
      grassOptions: { size, repeat, height: 0.02, ...grassOptions },
      showDirt: initialShowDirt,
      showGrass: initialShowGrass,
      tiles,
      tileGrid,
      tileSize,
      tileRepeat,
      tileSpacing,
      addElevationSkirts,
      addFoundationBlendRing,
    };

    if (effectiveHeightFn) {
      layeredOptions.heightFn = effectiveHeightFn;
    }

    if (typeof preventTileSeams === 'boolean') {
      layeredOptions.preventTileSeams = preventTileSeams;
    }
    if (typeof stabilizeTileOverlap === 'boolean') {
      layeredOptions.stabilizeTileOverlap = stabilizeTileOverlap;
    }

    const layered = createGroundLayered(layeredOptions);
    const originalDispose = layered?.dispose?.bind(layered);
    layered.dispose = () => {
      originalDispose?.();
      if (__groundSingleton === layered) {
        __groundSingleton = null;
      }
    };
    __groundSingleton = layered;

    if (__groundSingleton?.root) {
      __groundSingleton.root.userData.layeredGround = true;
    }
  }

  if (hasShowDirtOverride && __groundSingleton?.dirt) {
    __groundSingleton.dirt.visible = !!showDirt;
  }

  if (hasShowGrassOverride && __groundSingleton?.grass) {
    __groundSingleton.grass.visible = !!showGrass;
  }

  if (scene && __groundSingleton?.root && __groundSingleton.root.parent !== scene) {
    scene.add(__groundSingleton.root);
  }

  hideLegacyGroundPlanes(scene, __groundSingleton?.root);
  ensureWindowGroundAccessor(__groundSingleton);

  const debugEnabled = isGroundDebugEnabled();
  if (debugEnabled) {
    updateGroundDebugOverlay(scene, __groundSingleton, {
      enabled: true,
      preventTileSeams: __groundSingleton?.config?.preventTileSeams ?? true,
      stabilizeTileOverlap: __groundSingleton?.config?.stabilizeTileOverlap ?? true,
      addElevationSkirts: __groundSingleton?.config?.addElevationSkirts ?? !!addElevationSkirts,
    });
  } else {
    clearGroundDebugOverlay();
  }

  return __groundSingleton;
}
