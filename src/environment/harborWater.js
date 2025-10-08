import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

import { assetUrl } from '../utils/assetUrl.ts';
import { disposeAll } from '../utils/disposable.ts';

const textureLoader = new THREE.TextureLoader();
let cachedWaterNormals = null;
let cachedWaterNormalsPromise = null;

function ensureRepeatWrapping(texture) {
  if (!texture) return texture;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function loadWaterNormalsTexture() {
  if (cachedWaterNormals) {
    return Promise.resolve(cachedWaterNormals);
  }

  if (!cachedWaterNormalsPromise) {
    const url = assetUrl('assets/textures/waternormals.jpg');
    cachedWaterNormalsPromise = new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          ensureRepeatWrapping(texture);
          cachedWaterNormals = texture;
          resolve(texture);
        },
        undefined,
        (error) => {
          cachedWaterNormalsPromise = null;
          reject(error);
        }
      );
    });
  }

  return cachedWaterNormalsPromise;
}

function normalizeSize(size) {
  if (typeof size === 'number' && Number.isFinite(size)) {
    return { width: size, height: size };
  }

  if (Array.isArray(size)) {
    const [width, height] = size;
    const normalizedWidth = Number.isFinite(width) ? width : 1;
    const normalizedHeight = Number.isFinite(height) ? height : normalizedWidth;
    return { width: normalizedWidth, height: normalizedHeight };
  }

  if (size && typeof size === 'object') {
    const widthCandidate = size.width ?? size.x ?? size[0];
    const heightCandidate = size.height ?? size.y ?? size[1];
    const normalizedWidth = Number.isFinite(widthCandidate) ? Number(widthCandidate) : 1;
    const normalizedHeight = Number.isFinite(heightCandidate)
      ? Number(heightCandidate)
      : normalizedWidth;
    return { width: normalizedWidth, height: normalizedHeight };
  }

  return { width: 1, height: 1 };
}

function resolveColor(color, fallback) {
  if (color instanceof THREE.Color) {
    return color;
  }
  const resolved = new THREE.Color(fallback);
  if (typeof color === 'number') {
    resolved.setHex(color);
  } else if (typeof color === 'string') {
    resolved.set(color);
  } else if (color && typeof color === 'object' && 'r' in color && 'g' in color && 'b' in color) {
    resolved.setRGB(color.r, color.g, color.b);
  }
  return resolved;
}

function resolveVector3(input, fallback) {
  const vector = new THREE.Vector3();
  if (input instanceof THREE.Vector3) {
    vector.copy(input);
    return vector;
  }
  if (Array.isArray(input)) {
    vector.set(
      Number.isFinite(input[0]) ? Number(input[0]) : fallback.x,
      Number.isFinite(input[1]) ? Number(input[1]) : fallback.y,
      Number.isFinite(input[2]) ? Number(input[2]) : fallback.z
    );
    return vector;
  }
  if (input && typeof input === 'object') {
    const x = Number.isFinite(input.x) ? Number(input.x) : Number(input[0]);
    const y = Number.isFinite(input.y) ? Number(input.y) : Number(input[1]);
    const z = Number.isFinite(input.z) ? Number(input.z) : Number(input[2]);
    vector.set(
      Number.isFinite(x) ? x : fallback.x,
      Number.isFinite(y) ? y : fallback.y,
      Number.isFinite(z) ? z : fallback.z
    );
    return vector;
  }
  vector.copy(fallback);
  return vector;
}

export async function createHarborWater(options = {}) {
  const {
    size: sizeOption = { width: 1, height: 1 },
    flowSpeed = 0.05,
    waterColor: waterColorOption = 0x1d3557,
    alpha = 1.0,
    distortionScale = 3.7,
    sunDirection: sunDirectionOption = new THREE.Vector3(0.70707, 0.70707, 0),
    uniformSize
  } = options;

  const { width, height } = normalizeSize(sizeOption);
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  let mesh = null;
  let material = null;
  let waterNormalsTexture = null;

  try {
    const baseWaterNormals = await loadWaterNormalsTexture();
    waterNormalsTexture = baseWaterNormals.clone();
    waterNormalsTexture.name = 'HarborWaterNormals';
    waterNormalsTexture.image = baseWaterNormals.image;
    ensureRepeatWrapping(waterNormalsTexture);
    waterNormalsTexture.needsUpdate = true;

    mesh = new Water(geometry, {
      textureWidth: 1024,
      textureHeight: 1024,
      waterNormals: waterNormalsTexture
    });
    material = mesh.material;

    const waterColor = resolveColor(waterColorOption, material.uniforms.waterColor.value);
    material.uniforms.waterColor.value.copy(waterColor);
    if (material.uniforms.alpha) {
      material.uniforms.alpha.value = alpha;
    }
    if (material.uniforms.distortionScale) {
      material.uniforms.distortionScale.value = distortionScale;
    }
    if (material.uniforms.size) {
      const sizeUniform = Number.isFinite(uniformSize) ? Number(uniformSize) : Math.max(width, height);
      material.uniforms.size.value = sizeUniform;
    }
    if (material.uniforms.sunDirection) {
      const sunDirection = resolveVector3(sunDirectionOption, material.uniforms.sunDirection.value);
      sunDirection.normalize();
      material.uniforms.sunDirection.value.copy(sunDirection);
    }
  } catch (error) {
    const fallbackMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0
    });
    mesh = new THREE.Mesh(geometry, fallbackMaterial);
    material = fallbackMaterial;
    waterNormalsTexture = null;
  }

  mesh.name = 'HarborWater';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const update = (delta = 0) => {
    if (!material || !material.uniforms) return;
    const uniforms = material.uniforms;
    if (uniforms && uniforms.time) {
      const speed = Number.isFinite(flowSpeed) ? flowSpeed : 0;
      uniforms.time.value += delta * speed;
    }
  };

  const dispose = () => {
    if (material && material.uniforms) {
      const uniforms = material.uniforms || {};
      const normalSampler = uniforms.normalSampler?.value;
      const mirrorSampler = uniforms.mirrorSampler?.value;

      if (normalSampler && normalSampler !== cachedWaterNormals) {
        disposeAll(normalSampler);
      }
      if (uniforms.normalSampler) {
        uniforms.normalSampler.value = null;
      }
      if (mirrorSampler) {
        disposeAll(mirrorSampler);
      }
      if (uniforms.mirrorSampler) {
        uniforms.mirrorSampler.value = null;
      }
    }

    disposeAll(material, geometry, mesh);
    material = null;
    waterNormalsTexture = null;
    mesh = null;
  };

  return { mesh, update, dispose };
}

export default createHarborWater;
