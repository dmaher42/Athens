import * as THREE from 'three';
import { snapGroupToGround } from '../physics/groundProject.js';

function ensureVector3(input) {
  if (input instanceof THREE.Vector3) return input;
  if (!input || typeof input !== 'object') return new THREE.Vector3();
  return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
}

export function createTheater(materials = {}, options = {}) {
  const {
    radius = 50,
    steps = 16,
    position = new THREE.Vector3(),
    groundMeshes = null
  } = options;

  const group = new THREE.Group();
  group.name = 'Theater';

  const marble = materials?.marble || new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.45, metalness: 0.05 });
  const dust = materials?.dust || new THREE.MeshStandardMaterial({ color: 0xb89c7a, roughness: 1.0, metalness: 0.0 });
  const roofMat = materials?.roof || new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.05 });

  const stepHeight = 0.6;
  const stepDepth = radius / Math.max(steps, 1);
  for (let i = 0; i < steps; i += 1) {
    const inner = i * stepDepth;
    const outer = inner + stepDepth;
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64, 1, Math.PI, Math.PI), marble);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = i * stepHeight;
    ring.castShadow = true;
    ring.receiveShadow = true;
    ring.userData.isCollider = true;
    ring.name = `Theater_Step_${i}`;
    group.add(ring);
  }

  const orchestra = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.4, 48, Math.PI, Math.PI), dust);
  orchestra.rotation.x = -Math.PI / 2;
  orchestra.position.y = 0.05;
  orchestra.name = 'Theater_Orchestra';
  orchestra.receiveShadow = true;
  orchestra.userData.isCollider = true;
  group.add(orchestra);

  const stageWidth = radius * 0.6;
  const stageDepth = radius * 0.3;
  const stage = new THREE.Mesh(new THREE.BoxGeometry(stageWidth, 1.2, stageDepth), marble);
  stage.name = 'Theater_Stage';
  stage.position.set(0, steps * stepHeight * 0.5, radius * 0.35);
  stage.castShadow = true;
  stage.receiveShadow = true;
  stage.userData.isCollider = true;
  group.add(stage);

  const skene = new THREE.Mesh(new THREE.BoxGeometry(stageWidth * 1.1, steps * stepHeight * 0.8, stageDepth * 0.6), marble);
  skene.name = 'Theater_Skene';
  skene.position.set(0, stage.position.y + skene.geometry.parameters.height * 0.5 + 0.6, radius * 0.5);
  skene.castShadow = true;
  skene.receiveShadow = true;
  skene.userData.isCollider = true;
  group.add(skene);

  const roofHeight = stageDepth * 0.4;
  const roofShape = new THREE.Shape();
  const halfStage = (stageWidth * 1.15) / 2;
  roofShape.moveTo(-halfStage, 0);
  roofShape.lineTo(0, roofHeight);
  roofShape.lineTo(halfStage, 0);
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: stageDepth * 0.6, bevelEnabled: false });
  roofGeometry.translate(0, 0, -stageDepth * 0.3);
  const roof = new THREE.Mesh(roofGeometry, roofMat);
  roof.name = 'Theater_Roof';
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, skene.position.y + skene.geometry.parameters.height * 0.5 + 0.2, radius * 0.5);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const entranceLeft = new THREE.Object3D();
  entranceLeft.name = 'Theater_Entrance_Left';
  entranceLeft.position.set(-radius * 0.4, 0.2, -radius * 0.1);
  group.add(entranceLeft);

  const entranceRight = entranceLeft.clone();
  entranceRight.name = 'Theater_Entrance_Right';
  entranceRight.position.x = radius * 0.4;
  group.add(entranceRight);

  group.position.copy(ensureVector3(position));

  if (groundMeshes && groundMeshes.length) {
    snapGroupToGround(group, groundMeshes, { hover: 0.03 });
  }

  return group;
}

export default createTheater;
