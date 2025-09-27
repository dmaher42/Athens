import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { loadTextureWithFallback } from '../utils/fail-soft-loaders.js';

const fallbackMaterial = new THREE.MeshStandardMaterial({
  color: 0xbfbfbf,
  roughness: 0.85,
  metalness: 0.0
});

export function loadBuildingTextures() {
  const loader = new THREE.TextureLoader();

  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.75,
    metalness: 0.0
  });
  const applyMarbleFallback = () => {
    marbleMat.map = null;
    marbleMat.color.set(0xdedede);
    marbleMat.needsUpdate = true;
  };
  loadTextureWithFallback(resolveAssetUrl('assets/textures/marble.jpg'), {
    loader,
    label: 'marble texture',
    fallbackColor: 0xdedede,
    onLoad: (texture, { fallback }) => {
      if (fallback) {
        applyMarbleFallback();
        return;
      }
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      marbleMat.map = texture;
      marbleMat.color.set(0xffffff);
      marbleMat.needsUpdate = true;
    },
    onFallback: applyMarbleFallback
  });

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x8b3a2f,
    roughness: 0.9,
    metalness: 0.0
  });
  const applyRoofFallback = () => {
    roofMat.map = null;
    roofMat.color.set(0x8b3a2f);
    roofMat.needsUpdate = true;
  };
  loadTextureWithFallback(resolveAssetUrl('assets/textures/roof_tiles.jpg'), {
    loader,
    label: 'roof texture',
    fallbackColor: 0x8b3a2f,
    onLoad: (texture, { fallback }) => {
      if (fallback) {
        applyRoofFallback();
        return;
      }
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      roofMat.map = texture;
      roofMat.color.set(0xffffff);
      roofMat.needsUpdate = true;
    },
    onFallback: applyRoofFallback
  });

  const cityWallMat = new THREE.MeshStandardMaterial({
    color: 0xb8a27c,
    roughness: 0.82,
    metalness: 0.04
  });
  const applyCityWallFallback = () => {
    cityWallMat.map = null;
    cityWallMat.color.set(0xb8a27c);
    cityWallMat.needsUpdate = true;
  };
  loadTextureWithFallback(resolveAssetUrl('assets/textures/city_wall.jpg'), {
    loader,
    label: 'city wall texture',
    fallbackColor: 0xb8a27c,
    onLoad: (texture, { fallback }) => {
      if (fallback) {
        applyCityWallFallback();
        return;
      }
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      cityWallMat.map = texture;
      cityWallMat.color.set(0xffffff);
      cityWallMat.needsUpdate = true;
    },
    onFallback: applyCityWallFallback
  });

  return { marbleMat, roofMat, cityWallMat };
}

export function retargetBuildingMaterials(root, { marbleMat, roofMat } = {}) {
  if (!root || typeof root.traverse !== 'function') {
    return;
  }

  const marbleMaterial = marbleMat ?? fallbackMaterial;
  const roofMaterial = roofMat ?? fallbackMaterial;

  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    obj.castShadow = true;
    obj.receiveShadow = true;

    const label = `${obj.name ?? ''} ${(obj.material && obj.material.name) || ''}`.toLowerCase();
    let nextMaterial = null;

    if (label.includes('roof') || label.includes('tile')) {
      nextMaterial = roofMaterial;
    } else if (
      label.includes('column') ||
      label.includes('colonnade') ||
      label.includes('wall') ||
      label.includes('marble') ||
      label.includes('temple') ||
      label.includes('stoa')
    ) {
      nextMaterial = marbleMaterial;
    } else {
      nextMaterial = fallbackMaterial;
    }

    if (Array.isArray(obj.material)) {
      obj.material.forEach((material) => material?.dispose?.());
    } else {
      obj.material?.dispose?.();
    }

    obj.material = nextMaterial;
  });
}
