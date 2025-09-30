import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import {
  loadTextureWithFallback,
  ensureColorSpace as ensureTextureColorSpace
} from '../utils/fail-soft-loaders.js';
import { applyDoubleSidedGroundSupport } from './double-sided.js';

const textureLoader = new THREE.TextureLoader();
let cachedBaseTexture = null;
const pendingTextureUpdates = new Set();
const TILE_SEAM_EPSILON = 0.01;

function flushPendingTextureUpdates(baseTexture) {
  if (pendingTextureUpdates.size === 0) return;
  const sourceImage = baseTexture?.image;
  pendingTextureUpdates.forEach((texture) => {
    if (sourceImage && !texture.image) {
      texture.image = sourceImage;
    }
    texture.needsUpdate = true;
  });
  pendingTextureUpdates.clear();
}

function applySharedSettings(texture) {
  if (!texture) return;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  ensureTextureColorSpace(texture);
}

function loadBaseTexture() {
  if (!cachedBaseTexture) {
    const url = resolveAssetUrl('assets/textures/grass.jpg');
    cachedBaseTexture = loadTextureWithFallback(url, {
      loader: textureLoader,
      label: 'ground grass texture',
      fallbackColor: 0x4a7f39,
      onLoad: (texture, { fallback, fallbackTexture }) => {
        applySharedSettings(texture);
        if (fallback) {
          flushPendingTextureUpdates(texture);
          return;
        }
        const previous = cachedBaseTexture;
        cachedBaseTexture = texture;
        flushPendingTextureUpdates(texture);
        if (fallbackTexture && fallbackTexture !== texture) {
          try {
            fallbackTexture.dispose?.();
          } catch {
            /* ignore */
          }
        } else if (previous && previous !== texture) {
          try {
            previous.dispose?.();
          } catch {
            /* ignore */
          }
        }
      },
      onFallback: (texture) => {
        applySharedSettings(texture);
        flushPendingTextureUpdates(texture);
      }
    });

    applySharedSettings(cachedBaseTexture);
  } else if (cachedBaseTexture.image) {
    flushPendingTextureUpdates(cachedBaseTexture);
  }
  return cachedBaseTexture;
}

function configureTexture(baseTexture, { repeat, anisotropy }) {
  const texture = baseTexture.clone();
  const isFallback = Boolean(baseTexture?.userData?.isFallbackTexture);
  if (baseTexture?.image) {
    texture.image = baseTexture.image;
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  if (typeof repeat === 'number') {
    texture.repeat.set(repeat, repeat);
  }

  if (typeof anisotropy === 'number') {
    texture.anisotropy = Math.max(texture.anisotropy || 0, anisotropy);
  }

  ensureTextureColorSpace(texture);

  if (baseTexture.image) {
    texture.needsUpdate = true;
  }
  if (!baseTexture.image || isFallback) {
    pendingTextureUpdates.add(texture);
  }

  return texture;
}

function normalizeCornerHeightsInput(input) {
  if (!input) return null;

  const keys = ['nw', 'ne', 'sw', 'se'];
  let source = null;

  if (Array.isArray(input)) {
    const [nw, ne, sw, se] = input;
    source = { nw, ne, sw, se };
  } else if (typeof input === 'object') {
    source = input;
  } else {
    return null;
  }

  const result = { nw: 0, ne: 0, sw: 0, se: 0 };
  let hasData = false;

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      hasData = true;
    }
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
      hasData = true;
    }
  });

  return hasData ? result : null;
}

function applyCornerHeightsToAttribute(attribute, heights, baseY = 0) {
  if (!attribute || !heights) return false;

  const vector = new THREE.Vector3();
  const count = attribute.count ?? 0;
  if (!count) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < count; i += 1) {
    vector.fromBufferAttribute(attribute, i);
    if (vector.x < minX) minX = vector.x;
    if (vector.x > maxX) maxX = vector.x;
    if (vector.z < minZ) minZ = vector.z;
    if (vector.z > maxZ) maxZ = vector.z;
  }

  const deltaX = maxX - minX;
  const deltaZ = maxZ - minZ;

  const nw = heights.nw ?? 0;
  const ne = heights.ne ?? 0;
  const sw = heights.sw ?? 0;
  const se = heights.se ?? 0;

  for (let i = 0; i < count; i += 1) {
    vector.fromBufferAttribute(attribute, i);
    const tx = deltaX !== 0 ? THREE.MathUtils.clamp((vector.x - minX) / deltaX, 0, 1) : 0;
    const tz = deltaZ !== 0 ? THREE.MathUtils.clamp((vector.z - minZ) / deltaZ, 0, 1) : 0;

    const north = THREE.MathUtils.lerp(nw, ne, tx);
    const south = THREE.MathUtils.lerp(sw, se, tx);
    const interpolated = THREE.MathUtils.lerp(south, north, tz);

    attribute.setY(i, baseY + interpolated);
  }

  attribute.needsUpdate = true;
  return true;
}

/**
 * @typedef {Object} GrassOptions
 * @property {number} [height=0.02]                       Global Y offset for the tile.
 * @property {{x?:number, z?:number}} [slope]             Linear slope (rise per meter) along local X and Z axes.
 * @property {{nw?:number, ne?:number, se?:number, sw?:number}|[number,number,number,number]} [cornerHeights]
 *          Explicit per-corner height offsets in meters. Array order: [nw, ne, sw, se].
 */

export function createGrassGround({
  size = 200,
  repeat = 16,
  height = 0.02,           // slight offset so it doesn’t z-fight with dirt if overlapped
  slope,
  cornerHeights,
  receiveShadow = true,
  anisotropy = 8,
  expandForSeams = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'ground:grass';

  const baseSize = Math.max(typeof size === 'number' ? size : 200, 0);
  const geometrySize = expandForSeams ? baseSize + TILE_SEAM_EPSILON * 2 : baseSize;
  const geo = new THREE.PlaneGeometry(geometrySize, geometrySize, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const positionAttribute = geo.getAttribute('position');
  const normalizedCorners = normalizeCornerHeightsInput(cornerHeights);
  const finalHeight = Math.max(typeof height === 'number' ? height : 0.02, 0.02);
  let appliedCornerHeights = false;

  if (positionAttribute && normalizedCorners) {
    appliedCornerHeights = applyCornerHeightsToAttribute(positionAttribute, normalizedCorners, finalHeight);
    if (appliedCornerHeights) {
      geo.computeVertexNormals();
    }
  }

  const halfSize = geometrySize / 2;
  let updatedVertices = false;

  if (!appliedCornerHeights && positionAttribute && slope && (slope.x || slope.z)) {
    const sx = slope.x ?? 0;
    const sz = slope.z ?? 0;
    if (halfSize > 0) {
      for (let i = 0; i < positionAttribute.count; i += 1) {
        const x = positionAttribute.getX(i);
        const z = positionAttribute.getZ(i);
        const dy = (x / halfSize) * sx + (z / halfSize) * sz;
        positionAttribute.setY(i, positionAttribute.getY(i) + dy);
      }
      updatedVertices = true;
    }
  }

  if (updatedVertices) {
    positionAttribute.needsUpdate = true;
    geo.computeVertexNormals();
  }

  if (!appliedCornerHeights) {
    const translateY = finalHeight;
    if (translateY !== 0) {
      geo.translate(0, translateY, 0);
    }
  }

  const color = configureTexture(loadBaseTexture(), { repeat, anisotropy });

  const mat = new THREE.MeshStandardMaterial({
    map: color,
    roughness: 0.9,
    side: THREE.DoubleSide,
    transparent: false,
  });

  mat.opacity = 1;
  mat.depthWrite = true;
  mat.colorWrite = true;

  if (!mat.map) {
    mat.color.set(0x4a7f39);
    mat.needsUpdate = true;
  }

  mat.shadowSide = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  applyDoubleSidedGroundSupport(mesh);
  mesh.receiveShadow = receiveShadow;
  mesh.renderOrder = 1;

  group.add(mesh);
  return group;
}
