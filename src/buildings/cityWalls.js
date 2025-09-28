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

function ensureVector3(value) {
  if (value instanceof THREE.Vector3) {
    return value.clone();
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  if (value && typeof value === 'object') {
    return new THREE.Vector3(value.x ?? 0, value.y ?? 0, value.z ?? 0);
  }
  return new THREE.Vector3();
}

export function createCityWalls(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'CityWalls';

  const rawPath = Array.isArray(opts.path) && opts.path.length >= 2
    ? opts.path
    : [
        new THREE.Vector3(-200, 0, -200),
        new THREE.Vector3(200, 0, -200),
        new THREE.Vector3(200, 0, 200),
        new THREE.Vector3(-200, 0, 200),
        new THREE.Vector3(-200, 0, -200)
      ];

  const path = rawPath.map(ensureVector3);
  const wallHeight = opts.height ?? 12;
  const wallThickness = opts.thickness ?? 6;
  const towerInterval = Math.max(40, opts.towerInterval ?? 120);

  const wallMaterialBase = materials.citywall ?? materials.marble;
  const towerMaterial = cloneMaterial(wallMaterialBase, 0x8d8d8d);

  const towerGeometry = new THREE.CylinderGeometry(wallThickness * 0.65, wallThickness * 0.75, wallHeight * 1.35, 18, 1, false);
  const towerCapGeometry = new THREE.ConeGeometry(wallThickness * 0.85, wallHeight * 0.35, 18, 1, false);

  const towersAdded = new Set();
  const addTower = (position) => {
    const key = `${Math.round(position.x)}_${Math.round(position.z)}`;
    if (towersAdded.has(key)) {
      return;
    }
    towersAdded.add(key);

    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.copy(position);
    tower.position.y += wallHeight * 0.675;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    const capMaterial = cloneMaterial(wallMaterialBase, 0x8d8d8d);
    const cap = new THREE.Mesh(towerCapGeometry, capMaterial);
    cap.position.copy(position);
    cap.position.y += wallHeight * 1.1;
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  };

  for (let i = 0; i < path.length - 1; i += 1) {
    const start = path[i];
    const end = path[i + 1];
    const delta = new THREE.Vector3().subVectors(end, start);
    const length = delta.length();
    if (length < 0.01) {
      continue;
    }

    const wallMaterial = cloneMaterial(wallMaterialBase, 0x8d8d8d);
    setTextureRepeat(wallMaterial, length / 6, wallHeight / 2);
    const wallGeometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);
    const segment = new THREE.Mesh(wallGeometry, wallMaterial);
    segment.position.copy(start).add(end).multiplyScalar(0.5);
    segment.position.y += wallHeight / 2;
    segment.rotation.y = Math.atan2(delta.z, delta.x);
    segment.castShadow = true;
    segment.receiveShadow = true;
    group.add(segment);

    addTower(start);

    const direction = delta.clone().normalize();
    const steps = Math.floor(length / towerInterval);
    for (let step = 1; step < steps; step += 1) {
      const point = start.clone().add(direction.clone().multiplyScalar(step * towerInterval));
      addTower(point);
    }
  }

  const lastPoint = path[path.length - 1];
  if (lastPoint) {
    addTower(lastPoint);
  }

  return group;
}
