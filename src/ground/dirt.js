import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';

const textureLoader = new THREE.TextureLoader();
let cachedBaseTexture = null;

function loadBaseTexture() {
  if (!cachedBaseTexture) {
    cachedBaseTexture = textureLoader.load(resolveAssetUrl('assets/textures/athens_dust.jpg'));

    if ('SRGBColorSpace' in THREE) cachedBaseTexture.colorSpace = THREE.SRGBColorSpace;
    else if ('sRGBEncoding' in THREE) cachedBaseTexture.encoding = THREE.sRGBEncoding;
  }
  return cachedBaseTexture;
}

function configureTexture(baseTexture, { repeat, anisotropy }) {
  const texture = baseTexture.clone();
  texture.needsUpdate = true;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  if (typeof repeat === 'number') {
    texture.repeat.set(repeat, repeat);
  }

  if (typeof anisotropy === 'number') {
    texture.anisotropy = Math.max(texture.anisotropy || 0, anisotropy);
  }

  if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) texture.encoding = THREE.sRGBEncoding;

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

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
