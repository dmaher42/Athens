import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';

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

  const texLoader = new THREE.TextureLoader();

  const color = texLoader.load(resolveAssetUrl('assets/textures/grass.jpg'));

  [color].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = Math.max(t.anisotropy || 0, anisotropy);
  });

  if ('SRGBColorSpace' in THREE) color.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) color.encoding = THREE.sRGBEncoding;

  const mat = new THREE.MeshStandardMaterial({
    map: color,
    roughness: 0.9,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
