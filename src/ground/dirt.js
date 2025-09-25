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

function loadBaseTexture() {
  if (!cachedBaseTexture) {
    cachedBaseTexture = textureLoader.load(
      resolveAssetUrl('assets/textures/athens_dust.jpg'),
      (texture) => {
        ensureColorSpace(texture);
        flushPendingTextureUpdates(texture);
      }
    );

    ensureColorSpace(cachedBaseTexture);
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

  ensureColorSpace(texture);

  if (baseTexture.image) {
    texture.needsUpdate = true;
  } else {
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
  });

  if (!mat.map) {
    mat.color.set(0x6b5a45);
    mat.needsUpdate = true;
  }

  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
