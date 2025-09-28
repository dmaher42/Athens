import * as THREE from 'three';

const DEFAULT_FOOTPRINT = [20, 40];
const DEFAULT_COLUMNS = [6, 12];
const STYLOBATE_HEIGHT = 1.6;
const PODIUM_STEPS = 3;
const STEP_HEIGHT = 0.3;
const STEP_OVERHANG = 2.4;
const COLUMN_RADIUS = 1.1;
const COLUMN_HEIGHT = 8.5;
const ENTABLATURE_HEIGHT = 1.4;
const ROOF_HEIGHT = 3.6;
const ROOF_OVERHANG = 1.6;

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

function placeColumns(group, material, footprint, counts) {
  const [width, length] = footprint;
  const [countX, countZ] = counts;
  const marginX = Math.max(1.5, width * 0.08);
  const marginZ = Math.max(1.5, length * 0.08);
  const spacingX = countX > 1 ? (width - marginX * 2) / (countX - 1) : 0;
  const spacingZ = countZ > 1 ? (length - marginZ * 2) / (countZ - 1) : 0;
  const baseY = PODIUM_STEPS * STEP_HEIGHT + STYLOBATE_HEIGHT;
  const columnGeometry = getColumnGeometry(COLUMN_RADIUS, COLUMN_HEIGHT);

  const addColumn = (x, z) => {
    const column = new THREE.Mesh(columnGeometry, material);
    column.position.set(x, baseY, z);
    column.castShadow = true;
    column.receiveShadow = true;
    column.userData.isCollider = true;
    group.add(column);
  };

  const xs = [];
  for (let i = 0; i < countX; i += 1) {
    xs.push(-width * 0.5 + marginX + spacingX * i);
  }
  const zs = [];
  for (let i = 0; i < countZ; i += 1) {
    zs.push(-length * 0.5 + marginZ + spacingZ * i);
  }

  xs.forEach((x) => {
    addColumn(x, zs[0]);
    if (countZ > 1) addColumn(x, zs[zs.length - 1]);
  });
  zs.slice(1, -1).forEach((z) => {
    addColumn(xs[0], z);
    if (countX > 1) addColumn(xs[xs.length - 1], z);
  });
}

function createRoof(material, width, length, baseY) {
  const overW = width * 0.5 + ROOF_OVERHANG;
  const overL = length * 0.5 + ROOF_OVERHANG;
  const y = baseY + ENTABLATURE_HEIGHT;
  const positions = new Float32Array([
    -overW, y, -overL,
     overW, y, -overL,
         0, y + ROOF_HEIGHT, -overL,
    -overW, y,  overL,
     overW, y,  overL,
         0, y + ROOF_HEIGHT,  overL
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

export function createTemple(materials, config = {}) {
  const {
    footprint = DEFAULT_FOOTPRINT,
    columns = DEFAULT_COLUMNS,
    position = new THREE.Vector3()
  } = config;

  const group = new THREE.Group();
  group.name = 'Temple';
  group.position.copy(position);

  const [width, length] = footprint;
  const podiumWidth = width + STEP_OVERHANG * 2;
  const podiumLength = length + STEP_OVERHANG * 2;

  for (let i = 0; i < PODIUM_STEPS; i += 1) {
    const stepWidth = podiumWidth + (PODIUM_STEPS - 1 - i) * 1.2;
    const stepLength = podiumLength + (PODIUM_STEPS - 1 - i) * 1.2;
    const step = createBox(stepWidth, STEP_HEIGHT, stepLength, materials.marble);
    step.position.y = STEP_HEIGHT * (i + 0.5);
    step.name = `StylobateStep_${i}`;
    group.add(step);
  }

  const stylobate = createBox(width + 1.2, STYLOBATE_HEIGHT, length + 1.2, materials.marble);
  stylobate.position.y = PODIUM_STEPS * STEP_HEIGHT + STYLOBATE_HEIGHT * 0.5;
  stylobate.name = 'Stylobate';
  group.add(stylobate);

  const cella = createBox(width * 0.7, COLUMN_HEIGHT * 0.6, length * 0.6, materials.marble);
  cella.position.y = PODIUM_STEPS * STEP_HEIGHT + STYLOBATE_HEIGHT + (cella.geometry.parameters.height * 0.5);
  cella.name = 'Cella';
  group.add(cella);

  placeColumns(group, materials.marble, footprint, columns);

  const entablature = createBox(width + 2, ENTABLATURE_HEIGHT, length + 2, materials.marble);
  entablature.position.y = PODIUM_STEPS * STEP_HEIGHT + STYLOBATE_HEIGHT + COLUMN_HEIGHT + ENTABLATURE_HEIGHT * 0.5;
  entablature.name = 'Entablature';
  group.add(entablature);

  const roof = createRoof(materials.roof, width, length, entablature.position.y + ENTABLATURE_HEIGHT * 0.5);
  roof.name = 'TempleRoof';
  group.add(roof);

  return group;
}
