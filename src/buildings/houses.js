import * as THREE from 'three';

const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;
const DEFAULT_SPACING = 14;

function createRoof(material, width, depth, height) {
  const overhang = 0.6;
  const halfW = width * 0.5 + overhang;
  const halfD = depth * 0.5 + overhang;
  const positions = new Float32Array([
    -halfW, 0, -halfD,
     halfW, 0, -halfD,
         0, height, -halfD,
    -halfW, 0,  halfD,
     halfW, 0,  halfD,
         0, height,  halfD
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

function createHouse(materials, width, depth) {
  const house = new THREE.Group();
  house.name = 'HouseUnit';

  const baseHeight = 3.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseHeight, depth), materials.marble);
  base.position.y = baseHeight * 0.5;
  base.castShadow = true;
  base.receiveShadow = true;
  base.userData.isCollider = true;
  base.name = 'HouseBase';
  house.add(base);

  const courtyard = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, depth * 0.6), materials.dust);
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.y = baseHeight * 0.5 + 0.02;
  courtyard.receiveShadow = true;
  courtyard.userData.isCollider = false;
  courtyard.name = 'HouseCourtyard';
  house.add(courtyard);

  const roof = createRoof(materials.roof, width, depth, 2.4);
  roof.position.y = baseHeight + 0.2;
  roof.name = 'HouseRoof';
  house.add(roof);

  return house;
}

export function createHouseBlock(materials, config = {}) {
  const {
    rows = DEFAULT_ROWS,
    cols = DEFAULT_COLS,
    spacing = DEFAULT_SPACING,
    position = new THREE.Vector3()
  } = config;

  const group = new THREE.Group();
  group.name = 'HouseBlock';
  group.position.copy(position);

  const width = spacing * 0.6;
  const depth = spacing * 0.6;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const house = createHouse(materials, width, depth);
      const offsetX = (c - (cols - 1) / 2) * spacing;
      const offsetZ = (r - (rows - 1) / 2) * spacing;
      house.position.set(offsetX, 0, offsetZ);
      house.name = `House_${r}_${c}`;
      group.add(house);
    }
  }

  return group;
}
