import * as THREE from 'three';
import { snapGroupToGround } from '../physics/groundProject.js';

function ensureVector3(input) {
  if (input instanceof THREE.Vector3) return input;
  if (!input || typeof input !== 'object') return new THREE.Vector3();
  return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
}

function buildRoofGeometry(width, length, height) {
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const vertices = new Float32Array([
    // left slope
    -halfW, 0, -halfL,
    0, height, -halfL,
    -halfW, 0, halfL,

    -halfW, 0, halfL,
    0, height, -halfL,
    0, height, halfL,

    // right slope
    halfW, 0, -halfL,
    halfW, 0, halfL,
    0, height, -halfL,

    0, height, -halfL,
    halfW, 0, halfL,
    0, height, halfL,

    // base underside
    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    -halfW, 0, halfL,

    halfW, 0, -halfL,
    halfW, 0, halfL,
    -halfW, 0, halfL,

    // front pediment
    -halfW, 0, -halfL,
    halfW, 0, -halfL,
    0, height, -halfL,

    // back pediment
    -halfW, 0, halfL,
    0, height, halfL,
    halfW, 0, halfL
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTemple(materials = {}, options = {}) {
  const {
    footprint = [20, 40],
    columns = [6, 12],
    position = new THREE.Vector3(),
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'Temple';

  const marble = materials?.marble || new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.45, metalness: 0.05 });
  const roofMat = materials?.roof || new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.05 });

  const [width, length] = footprint;
  const stylobateHeight = 1.2;
  const stylobate = new THREE.Mesh(new THREE.BoxGeometry(width + 4, stylobateHeight, length + 4), marble);
  stylobate.name = 'Temple_Stylobate';
  stylobate.position.y = stylobateHeight * 0.5;
  stylobate.castShadow = true;
  stylobate.receiveShadow = true;
  stylobate.userData.isCollider = true;
  group.add(stylobate);

  const cella = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 4.8, length * 0.6), marble);
  cella.name = 'Temple_Cella';
  cella.position.y = stylobateHeight + 2.4;
  cella.castShadow = true;
  cella.receiveShadow = true;
  cella.userData.isCollider = true;
  group.add(cella);

  const [columnsX, columnsZ] = columns;
  const colCountX = Math.max(2, Math.floor(columnsX));
  const colCountZ = Math.max(2, Math.floor(columnsZ));
  const colHeight = 6.6;
  const columnGeometry = new THREE.CylinderGeometry(0.75, 0.85, colHeight, 16, 1, false);
  const columnMaterial = marble;
  const halfW = width * 0.5;
  const halfL = length * 0.5;
  const columnY = stylobateHeight + colHeight * 0.5;

  const addColumn = (x, z) => {
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(x, columnY, z);
    column.castShadow = true;
    column.receiveShadow = true;
    column.userData.isCollider = true;
    column.name = 'Temple_Column';
    group.add(column);
  };

  for (let i = 0; i < colCountX; i += 1) {
    const t = colCountX === 1 ? 0.5 : i / (colCountX - 1);
    const x = -halfW + t * width;
    addColumn(x, -halfL);
    addColumn(x, halfL);
  }

  for (let j = 1; j < colCountZ - 1; j += 1) {
    const t = j / (colCountZ - 1);
    const z = -halfL + t * length;
    addColumn(-halfW, z);
    addColumn(halfW, z);
  }

  const entablatureHeight = 1.1;
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(width + 2.4, entablatureHeight, length + 2.4), marble);
  entablature.name = 'Temple_Entablature';
  entablature.position.y = stylobateHeight + colHeight + entablatureHeight * 0.5 - 0.1;
  entablature.castShadow = true;
  entablature.receiveShadow = true;
  entablature.userData.isCollider = true;
  group.add(entablature);

  const roofHeight = 2.6;
  const roofGeometry = buildRoofGeometry(width + 2.4, length + 2.4, roofHeight);
  const roof = new THREE.Mesh(roofGeometry, roofMat);
  roof.name = 'Temple_Roof';
  roof.position.y = stylobateHeight + colHeight + entablatureHeight - 0.1;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const entrance = new THREE.Object3D();
  entrance.name = 'Temple_Entrance';
  entrance.position.set(0, stylobateHeight + 0.2, -halfL - 1.5);
  group.add(entrance);

  const resolvedPosition = ensureVector3(position);
  group.position.copy(resolvedPosition);

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export default createTemple;
