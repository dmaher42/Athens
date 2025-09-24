import * as THREE from 'three';

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

  loader.load(
    new URL('../../public/assets/textures/marble.jpg', import.meta.url).href,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      marbleMat.map = texture;
      marbleMat.color.set(0xffffff);
      marbleMat.needsUpdate = true;
    },
    undefined,
    (error) => {
      console.warn('[materials] marble.jpg missing; will use color.', error);
    }
  );

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x8b3a2f,
    roughness: 0.9,
    metalness: 0.0
  });

  loader.load(
    new URL('../../public/assets/textures/roof_tiles.jpg', import.meta.url).href,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      roofMat.map = texture;
      roofMat.color.set(0xffffff);
      roofMat.needsUpdate = true;
    },
    undefined,
    (error) => {
      console.warn('[materials] roof_tiles.jpg missing; will use color.', error);
    }
  );

  const cityWallMat = new THREE.MeshStandardMaterial({
    color: 0xb8a27c,
    roughness: 0.82,
    metalness: 0.04
  });

  loader.load(
    new URL('../../public/assets/textures/city_wall.jpg', import.meta.url).href,
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      cityWallMat.map = texture;
      cityWallMat.color.set(0xffffff);
      cityWallMat.needsUpdate = true;
    },
    undefined,
    (error) => {
      console.warn('[materials] city_wall.jpg missing; will use color.', error);
    }
  );

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
