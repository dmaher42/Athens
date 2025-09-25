/**
 * Generates a low-poly mountain rim mesh that acts as a distant horizon silhouette.
 * - Tweak radius/height/noise/color through the createMountainRim options.
 * - Disable the rim by switching the HORIZON_ENABLE flag in the scene bootstrap.
 * - Designed to sit behind gameplay objects but in front of the sky for cheap depth layering.
 */
import THREE from '../three.js';

export function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMountainRim({
  radius = 900,
  height = 60,
  radialSegments = 128,
  noise = 0.35,
  seed = 1337,
  color = 0x0e1b2b
} = {}) {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    Math.max(3, Math.floor(radialSegments)),
    1,
    true
  );
  const rimGeometry = geometry.toNonIndexed();
  geometry.dispose();

  const positionAttr = rimGeometry.getAttribute('position');
  const positionArray = positionAttr.array;
  const vertex = new THREE.Vector3();

  const random = createSeededRandom(seed);
  const segmentCount = Math.max(3, Math.floor(radialSegments));
  const baseProfile = new Float32Array(segmentCount);
  const radiusProfileBase = new Float32Array(segmentCount);
  for (let i = 0; i < segmentCount; i++) {
    baseProfile[i] = random() * 2 - 1;
    radiusProfileBase[i] = random() * 2 - 1;
  }

  const smoothProfile = (values) => {
    const smoothed = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const prev = values[(i + values.length - 1) % values.length];
      const next = values[(i + 1) % values.length];
      smoothed[i] = (prev + values[i] * 2 + next) / 4;
    }
    return smoothed;
  };

  const heightProfile = smoothProfile(smoothProfile(baseProfile));
  const radiusProfile = smoothProfile(radiusProfileBase);
  const heightAmplitude = height * noise;
  const radiusAmplitude = radius * noise * 0.05;

  for (let i = 0; i < positionArray.length; i += 3) {
    vertex.fromArray(positionArray, i);
    if (vertex.y > 0) {
      const angle = Math.atan2(vertex.z, vertex.x);
      let normalized = (angle + Math.PI) / (Math.PI * 2);
      normalized = normalized - Math.floor(normalized);
      const segmentIndex = Math.floor(normalized * segmentCount) % segmentCount;
      const heightOffset = heightProfile[segmentIndex] * heightAmplitude;
      const radiusOffset = radiusProfile[segmentIndex] * radiusAmplitude;

      vertex.y += heightOffset;

      const horizontalLength = Math.hypot(vertex.x, vertex.z);
      if (horizontalLength > 1e-6) {
        const scale = (horizontalLength + radiusOffset) / horizontalLength;
        vertex.x *= scale;
        vertex.z *= scale;
      }
    }
    vertex.toArray(positionArray, i);
  }

  rimGeometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });

  material.depthWrite = true;
  material.depthTest = true;

  const mesh = new THREE.Mesh(rimGeometry, material);
  mesh.name = 'MountainRim';
  mesh.renderOrder = 0;
  mesh.position.y = height * 0.5;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
}
