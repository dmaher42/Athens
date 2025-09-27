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
    const url = resolveAssetUrl('assets/textures/athens_dust.jpg');
    cachedBaseTexture = loadTextureWithFallback(url, {
      loader: textureLoader,
      label: 'ground dirt texture',
      fallbackColor: 0x6b5a45,
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

export function createDirtGround({
  size = 200,
  repeat = 16,
  height = 0,
  receiveShadow = true,
  anisotropy = 8,
} = {}) {
  const group = new THREE.Group();
  group.name = 'ground:dirt';

  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, height, 0);

  const color = configureTexture(loadBaseTexture(), { repeat, anisotropy });

  const mat = new THREE.MeshStandardMaterial({
    map: color,
    roughness: 1.0,
    side: THREE.DoubleSide,
    transparent: false,
  });

  mat.opacity = 1;
  mat.depthWrite = true;
  mat.colorWrite = true;

  if (!mat.map) {
    mat.color.set(0x6b5a45);
    mat.needsUpdate = true;
  }

  mat.shadowSide = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;

  const mesh = new THREE.Mesh(geo, mat);
  applyDoubleSidedGroundSupport(mesh);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
