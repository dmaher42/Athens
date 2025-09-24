import * as THREE from 'three';
import { makeWallPath, MAT } from '../building-kit.js';

const WALL_HEIGHT = 10;
const WALL_WIDTH = 8;
const WALL_SEGMENT_LENGTH = 12;

const RAW_WALL_POINTS = [
  [-2476.99, 1129.247],
  [-1722.297, 2088.821],
  [-319.972, 2921.491],
  [1450.923, 2979.377],
  [2690.024, 1910.71],
  [3104.227, 345.558],
  [2181.045, -792.127],
  [308.353, -1008.087],
  [-1543.277, -426.999],
  [-2476.99, 1129.247]
];

const gapStartIndex = 6;
const gapEndIndex = 7;

const segmentA = RAW_WALL_POINTS.slice(0, gapStartIndex + 1);
const segmentB = RAW_WALL_POINTS.slice(gapEndIndex);

const CITY_WALL_PATHS = [segmentA, segmentB];

const gapStart = RAW_WALL_POINTS[gapStartIndex];
const gapEnd = RAW_WALL_POINTS[gapEndIndex];
const GATE_CENTER = new THREE.Vector3(
  (gapStart[0] + gapEnd[0]) * 0.5,
  0,
  (gapStart[1] + gapEnd[1]) * 0.5
);
const GATE_ROTATION = Math.atan2(gapEnd[0] - gapStart[0], gapEnd[1] - gapStart[1]);

const TOWER_WIDTH = 18;
const TOWER_DEPTH = 16;
const TOWER_HEIGHT = 18;
const GATE_OPENING = 26;
const WALKWAY_THICKNESS = 1.6;
const PARAPET_HEIGHT = 1.4;
const ARCH_HEIGHT = 6;

function toWallVector([x, z]) {
  return new THREE.Vector3(x, WALL_HEIGHT * 0.5, z);
}

function addWallSection({ group, path, material }) {
  if (!Array.isArray(path) || path.length < 2) {
    return;
  }
  const points = path.map(toWallVector);
  const wallSection = makeWallPath(points, {
    segment: WALL_SEGMENT_LENGTH,
    height: WALL_HEIGHT,
    width: WALL_WIDTH,
    material
  });
  if (!wallSection) {
    return;
  }
  wallSection.name = 'CityWallSection';
  wallSection.traverse((child) => {
    if (child && child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  group.add(wallSection);
}

export function createCityWallPerimeter({ material } = {}) {
  const group = new THREE.Group();
  group.name = 'CityWallPerimeter';
  CITY_WALL_PATHS.forEach((segment) => addWallSection({ group, path: segment, material }));
  return group;
}

export function createCityGatehouse({ material } = {}) {
  const wallMaterial = material && material.isMaterial ? material : MAT.wall;
  const group = new THREE.Group();
  group.name = 'CityGatehouse';

  const collidableMeshes = [];

  const addBox = ({ width, height, depth, position, offsetZ = 0 }) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.position.set(position.x, position.y, position.z + offsetZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    collidableMeshes.push({ mesh, halfExtents: new THREE.Vector3(width / 2, height / 2, depth / 2) });
    return mesh;
  };

  const towerOffset = GATE_OPENING * 0.5 + TOWER_WIDTH * 0.5;
  addBox({
    width: TOWER_WIDTH,
    height: TOWER_HEIGHT,
    depth: TOWER_DEPTH,
    position: new THREE.Vector3(towerOffset, TOWER_HEIGHT * 0.5, 0)
  });
  addBox({
    width: TOWER_WIDTH,
    height: TOWER_HEIGHT,
    depth: TOWER_DEPTH,
    position: new THREE.Vector3(-towerOffset, TOWER_HEIGHT * 0.5, 0)
  });

  const deckWidth = GATE_OPENING + TOWER_WIDTH * 0.4;
  const deckDepth = WALL_WIDTH * 1.2;
  addBox({
    width: deckWidth,
    height: WALKWAY_THICKNESS,
    depth: deckDepth,
    position: new THREE.Vector3(0, WALL_HEIGHT - WALKWAY_THICKNESS * 0.5, 0)
  });

  const parapetDepth = WALL_WIDTH * 0.5;
  const parapetY = WALL_HEIGHT + PARAPET_HEIGHT * 0.5;
  addBox({
    width: deckWidth,
    height: PARAPET_HEIGHT,
    depth: parapetDepth,
    position: new THREE.Vector3(0, parapetY, 0),
    offsetZ: deckDepth * 0.25
  });
  addBox({
    width: deckWidth,
    height: PARAPET_HEIGHT,
    depth: parapetDepth,
    position: new THREE.Vector3(0, parapetY, 0),
    offsetZ: -deckDepth * 0.25
  });

  addBox({
    width: GATE_OPENING,
    height: ARCH_HEIGHT,
    depth: WALL_WIDTH * 0.9,
    position: new THREE.Vector3(0, WALL_HEIGHT + ARCH_HEIGHT * 0.5, 0)
  });

  group.position.copy(GATE_CENTER);
  group.rotation.y = GATE_ROTATION;
  group.updateMatrixWorld(true);

  const colliders = collidableMeshes.map(({ mesh, halfExtents }) => {
    const position = new THREE.Vector3();
    mesh.getWorldPosition(position);
    const quaternion = new THREE.Quaternion();
    mesh.getWorldQuaternion(quaternion);
    return { center: position, halfExtents, quaternion };
  });

  return { group, colliders };
}
