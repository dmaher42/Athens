import * as THREE from 'three';

const defaultTempColor = new THREE.Color();

export function createStarField({
  count = 8500,
  innerRadius = 1900,
  outerRadius = 2200,
  colorHueRange = [0.52, 0.67],
  sizeRange = [0.6, 1.4],
  opacity = 0.9,
  twinkleSpeed = 0.65
} = {}) {
  const starCount = Math.max(1000, Math.min(12000, Math.floor(count)));
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const baseColors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);

  for (let i = 0; i < starCount; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinPhi = Math.sin(phi);
    const distance = THREE.MathUtils.lerp(innerRadius, outerRadius, Math.random());
    const px = Math.cos(theta) * sinPhi * distance;
    const py = Math.cos(phi) * distance;
    const pz = Math.sin(theta) * sinPhi * distance;

    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    const hue = THREE.MathUtils.lerp(colorHueRange[0], colorHueRange[1], Math.random());
    const saturation = 0.15 + Math.random() * 0.25;
    const lightness = 0.7 + Math.random() * 0.3;

    defaultTempColor.setHSL(hue, saturation, lightness);

    const r = defaultTempColor.r;
    const g = defaultTempColor.g;
    const b = defaultTempColor.b;

    baseColors[i * 3 + 0] = r;
    baseColors[i * 3 + 1] = g;
    baseColors[i * 3 + 2] = b;

    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = THREE.MathUtils.lerp(sizeRange[0], sizeRange[1], Math.random());
    phases[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aStarSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.8,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStarSize;')
      .replace(/gl_PointSize\s*=\s*size\s*;/, 'gl_PointSize = size * aStarSize;');
  };
  material.needsUpdate = true;

  const points = new THREE.Points(geometry, material);
  points.name = 'StarField';
  points.frustumCulled = false;
  points.renderOrder = 0;

  let enabled = true;
  let visibility = 1;
  let twinkleTime = 0;
  let lastUpdate = 0;

  const update = (delta = 0, elapsed = 0, camera = null) => {
    if (!enabled || visibility <= 0) {
      return;
    }

    twinkleTime += delta * twinkleSpeed;

    if (camera) {
      points.position.copy(camera.position);
    }

    if (elapsed - lastUpdate < 0.05) {
      return;
    }
    lastUpdate = elapsed;

    const colorAttr = geometry.getAttribute('color');
    for (let i = 0; i < starCount; i += 1) {
      const phase = phases[i];
      const twinkle = 0.75 + 0.25 * Math.sin(twinkleTime + phase + i * 0.0009);
      colorAttr.array[i * 3 + 0] = baseColors[i * 3 + 0] * twinkle;
      colorAttr.array[i * 3 + 1] = baseColors[i * 3 + 1] * twinkle;
      colorAttr.array[i * 3 + 2] = baseColors[i * 3 + 2] * twinkle;
    }
    colorAttr.needsUpdate = true;
  };

  const setVisibilityFactor = (factor) => {
    visibility = THREE.MathUtils.clamp(factor, 0, 1);
    points.visible = enabled && visibility > 0.001;
    material.opacity = opacity * visibility;
  };

  const setEnabled = (value) => {
    enabled = !!value;
    points.visible = enabled && visibility > 0.001;
  };

  return {
    points,
    update,
    setVisibilityFactor,
    setEnabled,
    get enabled() {
      return enabled;
    },
    get visibility() {
      return visibility;
    }
  };
}
