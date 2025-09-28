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

function buildStoa(materials, options) {
  const length = options.length ?? 40;
  const depth = options.depth ?? 8;
  const height = options.height ?? 8;
  const columnCount = options.columns ?? 10;
  const openSide = options.openSide === 'north' ? 'north' : 'south';

  const group = new THREE.Group();
  group.name = options.name ?? 'Stoa';

  const floorMaterial = cloneMaterial(materials.marble, 0xdedede);
  setTextureRepeat(floorMaterial, length / 4, depth / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.4, depth), floorMaterial);
  floor.position.y = 0.2;
  floor.receiveShadow = true;
  group.add(floor);

  const roofMaterial = cloneMaterial(materials.roof, 0x8a3a2a);
  setTextureRepeat(roofMaterial, depth / 2, length / 4);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1.5, 1.2, depth + 2.4), roofMaterial);
  roof.position.y = height + 0.6;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const wallMaterial = cloneMaterial(materials.citywall ?? materials.marble, 0x8d8d8d);
  setTextureRepeat(wallMaterial, length / 4, height / 2);
  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(length, height, 0.6), wallMaterial);
  rearWall.position.y = height / 2 + 0.4;
  const openSign = openSide === 'south' ? 1 : -1;
  rearWall.position.z = -openSign * (depth / 2 - 0.3);
  rearWall.castShadow = true;
  rearWall.receiveShadow = true;
  group.add(rearWall);

  const columnMaterial = cloneMaterial(materials.marble, 0xdedede);
  setTextureRepeat(columnMaterial, 1, height / 2);
  const halfLength = length / 2;
  const start = -halfLength;
  const spacing = length / Math.max(columnCount - 1, 1);
  const columnDepthOffset = openSign * (depth / 2 - 0.7);

  for (let i = 0; i < columnCount; i += 1) {
    const columnGeometry = new THREE.CylinderGeometry(0.5, 0.6, height, 10, 1, false);
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(start + spacing * i, height / 2 + 0.4, columnDepthOffset);
    column.castShadow = true;
    column.receiveShadow = true;
    group.add(column);
  }

  const architrave = new THREE.Mesh(new THREE.BoxGeometry(length + 0.8, 1.0, 1.2), columnMaterial);
  architrave.position.set(0, height + 0.9, columnDepthOffset);
  architrave.castShadow = true;
  architrave.receiveShadow = true;
  group.add(architrave);

  return group;
}

export function createAgora(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Agora';

  if (opts.position instanceof THREE.Vector3) {
    group.position.copy(opts.position);
  } else if (opts.position && typeof opts.position === 'object') {
    group.position.set(opts.position.x ?? 0, opts.position.y ?? 0, opts.position.z ?? 0);
  }

  const plazaWidth = opts.plazaWidth ?? 80;
  const plazaDepth = opts.plazaDepth ?? 60;
  const plazaHeight = opts.plazaHeight ?? 0.5;

  const plazaMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  setTextureRepeat(plazaMaterial, plazaWidth / 6, plazaDepth / 6);
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaWidth, plazaHeight, plazaDepth), plazaMaterial);
  plaza.position.y = plazaHeight / 2;
  plaza.receiveShadow = true;
  group.add(plaza);

  const stoaDepth = opts.stoaDepth ?? 10;
  const stoaHeight = opts.stoaHeight ?? 9;
  const stoaLength = plazaWidth - 6;

  const northStoa = buildStoa(materials, {
    name: 'NorthStoa',
    length: stoaLength,
    depth: stoaDepth,
    height: stoaHeight,
    columns: Math.max(8, Math.round(stoaLength / 6)),
    openSide: 'south'
  });
  northStoa.position.set(0, plazaHeight, -plazaDepth / 2 + stoaDepth / 2 + 1);
  group.add(northStoa);

  const southStoa = buildStoa(materials, {
    name: 'SouthStoa',
    length: stoaLength,
    depth: stoaDepth,
    height: stoaHeight,
    columns: Math.max(8, Math.round(stoaLength / 6)),
    openSide: 'north'
  });
  southStoa.position.set(0, plazaHeight, plazaDepth / 2 - stoaDepth / 2 - 1);
  group.add(southStoa);

  const eastStoa = buildStoa(materials, {
    name: 'EastStoa',
    length: plazaDepth - stoaDepth * 1.5,
    depth: stoaDepth * 0.85,
    height: stoaHeight - 2,
    columns: Math.max(6, Math.round((plazaDepth - stoaDepth * 1.5) / 5)),
    openSide: 'north'
  });
  eastStoa.rotation.y = Math.PI / 2;
  eastStoa.position.set(plazaWidth / 2 - stoaDepth / 2 - 1.5, plazaHeight, 0);
  group.add(eastStoa);

  const westStoa = buildStoa(materials, {
    name: 'WestStoa',
    length: plazaDepth - stoaDepth * 1.5,
    depth: stoaDepth * 0.85,
    height: stoaHeight - 2,
    columns: Math.max(6, Math.round((plazaDepth - stoaDepth * 1.5) / 5)),
    openSide: 'north'
  });
  westStoa.rotation.y = -Math.PI / 2;
  westStoa.position.set(-plazaWidth / 2 + stoaDepth / 2 + 1.5, plazaHeight, 0);
  group.add(westStoa);

  const centralMonumentMaterial = cloneMaterial(materials.marble, 0xdedede);
  const monumentBase = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1.5, 24), centralMonumentMaterial);
  monumentBase.position.set(0, plazaHeight + 0.75, 0);
  monumentBase.castShadow = true;
  monumentBase.receiveShadow = true;
  group.add(monumentBase);

  const monumentColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 5, 16, 1, false), centralMonumentMaterial);
  monumentColumn.position.set(0, plazaHeight + 0.75 + 2.5, 0);
  monumentColumn.castShadow = true;
  monumentColumn.receiveShadow = true;
  group.add(monumentColumn);

  return group;
}
