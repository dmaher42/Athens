import * as THREE from 'three';

export function createPort(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Port';

  // CITYPLAN_START
  const position = opts.position instanceof THREE.Vector3
    ? opts.position.clone()
    : new THREE.Vector3().copy(opts.position || new THREE.Vector3());
  group.position.copy(position);

  const stoneMaterial = materials?.marble || materials?.citywall || new THREE.MeshStandardMaterial({ color: 0xc8c0b4 });

  const quayLength = opts.quayLength ?? 80;
  const quayWidth = opts.quayWidth ?? 14;
  const quayHeight = opts.quayHeight ?? 4;

  const quayGeometry = new THREE.BoxGeometry(quayLength, quayHeight, quayWidth);
  const quay = new THREE.Mesh(quayGeometry, stoneMaterial);
  quay.castShadow = true;
  quay.receiveShadow = true;
  quay.name = 'Port_Quay_A';
  quay.position.y = quayHeight / 2;
  group.add(quay);

  const stepsGeometry = new THREE.BoxGeometry(quayLength * 0.6, quayHeight * 0.4, quayWidth * 0.4);
  const steps = new THREE.Mesh(stepsGeometry, stoneMaterial);
  steps.castShadow = true;
  steps.receiveShadow = true;
  steps.position.set(0, quayHeight * 0.3, -quayWidth * 0.35);
  group.add(steps);

  const bollardGeometry = new THREE.CylinderGeometry(quayWidth * 0.05, quayWidth * 0.05, quayHeight * 0.4, 12);
  const bollardCount = Math.max(4, Math.floor(opts.bollardCount ?? 6));
  const bollardSpacing = quayLength / (bollardCount + 1);
  for (let i = 0; i < bollardCount; i += 1) {
    const bollard = new THREE.Mesh(bollardGeometry, stoneMaterial);
    bollard.castShadow = true;
    bollard.receiveShadow = true;
    bollard.position.set(-quayLength / 2 + bollardSpacing * (i + 1), quayHeight * 0.75, -quayWidth * 0.5);
    group.add(bollard);
  }

  // CITYPLAN_END
  return group;
}

export default createPort;
