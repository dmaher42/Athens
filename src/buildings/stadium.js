import * as THREE from 'three';

export function createStadium(materials = {}, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Stadium';

  // CITYPLAN_START
  const position = opts.position instanceof THREE.Vector3
    ? opts.position.clone()
    : new THREE.Vector3().copy(opts.position || new THREE.Vector3());
  group.position.copy(position);

  const trackMaterial = materials?.dust?.clone?.()
    ? materials.dust.clone()
    : (materials?.dust || materials?.marble || new THREE.MeshStandardMaterial({ color: 0xb5895a }));
  const stoneMaterial = materials?.marble || materials?.citywall || new THREE.MeshStandardMaterial({ color: 0xd0c8b0 });

  const length = opts.length ?? 140;
  const width = opts.width ?? 40;
  const trackWidth = opts.trackWidth ?? 8;
  const tiers = Math.max(2, Math.floor(opts.tiers ?? 4));
  const tierHeight = opts.tierHeight ?? 1.2;
  const tierDepth = opts.tierDepth ?? 4;

  const outerRadius = width / 2;
  const innerRadius = Math.max(outerRadius - trackWidth, outerRadius * 0.4);
  const scaleX = length / width;

  const trackGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 48, 1);
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.scale.set(scaleX, 1, 1);
  track.receiveShadow = true;
  group.add(track);

  const fieldGeometry = new THREE.PlaneGeometry(innerRadius * 2, width * 0.9, 1, 1);
  const field = new THREE.Mesh(fieldGeometry, trackMaterial);
  field.rotation.x = -Math.PI / 2;
  field.scale.set(scaleX, 1, 1);
  field.receiveShadow = true;
  field.position.y = -0.02;
  group.add(field);

  for (let i = 0; i < tiers; i += 1) {
    const tierInner = outerRadius + i * tierDepth;
    const tierOuter = tierInner + tierDepth;
    const tierGeometry = new THREE.RingGeometry(tierInner, tierOuter, 48, 1);
    const tier = new THREE.Mesh(tierGeometry, stoneMaterial);
    tier.rotation.x = -Math.PI / 2;
    tier.scale.set(scaleX, 1, 1);
    tier.position.y = tierHeight * (i + 1);
    tier.castShadow = true;
    tier.receiveShadow = true;
    tier.name = `Stadium_Tier_${i + 1}`;
    group.add(tier);
  }

  const entryGeometry = new THREE.BoxGeometry(trackWidth, tierHeight * tiers, trackWidth * 0.6);
  const entryA = new THREE.Mesh(entryGeometry, stoneMaterial);
  entryA.castShadow = true;
  entryA.receiveShadow = true;
  entryA.position.set(0, (tierHeight * tiers) / 2, -innerRadius * scaleX * 0.8);
  group.add(entryA);

  const entryB = entryA.clone();
  entryB.position.z *= -1;
  group.add(entryB);

  // CITYPLAN_END
  return group;
}

export default createStadium;
