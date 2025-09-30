import * as THREE from 'three';

export function createTholos(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Tholos';

  // CITYPLAN_START
  const position = opts.position instanceof THREE.Vector3
    ? opts.position.clone()
    : new THREE.Vector3().copy(opts.position || new THREE.Vector3());
  group.position.copy(position);

  const stoneMaterial = materials?.marble || materials?.citywall || new THREE.MeshStandardMaterial({ color: 0xd8d0c0 });
  const roofMaterial = materials?.roof || stoneMaterial;

  const radius = opts.radius ?? 6;
  const columnHeight = opts.columnHeight ?? 6;
  const columnCount = opts.columnCount ?? 12;
  const baseHeight = opts.baseHeight ?? 0.6;

  const baseGeometry = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, baseHeight, 32);
  const base = new THREE.Mesh(baseGeometry, stoneMaterial);
  base.castShadow = true;
  base.receiveShadow = true;
  base.position.y = baseHeight / 2;
  group.add(base);

  const columnGeometry = new THREE.CylinderGeometry(radius * 0.12, radius * 0.16, columnHeight, 16);
  const columnGroup = new THREE.Group();
  columnGroup.name = 'Tholos_Columns';
  const columnY = baseHeight + columnHeight / 2;

  for (let i = 0; i < columnCount; i += 1) {
    const theta = (i / columnCount) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const column = new THREE.Mesh(columnGeometry, stoneMaterial);
    column.castShadow = true;
    column.receiveShadow = true;
    column.position.set(x, columnY, z);
    columnGroup.add(column);
  }
  group.add(columnGroup);

  const architraveHeight = opts.architraveHeight ?? 0.5;
  const architraveGeometry = new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, architraveHeight, 32);
  const architrave = new THREE.Mesh(architraveGeometry, stoneMaterial);
  architrave.castShadow = true;
  architrave.receiveShadow = true;
  architrave.position.y = baseHeight + columnHeight + architraveHeight / 2;
  group.add(architrave);

  const roofHeight = opts.roofHeight ?? columnHeight * 0.45;
  const roofGeometry = new THREE.ConeGeometry(radius * 0.9, roofHeight, 24);
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.position.y = architrave.position.y + architraveHeight / 2 + roofHeight / 2;
  group.add(roof);

  const capGeometry = new THREE.SphereGeometry(radius * 0.2, 16, 12);
  const cap = new THREE.Mesh(capGeometry, stoneMaterial);
  cap.castShadow = true;
  cap.receiveShadow = true;
  cap.position.y = roof.position.y + roofHeight / 2 - radius * 0.2;
  group.add(cap);

  // CITYPLAN_END
  return group;
}

export default createTholos;
