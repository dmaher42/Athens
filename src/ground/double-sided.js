import * as THREE from 'three';

function applyDoubleSideToMaterial(material) {
  if (!material || typeof material !== 'object') return;

  material.side = THREE.DoubleSide;
  if ('shadowSide' in material) {
    material.shadowSide = THREE.DoubleSide;
  }
  material.needsUpdate = true;
}

function ensureCustomDepthMaterial(mesh) {
  if (!mesh) return;

  if (mesh.customDepthMaterial && mesh.customDepthMaterial.isMaterial) {
    mesh.customDepthMaterial.side = THREE.DoubleSide;
    mesh.customDepthMaterial.needsUpdate = true;
    return;
  }

  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
}

function ensureCustomDistanceMaterial(mesh) {
  if (!mesh) return;

  const DistanceMaterial = THREE.MeshDistanceMaterial;
  if (typeof DistanceMaterial !== 'function') {
    return;
  }

  if (mesh.customDistanceMaterial && mesh.customDistanceMaterial.isMaterial) {
    mesh.customDistanceMaterial.side = THREE.DoubleSide;
    mesh.customDistanceMaterial.needsUpdate = true;
    return;
  }

  mesh.customDistanceMaterial = new DistanceMaterial({
    side: THREE.DoubleSide,
  });
}

export function applyDoubleSidedGroundSupport(mesh) {
  if (!mesh || !mesh.isMesh) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(applyDoubleSideToMaterial);

  ensureCustomDepthMaterial(mesh);
  ensureCustomDistanceMaterial(mesh);

  mesh.frustumCulled = false;
}
