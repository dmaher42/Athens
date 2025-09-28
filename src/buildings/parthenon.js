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

export function createParthenon(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Parthenon';

  const width = opts.width ?? 30;
  const depth = opts.depth ?? 70;
  const columnCountWidth = opts.columnsWidth ?? 8;
  const columnCountDepth = opts.columnsDepth ?? 17;
  const columnRadius = opts.columnRadius ?? 0.8;
  const columnHeight = opts.columnHeight ?? 10;
  const stylobateHeight = opts.stylobateHeight ?? 1.6;
  const plinthHeight = opts.plinthHeight ?? 1.2;
  const entablatureHeight = opts.entablatureHeight ?? 2.0;
  const roofHeight = opts.roofHeight ?? 4.0;
  const roofOverhang = opts.roofOverhang ?? 4.0;

  if (opts.position instanceof THREE.Vector3) {
    group.position.copy(opts.position);
  } else if (opts.position && typeof opts.position === 'object') {
    group.position.set(opts.position.x ?? 0, opts.position.y ?? 0, opts.position.z ?? 0);
  }

  const dustMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  const plinthGeometry = new THREE.BoxGeometry(width + 12, plinthHeight, depth + 12);
  setTextureRepeat(dustMaterial, (width + 12) / 6, (depth + 12) / 6);
  const plinth = new THREE.Mesh(plinthGeometry, dustMaterial);
  plinth.position.y = plinthHeight / 2;
  plinth.castShadow = false;
  plinth.receiveShadow = true;
  group.add(plinth);

  const marbleMaterial = cloneMaterial(materials.marble, 0xdedede);
  setTextureRepeat(marbleMaterial, width / 4, depth / 4);
  const stylobateGeometry = new THREE.BoxGeometry(width + 6, stylobateHeight, depth + 6);
  const stylobate = new THREE.Mesh(stylobateGeometry, marbleMaterial);
  stylobate.position.y = plinthHeight + stylobateHeight / 2;
  stylobate.castShadow = false;
  stylobate.receiveShadow = true;
  group.add(stylobate);

  const columnMaterial = cloneMaterial(materials.marble, 0xdedede);
  setTextureRepeat(columnMaterial, 1, columnHeight / 2);

  const innerWidth = width;
  const innerDepth = depth;
  const columnBaseY = plinthHeight + stylobateHeight;

  const addColumn = (x, z) => {
    const columnGeometry = new THREE.CylinderGeometry(columnRadius * 0.9, columnRadius, columnHeight, 12, 1, false);
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(x, columnBaseY + columnHeight / 2, z);
    column.castShadow = true;
    column.receiveShadow = true;
    group.add(column);
  };

  const halfWidth = innerWidth / 2;
  const halfDepth = innerDepth / 2;
  const widthSpacing = innerWidth / Math.max(columnCountWidth - 1, 1);
  const depthSpacing = innerDepth / Math.max(columnCountDepth - 1, 1);

  for (let i = 0; i < columnCountWidth; i += 1) {
    const x = -halfWidth + i * widthSpacing;
    addColumn(x, -halfDepth);
    addColumn(x, halfDepth);
  }

  for (let j = 1; j < columnCountDepth - 1; j += 1) {
    const z = -halfDepth + j * depthSpacing;
    addColumn(-halfWidth, z);
    addColumn(halfWidth, z);
  }

  const entablatureMaterial = cloneMaterial(materials.marble, 0xdedede);
  setTextureRepeat(entablatureMaterial, innerWidth / 4, innerDepth / 4);
  const entablatureGeometry = new THREE.BoxGeometry(innerWidth + 4, entablatureHeight, innerDepth + 4);
  const entablature = new THREE.Mesh(entablatureGeometry, entablatureMaterial);
  entablature.position.y = columnBaseY + columnHeight + entablatureHeight / 2;
  entablature.castShadow = true;
  entablature.receiveShadow = true;
  group.add(entablature);

  const roofMaterial = cloneMaterial(materials.roof, 0x8a3a2a);
  setTextureRepeat(roofMaterial, (innerDepth + roofOverhang * 2) / 6, (innerWidth + roofOverhang * 2) / 4);
  const roofShape = new THREE.Shape();
  const roofWidth = innerWidth + roofOverhang * 2;
  const roofDepth = innerDepth + roofOverhang * 2;
  roofShape.moveTo(-roofWidth / 2, 0);
  roofShape.lineTo(roofWidth / 2, 0);
  roofShape.lineTo(0, roofHeight);
  roofShape.lineTo(-roofWidth / 2, 0);
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, {
    depth: roofDepth,
    bevelEnabled: false,
    steps: 1
  });
  roofGeometry.translate(0, columnBaseY + columnHeight + entablatureHeight, -roofDepth / 2);
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const cellaMaterial = cloneMaterial(materials.marble, 0xdedede);
  const cellaWidth = Math.max(4, innerWidth - columnRadius * 4);
  const cellaDepth = Math.max(4, innerDepth - columnRadius * 8);
  const cellaHeight = Math.max(4, columnHeight * 0.75);
  setTextureRepeat(cellaMaterial, cellaWidth / 6, cellaDepth / 6);
  const cella = new THREE.Mesh(new THREE.BoxGeometry(cellaWidth, cellaHeight, cellaDepth), cellaMaterial);
  cella.position.y = columnBaseY + cellaHeight / 2;
  cella.castShadow = true;
  cella.receiveShadow = true;
  group.add(cella);

  return group;
}
