import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';

const textureLoader = new THREE.TextureLoader();
let cachedBaseTexture = null;
const pendingTextureUpdates = new Set();

function ensureColorSpace(texture) {
  if (!texture) return;
  if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) texture.encoding = THREE.sRGBEncoding;
}

function flushPendingTextureUpdates() {
  if (pendingTextureUpdates.size === 0) return;
  pendingTextureUpdates.forEach((texture) => {
    texture.needsUpdate = true;
  });
  pendingTextureUpdates.clear();
}

function loadBaseTexture() {
  if (!cachedBaseTexture) {
    cachedBaseTexture = textureLoader.load(
      resolveAssetUrl('assets/textures/grass.jpg'),
      (texture) => {
        ensureColorSpace(texture);
        flushPendingTextureUpdates();
      }
    );

    ensureColorSpace(cachedBaseTexture);
  } else if (cachedBaseTexture.image) {
    flushPendingTextureUpdates();
  }
  return cachedBaseTexture;
}

function configureTexture(baseTexture, { repeat, anisotropy }) {
  const texture = baseTexture.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  if (typeof repeat === 'number') {
    texture.repeat.set(repeat, repeat);
  }

  if (typeof anisotropy === 'number') {
    texture.anisotropy = Math.max(texture.anisotropy || 0, anisotropy);
  }

  ensureColorSpace(texture);

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
  geo.translate(0, height, 0);

  const color = configureTexture(loadBaseTexture(), { repeat, anisotropy });

  const mat = new THREE.MeshStandardMaterial({
    map: color,
    roughness: 0.9,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
