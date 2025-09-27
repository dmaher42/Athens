import * as THREE from 'three';

const TRUNK_COLOR = new THREE.Color('#8b5a2b');
const LEAF_COLOR = new THREE.Color('#4f7c46');

function createMaterials() {
  return {
    trunk: new THREE.MeshStandardMaterial({
      color: TRUNK_COLOR.clone(),
      roughness: 0.9,
      metalness: 0
    }),
    leaves: new THREE.MeshStandardMaterial({
      color: LEAF_COLOR.clone(),
      roughness: 0.85,
      metalness: 0
    })
  };
}

function enableShadows(object) {
  object.castShadow = true;
  object.receiveShadow = true;
}

function createTrunk({ height, radiusTop, radiusBottom, radialSegments, material }) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'trunk';
  mesh.position.y = height / 2;
  enableShadows(mesh);
  return mesh;
}

function createSphereLeaves({
  radius,
  widthSegments,
  heightSegments,
  trunkHeight,
  squashY = 1,
  material
}) {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'leaves';
  mesh.scale.y = squashY;
  mesh.position.y = trunkHeight + radius * squashY;
  enableShadows(mesh);
  return mesh;
}

function createConeLeaves({ radius, height, radialSegments, trunkHeight, material }) {
  const geometry = new THREE.ConeGeometry(radius, height, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'leaves';
  mesh.position.y = trunkHeight + height / 2;
  enableShadows(mesh);
  return mesh;
}

function createPlaneLeaves({ width, height, trunkHeight, material }) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'leaves';
  mesh.position.y = trunkHeight + height / 2;
  mesh.material.side = THREE.DoubleSide;
  enableShadows(mesh);
  return mesh;
}

function createCrossPlaneLeaves({ width, height, trunkHeight, material }) {
  const group = new THREE.Group();
  group.name = 'leaves';

  const primary = createPlaneLeaves({ width, height, trunkHeight, material });
  primary.rotation.y = Math.PI / 4;
  group.add(primary);

  const secondary = primary.clone();
  secondary.rotation.y = Math.PI / 4 + Math.PI / 2;
  group.add(secondary);

  return group;
}

function assembleTree(parts, name) {
  const group = new THREE.Group();
  group.name = name;
  parts.filter(Boolean).forEach((part) => group.add(part));
  return group;
}

export function createProceduralOlive(detail = 'high') {
  const { trunk, leaves } = createMaterials();
  const isFar = detail === 'far';
  const trunkHeight = isFar ? 1.4 : 1.6;
  const trunkMesh = createTrunk({
    height: trunkHeight,
    radiusTop: 0.18,
    radiusBottom: 0.28,
    radialSegments: detail === 'high' ? 10 : detail === 'mid' ? 8 : 6,
    material: trunk
  });

  let leavesMesh;
  if (isFar) {
    leaves.opacity = 0.95;
    leaves.transparent = false;
    leavesMesh = createCrossPlaneLeaves({
      width: 2.6,
      height: 2.2,
      trunkHeight,
      material: leaves
    });
  } else {
    leavesMesh = createSphereLeaves({
      radius: detail === 'high' ? 1.2 : 1.1,
      widthSegments: detail === 'high' ? 12 : 8,
      heightSegments: detail === 'high' ? 10 : 8,
      trunkHeight,
      squashY: 0.75,
      material: leaves
    });
  }

  return assembleTree([trunkMesh, leavesMesh], `olive-procedural-${detail}`);
}

export function createProceduralCypress(detail = 'high') {
  const { trunk, leaves } = createMaterials();
  const isFar = detail === 'far';
  const trunkHeight = isFar ? 2.1 : 2.4;
  const trunkMesh = createTrunk({
    height: trunkHeight,
    radiusTop: 0.12,
    radiusBottom: 0.22,
    radialSegments: detail === 'high' ? 10 : detail === 'mid' ? 8 : 6,
    material: trunk
  });

  let leavesMesh;
  if (isFar) {
    leavesMesh = createPlaneLeaves({
      width: 1.2,
      height: 3.2,
      trunkHeight,
      material: leaves
    });
  } else {
    leavesMesh = createConeLeaves({
      radius: detail === 'high' ? 0.9 : 0.8,
      height: detail === 'high' ? 3.2 : 3.0,
      radialSegments: detail === 'high' ? 12 : 8,
      trunkHeight,
      material: leaves
    });
  }

  if (!isFar) {
    leavesMesh.position.y -= 0.2;
  }

  return assembleTree([trunkMesh, leavesMesh], `cypress-procedural-${detail}`);
}

export function createProceduralPlane(detail = 'high') {
  const { trunk, leaves } = createMaterials();
  const isFar = detail === 'far';
  const trunkHeight = isFar ? 1.8 : 2.0;
  const trunkMesh = createTrunk({
    height: trunkHeight,
    radiusTop: 0.22,
    radiusBottom: 0.36,
    radialSegments: detail === 'high' ? 12 : detail === 'mid' ? 8 : 6,
    material: trunk
  });

  let leavesMesh;
  if (isFar) {
    leaves.opacity = 0.9;
    leaves.transparent = false;
    leavesMesh = createPlaneLeaves({
      width: 3.4,
      height: 2.6,
      trunkHeight,
      material: leaves
    });
    leavesMesh.rotation.y = Math.PI / 4;
  } else {
    leavesMesh = createSphereLeaves({
      radius: detail === 'high' ? 1.8 : 1.6,
      widthSegments: detail === 'high' ? 14 : 10,
      heightSegments: detail === 'high' ? 12 : 8,
      trunkHeight,
      squashY: 0.65,
      material: leaves
    });
    leavesMesh.scale.x = 1.2;
    leavesMesh.scale.z = 1.3;
  }

  return assembleTree([trunkMesh, leavesMesh], `plane-procedural-${detail}`);
}

export function createProceduralTree(name, detail = 'high') {
  switch (name) {
    case 'olive':
      return createProceduralOlive(detail);
    case 'cypress':
      return createProceduralCypress(detail);
    case 'plane':
      return createProceduralPlane(detail);
    default: {
      const group = assembleTree([], `${name}-procedural-${detail}`);
      return group;
    }
  }
}
