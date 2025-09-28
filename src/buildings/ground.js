import * as THREE from 'three';

function cloneMaterial(source, fallbackColor = 0xffffff) {
  if (source && typeof source.clone === 'function') {
    const material = source.clone();
    if (source.map) {
      material.map = source.map.clone();
      material.map.needsUpdate = true;
    }
    return material;
  }
  return new THREE.MeshStandardMaterial({ color: fallbackColor });
}

function setTextureRepeat(material, repeatX = 1, repeatY = 1) {
  if (material?.map) {
    material.map.repeat.set(repeatX, repeatY);
    material.map.needsUpdate = true;
  }
}

export function createGround(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Ground';

  const size = opts.size ?? 800;
  const repeat = opts.repeat ?? 64;

  const grassMaterial = cloneMaterial(materials.grass, 0x5a8f3a);
  setTextureRepeat(grassMaterial, repeat, repeat);
  const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), grassMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  group.add(groundPlane);

  const plateauRadius = opts.plateauRadius ?? 46;
  const plateauHeight = opts.plateauHeight ?? 2.4;
  const plateauMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  setTextureRepeat(plateauMaterial, plateauRadius / 2, plateauRadius / 2);
  const plateauGeometry = new THREE.CylinderGeometry(plateauRadius * 0.9, plateauRadius * 1.1, plateauHeight, 48, 1, false);
  const plateau = new THREE.Mesh(plateauGeometry, plateauMaterial);
  plateau.position.y = plateauHeight / 2;
  plateau.castShadow = false;
  plateau.receiveShadow = true;
  group.add(plateau);

  const upperTerraceMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  const upperTerrace = new THREE.Mesh(new THREE.CylinderGeometry(plateauRadius * 0.65, plateauRadius * 0.85, plateauHeight * 0.6, 48, 1, false), upperTerraceMaterial);
  upperTerrace.position.y = plateauHeight * 0.8;
  upperTerrace.castShadow = false;
  upperTerrace.receiveShadow = true;
  group.add(upperTerrace);

  const rampMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  const rampLength = opts.rampLength ?? 50;
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLength, 1.0, 12), rampMaterial);
  ramp.position.set(plateauRadius + rampLength / 2 - 6, 0.5, -4);
  ramp.receiveShadow = true;
  group.add(ramp);

  const approachLength = opts.approachLength ?? 60;
  const approach = new THREE.Mesh(new THREE.BoxGeometry(approachLength, 0.6, 10), rampMaterial);
  approach.position.set(plateauRadius + rampLength + approachLength / 2 - 12, 0.3, -8);
  approach.receiveShadow = true;
  group.add(approach);

  const crossPathDepth = opts.crossPathDepth ?? 44;
  const crossPath = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, crossPathDepth), rampMaterial);
  crossPath.position.set(plateauRadius + rampLength + approachLength - 12, 0.2, -26);
  crossPath.receiveShadow = true;
  group.add(crossPath);

  const dustFieldsMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  setTextureRepeat(dustFieldsMaterial, size / 80, size / 80);
  dustFieldsMaterial.side = THREE.DoubleSide;
  const dustFields = new THREE.Mesh(new THREE.RingGeometry(plateauRadius * 1.3, plateauRadius * 2.1, 64), dustFieldsMaterial);
  dustFields.rotation.x = -Math.PI / 2;
  dustFields.position.y = 0.05;
  dustFields.receiveShadow = true;
  group.add(dustFields);

  return group;
}
