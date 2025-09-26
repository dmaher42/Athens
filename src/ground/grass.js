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
    const url = resolveAssetUrl('assets/textures/grass.jpg');
    cachedBaseTexture = loadTextureWithFallback(url, {
      loader: textureLoader,
      label: 'ground grass texture',
      fallbackColor: 0x4a7f39,
      onLoad: (texture, { fallback }) => {
        applySharedSettings(texture);
        if (!fallback) {
          flushPendingTextureUpdates(texture);
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
  } else {
    pendingTextureUpdates.add(texture);
  }

  return texture;
}

export function createGrassGround({
  size = 200,
  repeat = 16,
  height = 0.02,           // slight offset so it doesn’t z-fight with dirt if overlapped
  receiveShadow = true,
  anisotropy = 8,
} = {}) {
  const group = new THREE.Group();
  group.name = 'ground:grass';

  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const finalHeight = Math.max(typeof height === 'number' ? height : 0.02, 0.02);
  geo.translate(0, finalHeight, 0);

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
