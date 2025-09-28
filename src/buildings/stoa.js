import * as THREE from 'three';
import { snapGroupToGround } from '../physics/groundProject.js';

function ensureVector3(input) {
  if (input instanceof THREE.Vector3) return input;
  if (!input || typeof input !== 'object') return new THREE.Vector3();
  return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
}

function buildGableRoof(width, length, height) {
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const vertices = new Float32Array([
    -halfW, 0, -halfL,
    0, height, -halfL,
    -halfW, 0, halfL,

    -halfW, 0, halfL,
    0, height, -halfL,
    0, height, halfL,

    halfW, 0, -halfL,
    halfW, 0, halfL,
    0, height, -halfL,

    0, height, -halfL,
    halfW, 0, halfL,
    0, height, halfL,

    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    0, height, -halfL,

    -halfW, 0, halfL,
    0, height, halfL,
    halfW, 0, halfL,

    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    -halfW, 0, halfL,

    halfW, 0, -halfL,
    halfW, 0, halfL,
    -halfW, 0, halfL
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createStoa(materials = {}, options = {}) {
  const {
    length = 100,
    depth = 16,
    colSpacing = 5,
    position = new THREE.Vector3(),
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'Stoa';

  const marble = materials?.marble || new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.45, metalness: 0.05 });
  const roofMat = materials?.roof || new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.05 });
  const dust = materials?.dust || new THREE.MeshStandardMaterial({ color: 0xb89c7a, roughness: 1.0, metalness: 0.0 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.6, depth + 4), dust);
  floor.name = 'Stoa_Floor';
  floor.position.y = 0.3;
  floor.receiveShadow = true;
  floor.userData.isCollider = true;
  group.add(floor);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 4.5, 1.2), marble);
  wall.name = 'Stoa_BackWall';
  wall.position.set(0, 2.4, -depth * 0.5);
  wall.castShadow = true;
  wall.receiveShadow = true;
  wall.userData.isCollider = true;
  group.add(wall);

  const beam = new THREE.Mesh(new THREE.BoxGeometry(length, 0.8, depth + 2), marble);
  beam.name = 'Stoa_Beam';
  beam.position.y = 5.6;
  beam.castShadow = true;
  beam.receiveShadow = true;
  beam.userData.isCollider = true;
  group.add(beam);

  const colCount = Math.max(2, Math.floor(length / Math.max(2, colSpacing)) + 1);
  const step = colCount > 1 ? length / (colCount - 1) : length;
  const colHeight = 5.8;
  const columnGeometry = new THREE.CylinderGeometry(0.55, 0.65, colHeight, 14);
  const columnY = colHeight * 0.5 + 0.3;
  for (let i = 0; i < colCount; i += 1) {
    const column = new THREE.Mesh(columnGeometry, marble);
    column.position.set(-length * 0.5 + i * step, columnY, depth * 0.5);
    column.castShadow = true;
    column.receiveShadow = true;
    column.userData.isCollider = true;
    column.name = `Stoa_Column_${i}`;
    group.add(column);
  }

  const roofHeight = 2.2;
  const roofGeometry = buildGableRoof(depth + 2, length, roofHeight);
  const roof = new THREE.Mesh(roofGeometry, roofMat);
  roof.name = 'Stoa_Roof';
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 5.8;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const colonnadeEntrance = new THREE.Object3D();
  colonnadeEntrance.name = 'Stoa_Entrance';
  colonnadeEntrance.position.set(0, 0.2, depth * 0.5 + 1.5);
  group.add(colonnadeEntrance);

  group.position.copy(ensureVector3(position));

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export default createStoa;
