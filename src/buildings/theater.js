import * as THREE from 'three';

const DEFAULT_RADIUS = 50;
const DEFAULT_STEPS = 16;
const STEP_HEIGHT = 0.45;
const STAGE_HEIGHT = 1.2;

function createHalfCylinder(radius, height, material) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 48, 1, false, Math.PI, Math.PI);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  return mesh;
}

export function createTheater(materials, config = {}) {
  const {
    radius = DEFAULT_RADIUS,
    steps = DEFAULT_STEPS,
    position = new THREE.Vector3()
  } = config;

  const group = new THREE.Group();
  group.name = 'Theater';
  group.position.copy(position);

  const seating = new THREE.Group();
  seating.name = 'TheaterCavea';
  const stepDepth = radius / (steps + 2);

  for (let i = 0; i < steps; i += 1) {
    const stepRadius = radius - i * stepDepth;
    const step = createHalfCylinder(stepRadius, STEP_HEIGHT, materials.marble);
    step.position.y = STEP_HEIGHT * (i + 0.5);
    seating.add(step);
  }
  group.add(seating);

  const orchestraRadius = radius * 0.55;
  const orchestraGeo = new THREE.CylinderGeometry(orchestraRadius, orchestraRadius, 0.3, 48, 1, false, Math.PI, Math.PI);
  const orchestra = new THREE.Mesh(orchestraGeo, materials.dust);
  orchestra.position.y = 0.15;
  orchestra.rotation.y = 0;
  orchestra.receiveShadow = true;
  orchestra.userData.isCollider = true;
  orchestra.name = 'TheaterOrchestra';
  group.add(orchestra);

  const stageBase = createHalfCylinder(orchestraRadius * 0.75, STAGE_HEIGHT, materials.marble);
  stageBase.position.y = STAGE_HEIGHT * 0.5 + 0.1;
  stageBase.position.z = orchestraRadius * 0.3;
  stageBase.name = 'TheaterStage';
  group.add(stageBase);

  const skeneWidth = orchestraRadius * 1.4;
  const skeneHeight = STAGE_HEIGHT + 5.5;
  const skeneDepth = 10;
  const skene = new THREE.Mesh(new THREE.BoxGeometry(skeneWidth, skeneHeight, skeneDepth), materials.marble);
  skene.position.set(0, skeneHeight * 0.5 + STAGE_HEIGHT, orchestraRadius + skeneDepth * 0.5 - 1);
  skene.castShadow = true;
  skene.receiveShadow = true;
  skene.userData.isCollider = true;
  skene.name = 'TheaterSkene';
  group.add(skene);

  const roofHeight = 3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(skeneWidth + 2, 0.6, skeneDepth + 2), materials.roof);
  roof.position.set(0, skene.position.y + skeneHeight * 0.5 + roofHeight * 0.5, skene.position.z);
  roof.scale.y = roofHeight / 0.6;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.isCollider = true;
  roof.name = 'TheaterRoof';
  group.add(roof);

  return group;
}
