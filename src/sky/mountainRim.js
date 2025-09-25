import * as THREE from 'three';

function createPeakProfile(radialSegments, noise) {
  const peaks = new Float32Array(radialSegments + 1);
  for (let i = 0; i < radialSegments; i += 1) {
    const t = i / radialSegments;
    const sinComponent = Math.sin(t * Math.PI * 4.0) * 0.35;
    const cosComponent = Math.cos(t * Math.PI * 2.0) * 0.25;
    const rand = Math.sin((t + 0.137) * 17.0) * 0.5 + Math.cos((t + 0.61) * 9.0) * 0.5;
    peaks[i] = (sinComponent + cosComponent + rand * 0.5) * noise;
  }
  peaks[radialSegments] = peaks[0];
  return peaks;
}

export function createMountainRim({
  radius = 900,
  height = 70,
  radialSegments = 128,
  noise = 0.3,
  color = 0x0e1b2b
} = {}) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.98, height, radialSegments, 1, true);
  geometry.translate(0, height / 2, 0);

  const positionAttr = geometry.getAttribute('position');
  const positions = positionAttr.array;
  const peaks = createPeakProfile(radialSegments, noise * height);
  const scaleNoise = noise * 0.12;

  for (let i = 0; i < positionAttr.count; i += 1) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];

    const angle = Math.atan2(z, x);
    let unit = angle / (Math.PI * 2);
    if (unit < 0) unit += 1;
    const seg = unit * radialSegments;
    const segIndex = Math.floor(seg);
    const nextIndex = (segIndex + 1) % radialSegments;
    const interp = seg - segIndex;
    const peakOffset = peaks[segIndex] * (1 - interp) + peaks[nextIndex] * interp;

    const normalizedHeight = Math.min(Math.max(y / height, 0), 1);
    const profile = Math.pow(normalizedHeight, 1.4);

    positions[idx + 1] = y + peakOffset * profile;
    const radialScale = 1 + profile * scaleNoise;
    positions[idx] = x * radialScale;
    positions[idx + 2] = z * radialScale;
  }

  positionAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({ color, side: THREE.FrontSide, fog: true });
  material.depthWrite = false;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'MountainRim';
  mesh.renderOrder = 1;
  mesh.position.y = 0.05;
  mesh.frustumCulled = false;

  return mesh;
}
