import * as THREE from 'three';

function createWallSegment(material, start, end, height, thickness) {
  const length = start.distanceTo(end);
  if (length <= 0.01) return null;
  const geometry = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const angle = Math.atan2(end.z - start.z, end.x - start.x);
  mesh.rotation.y = angle;
  return mesh;
}

function createParapet(material, length, height, thickness) {
  const geometry = new THREE.BoxGeometry(length, height, thickness * 0.6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  return mesh;
}

function createTower(material, position, height, radius) {
  const geometry = new THREE.CylinderGeometry(radius * 0.9, radius, height * 1.3, 14);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = height * 0.65;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  mesh.name = 'CityWallTower';
  return mesh;
}

export function createCityWalls(materials, config = {}) {
  const {
    path = [],
    towerEvery = 120,
    height = 8,
    thickness = 3
  } = config;

  const group = new THREE.Group();
  group.name = 'CityWalls';

  if (!Array.isArray(path) || path.length < 2) {
    return group;
  }

  const wallMaterial = materials.citywall ?? materials.marble;

  const towerPoints = [];

  for (let i = 0; i < path.length - 1; i += 1) {
    const start = path[i];
    const end = path[i + 1];
    const segment = createWallSegment(wallMaterial, start, end, height, thickness);
    if (segment) {
      segment.name = `CityWallSegment_${i}`;
      group.add(segment);

      const parapetHeight = 1.2;
      const parapet = createParapet(wallMaterial, segment.geometry.parameters.width, parapetHeight, thickness);
      parapet.position.set(0, height * 0.5 + parapetHeight * 0.5, 0);
      parapet.userData.isCollider = true;
      segment.add(parapet);
    }

    towerPoints.push(start.clone());
    const segmentVector = new THREE.Vector3().subVectors(end, start);
    const segmentLength = segmentVector.length();
    if (segmentLength > towerEvery) {
      const dir = segmentVector.clone().multiplyScalar(1 / segmentLength);
      for (let d = towerEvery; d < segmentLength - 10; d += towerEvery) {
        towerPoints.push(start.clone().addScaledVector(dir, d));
      }
    }
  }
  towerPoints.push(path[path.length - 1].clone());

  const radius = thickness * 1.1;
  const uniqueTowers = [];
  towerPoints.forEach((pt) => {
    if (!uniqueTowers.some((existing) => existing.distanceToSquared(pt) < 25)) {
      uniqueTowers.push(pt);
    }
  });

  uniqueTowers.forEach((point, index) => {
    const tower = createTower(wallMaterial, point, height, radius);
    tower.name = `CityWallTower_${index}`;
    group.add(tower);
  });

  return group;
}

export function createGate(materials, config = {}) {
  const {
    width = 8,
    height = 6,
    position = new THREE.Vector3(),
    facingYaw = 0
  } = config;

  const group = new THREE.Group();
  group.name = 'CityGate';
  group.position.copy(position);
  group.rotation.y = facingYaw;

  const pillarWidth = width * 0.2;
  const pillarDepth = pillarWidth * 1.6;
  const pillarHeight = height;

  const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(pillarWidth, pillarHeight, pillarDepth), materials.citywall);
  leftPillar.position.set(-width * 0.5 + pillarWidth * 0.5, pillarHeight * 0.5, 0);
  leftPillar.castShadow = true;
  leftPillar.receiveShadow = true;
  leftPillar.userData.isCollider = true;
  leftPillar.name = 'GatePillarLeft';
  group.add(leftPillar);

  const rightPillar = leftPillar.clone();
  rightPillar.position.x = width * 0.5 - pillarWidth * 0.5;
  rightPillar.name = 'GatePillarRight';
  group.add(rightPillar);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width, pillarWidth * 0.6, pillarDepth), materials.citywall);
  lintel.position.set(0, pillarHeight + (pillarWidth * 0.3), 0);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  lintel.userData.isCollider = true;
  lintel.name = 'GateLintel';
  group.add(lintel);

  const walkway = new THREE.Mesh(new THREE.BoxGeometry(width * 1.4, 0.2, pillarDepth * 1.8), materials.dust);
  walkway.position.set(0, 0.1, 0);
  walkway.receiveShadow = true;
  walkway.userData.isCollider = false;
  walkway.name = 'GateWalkway';
  group.add(walkway);

  const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, height * 0.85), new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.8 }));
  door.position.set(0, height * 0.45, pillarDepth * 0.5 + 0.01);
  door.rotation.y = Math.PI;
  door.receiveShadow = true;
  door.userData.isCollider = false;
  door.name = 'GateDoor';
  group.add(door);

  const entranceMarker = new THREE.Object3D();
  entranceMarker.name = 'NorthGateEntrance';
  entranceMarker.position.set(0, 0, pillarDepth * 0.5);
  group.add(entranceMarker);

  return group;
}
