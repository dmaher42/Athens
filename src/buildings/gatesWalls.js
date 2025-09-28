import * as THREE from 'three';
import { snapGroupToGround } from '../physics/groundProject.js';

function ensureVector3(input) {
  if (input instanceof THREE.Vector3) return input.clone();
  if (!input || typeof input !== 'object') return new THREE.Vector3();
  return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
}

function createTower(material, { position, height, radius }) {
  const geometry = new THREE.CylinderGeometry(radius * 0.9, radius, height * 1.3, 18);
  const tower = new THREE.Mesh(geometry, material);
  tower.position.copy(position);
  tower.position.y += height * 0.65;
  tower.castShadow = true;
  tower.receiveShadow = true;
  tower.userData.isCollider = true;
  tower.name = 'CityWall_Tower';
  return tower;
}

export function createCityWalls(materials = {}, options = {}) {
  const {
    path = [],
    towerEvery = 120,
    height = 8,
    thickness = 3,
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'CityWalls_Extended';

  const wallMaterial = materials?.citywall || new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.9, metalness: 0.05 });

  if (!Array.isArray(path) || path.length < 2) {
    return group;
  }

  const points = path.map((p) => ensureVector3(p));
  const towers = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const segment = end.clone().sub(start);
    const length = segment.length();
    if (length < 1e-3) continue;

    const wallGeometry = new THREE.BoxGeometry(length, height, thickness);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.name = `CityWall_Segment_${i}`;
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.isCollider = true;

    const midpoint = start.clone().addScaledVector(segment, 0.5);
    wall.position.copy(midpoint);
    wall.position.y += height * 0.5;

    const orientation = new THREE.Quaternion();
    orientation.setFromUnitVectors(new THREE.Vector3(1, 0, 0), segment.clone().normalize());
    wall.setRotationFromQuaternion(orientation);
    group.add(wall);

    if (towerEvery > 0) {
      const stepCount = Math.floor(length / towerEvery);
      for (let s = 0; s <= stepCount; s += 1) {
        const distance = Math.min(length, s * towerEvery);
        if (distance === 0 && i !== 0) continue;
        if (distance >= length && i < points.length - 2) continue;
        const position = start.clone().add(segment.clone().setLength(distance));
        towers.push(createTower(wallMaterial, { position, height, radius: thickness * 1.1 }));
      }
    }
  }

  towers.forEach((tower) => group.add(tower));

  const resolvedPosition = options.position ? ensureVector3(options.position) : new THREE.Vector3();
  group.position.copy(resolvedPosition);

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export function createGate(materials = {}, options = {}) {
  const {
    width = 10,
    height = 8,
    position = new THREE.Vector3(),
    facingYaw = 0,
    thickness = 3,
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'CityGate';

  const wallMaterial = materials?.citywall || new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.9, metalness: 0.05 });
  const roofMat = materials?.roof || new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.05 });

  const pierWidth = width * 0.25;
  const pier = new THREE.BoxGeometry(pierWidth, height, thickness);

  const leftPier = new THREE.Mesh(pier, wallMaterial);
  leftPier.position.set(-width * 0.5 + pierWidth * 0.5, height * 0.5, 0);
  leftPier.castShadow = true;
  leftPier.receiveShadow = true;
  leftPier.userData.isCollider = true;
  leftPier.name = 'CityGate_Pier_Left';
  group.add(leftPier);

  const rightPier = leftPier.clone();
  rightPier.position.x = width * 0.5 - pierWidth * 0.5;
  rightPier.name = 'CityGate_Pier_Right';
  group.add(rightPier);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width - pierWidth * 0.4, pierWidth * 0.6, thickness), wallMaterial);
  lintel.position.set(0, height - pierWidth * 0.2, 0);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  lintel.userData.isCollider = true;
  lintel.name = 'CityGate_Lintel';
  group.add(lintel);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-width * 0.55, 0);
  roofShape.lineTo(0, width * 0.2);
  roofShape.lineTo(width * 0.55, 0);
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: thickness, bevelEnabled: false });
  roofGeometry.translate(0, 0, -thickness * 0.5);
  const roof = new THREE.Mesh(roofGeometry, roofMat);
  roof.position.y = height + width * 0.05;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.name = 'CityGate_Roof';
  group.add(roof);

  const archMarker = new THREE.Object3D();
  archMarker.name = 'CityGate_Entrance';
  archMarker.position.set(0, height * 0.4, 0);
  group.add(archMarker);

  group.rotation.y = facingYaw;
  group.position.copy(ensureVector3(position));

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export default {
  createCityWalls,
  createGate
};
