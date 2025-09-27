import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';

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

  const texLoader = new THREE.TextureLoader();

  const color = texLoader.load(resolveAssetUrl('assets/textures/athens_dust.jpg'));

  [color].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = Math.max(t.anisotropy || 0, anisotropy);
  });

  if ('SRGBColorSpace' in THREE) color.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) color.encoding = THREE.sRGBEncoding;

  const mat = new THREE.MeshStandardMaterial({
    map: color,
    roughness: 1.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = receiveShadow;

  group.add(mesh);
  return group;
}
