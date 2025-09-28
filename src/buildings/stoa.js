import * as THREE from 'three';

const DEFAULT_LENGTH = 90;
const DEFAULT_DEPTH = 16;
const DEFAULT_SPACING = 6;
const BASE_HEIGHT = 0.6;
const COLUMN_RADIUS = 0.9;
const COLUMN_HEIGHT = 7.5;
const ROOF_HEIGHT = 2.8;

const columnGeometryCache = new Map();

function getColumnGeometry(radius, height) {
  const key = `${radius}:${height}`;
  if (!columnGeometryCache.has(key)) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 12, 1, false);
    geometry.translate(0, height * 0.5, 0);
    columnGeometryCache.set(key, geometry);
  }
  return columnGeometryCache.get(key);
}

function createBox(width, height, depth, material) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  return mesh;
}

function createRoof(material, length, depth, baseY) {
  const overhang = 1.4;
  const halfLength = length * 0.5 + overhang;
  const halfDepth = depth * 0.5 + overhang;
  const ridge = baseY + COLUMN_HEIGHT + ROOF_HEIGHT;
  const eaveY = baseY + COLUMN_HEIGHT - 0.2;

  const positions = new Float32Array([
    -halfLength, eaveY, -halfDepth,
     halfLength, eaveY, -halfDepth,
         0, ridge, -halfDepth,
    -halfLength, eaveY,  halfDepth,
     halfLength, eaveY,  halfDepth,
         0, ridge,  halfDepth
  ]);
  const indices = [0, 1, 2, 3, 5, 4, 0, 3, 5, 0, 5, 2, 1, 4, 5, 1, 5, 2];
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.5, 0,
    0, 1,
    1, 1,
    0.5, 1
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  return mesh;
}

export function createStoa(materials, config = {}) {
  const {
    length = DEFAULT_LENGTH,
    depth = DEFAULT_DEPTH,
    colSpacing = DEFAULT_SPACING,
    position = new THREE.Vector3()
  } = config;

  const group = new THREE.Group();
  group.name = 'Stoa';
  group.position.copy(position);

  const base = createBox(length, BASE_HEIGHT, depth, materials.marble);
  base.position.y = BASE_HEIGHT * 0.5;
  base.name = 'StoaBase';
  group.add(base);

  const backWall = createBox(length - 2, COLUMN_HEIGHT * 0.8, 2.2, materials.marble);
  backWall.position.set(0, BASE_HEIGHT + backWall.geometry.parameters.height * 0.5, depth * 0.5 - 1.1);
  backWall.name = 'StoaBackWall';
  group.add(backWall);

  const columnGeometry = getColumnGeometry(COLUMN_RADIUS, COLUMN_HEIGHT);
  const count = Math.max(2, Math.floor(length / colSpacing));
  const usableLength = length - 4;
  const step = usableLength / (count - 1);

  for (let i = 0; i < count; i += 1) {
    const x = -usableLength * 0.5 + step * i;
    const column = new THREE.Mesh(columnGeometry, materials.marble);
    column.position.set(x, BASE_HEIGHT, -depth * 0.5 + COLUMN_RADIUS + 0.4);
    column.castShadow = true;
    column.receiveShadow = true;
    column.userData.isCollider = true;
    column.name = `StoaColumn_${i}`;
    group.add(column);
  }

  const architrave = createBox(length, 0.8, depth, materials.marble);
  architrave.position.y = BASE_HEIGHT + COLUMN_HEIGHT + 0.4;
  architrave.name = 'StoaArchitrave';
  group.add(architrave);

  const roof = createRoof(materials.roof, length, depth, BASE_HEIGHT);
  roof.name = 'StoaRoof';
  group.add(roof);

  return group;
}
