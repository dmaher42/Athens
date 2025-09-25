import * as THREE from 'three';

const ORIGIN = new THREE.Vector3();

function createGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.4, 'rgba(255, 244, 220, 0.45)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

export function createMoon({
  textureLoader = null,
  textureUrl = null,
  radius = 2000,
  sphereRadius = 50,
  glowSize = 320
} = {}) {
  const group = new THREE.Group();
  group.name = 'MoonGroup';
  group.renderOrder = 2;
  group.frustumCulled = false;

  const geometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Moon';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = true;

  if (textureLoader && textureUrl) {
    textureLoader.load(textureUrl, (texture) => {
      if ('colorSpace' in texture && THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      texture.anisotropy = 4;
      material.map = texture;
      material.needsUpdate = true;
    }, undefined, (error) => {
      console.warn('[moon] Failed to load moon texture.', error);
    });
  }

  const glowTexture = createGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.name = 'MoonGlow';
  glow.scale.set(glowSize, glowSize, 1);
  glow.renderOrder = 1;
  glow.frustumCulled = false;

  group.add(glow);
  group.add(mesh);

  let enabled = true;
  let visibility = 1;
  let azimuth = Math.random() * Math.PI * 2;
  const elevation = THREE.MathUtils.degToRad(32);
  const tempTarget = new THREE.Vector3();
  const tempCamera = new THREE.Vector3();
  const glowBaseOpacity = glowMaterial.opacity;

  const update = (delta = 0, camera = null) => {
    if (!enabled || visibility <= 0.001) {
      return;
    }
    azimuth = (azimuth + delta * 0.05) % (Math.PI * 2);
    const cosEl = Math.cos(elevation);
    tempTarget.set(
      Math.cos(azimuth) * cosEl,
      Math.sin(elevation),
      Math.sin(azimuth) * cosEl
    ).multiplyScalar(radius);

    if (camera) {
      tempCamera.copy(camera.position);
      group.position.copy(tempCamera.add(tempTarget));
      mesh.lookAt(camera.position);
    } else {
      group.position.copy(tempTarget);
      mesh.lookAt(ORIGIN);
    }
  };

  const setVisibilityFactor = (factor) => {
    visibility = THREE.MathUtils.clamp(factor, 0, 1);
    group.visible = enabled && visibility > 0.001;
    material.opacity = visibility;
    glowMaterial.opacity = glowBaseOpacity * visibility;
  };

  const setEnabled = (value) => {
    enabled = !!value;
    group.visible = enabled && visibility > 0.001;
  };

  return {
    group,
    mesh,
    glow,
    update,
    setVisibilityFactor,
    setEnabled,
    get enabled() {
      return enabled;
    }
  };
}
