import * as THREE from 'three';
import { snapGroupToGround } from '../physics/groundProject.js';

function ensureVector3(input) {
  if (input instanceof THREE.Vector3) return input;
  if (!input || typeof input !== 'object') return new THREE.Vector3();
  return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
}

function createHouse(materials, size = 10) {
  const houseGroup = new THREE.Group();
  houseGroup.name = 'House';

  const wallMat = materials?.citywall || new THREE.MeshStandardMaterial({ color: 0xd0c4b0, roughness: 0.8, metalness: 0.05 });
  const roofMat = materials?.roof || new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.05 });
  const dust = materials?.dust || new THREE.MeshStandardMaterial({ color: 0xb89c7a, roughness: 1.0, metalness: 0.0 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, size * 0.4, size * 0.9), dust);
  base.position.y = (size * 0.4) / 2;
  base.receiveShadow = true;
  base.name = 'House_Base';
  houseGroup.add(base);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, size * 0.8, size * 0.8), wallMat);
  walls.position.y = size * 0.4 + size * 0.4;
  walls.castShadow = true;
  walls.receiveShadow = true;
  walls.userData.isCollider = true;
  walls.name = 'House_Walls';
  houseGroup.add(walls);

  const roofHeight = size * 0.35;
  const half = (size * 0.85) / 2;
  const vertices = new Float32Array([
    -half, 0, -half,
    0, roofHeight, -half,
    -half, 0, half,

    -half, 0, half,
    0, roofHeight, -half,
    0, roofHeight, half,

    half, 0, -half,
    half, 0, half,
    0, roofHeight, -half,

    0, roofHeight, -half,
    half, 0, half,
    0, roofHeight, half,

    -half, 0, -half,
    half, 0, -half,
    -half, 0, half,

    half, 0, -half,
    half, 0, half,
    -half, 0, half,

    -half, 0, -half,
    half, 0, -half,
    0, roofHeight, -half,

    -half, 0, half,
    0, roofHeight, half,
    half, 0, half
  ]);
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  roofGeometry.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeometry, roofMat);
  roof.position.y = walls.position.y + walls.geometry.parameters.height * 0.5;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.name = 'House_Roof';
  houseGroup.add(roof);

  const courtyard = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.7, size * 0.7), dust);
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.set(0, 0.02, size * 0.6);
  courtyard.receiveShadow = true;
  courtyard.name = 'House_Courtyard';
  houseGroup.add(courtyard);

  const entrance = new THREE.Object3D();
  entrance.name = 'House_Entrance';
  entrance.position.set(0, size * 0.4, size * 0.45);
  houseGroup.add(entrance);

  return houseGroup;
}

export function createHouseBlock(materials = {}, options = {}) {
  const {
    rows = 3,
    cols = 4,
    spacing = 12,
    position = new THREE.Vector3(),
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'HouseBlock';

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const house = createHouse(materials, spacing * 0.8);
      house.position.set(
        (col - (cols - 1) / 2) * spacing,
        0,
        (row - (rows - 1) / 2) * spacing
      );
      house.name = `House_${row}_${col}`;
      group.add(house);
    }
  }

  group.position.copy(ensureVector3(position));

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export default createHouseBlock;
