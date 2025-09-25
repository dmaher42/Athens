import THREE from '../three.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

const DEFAULT_PROPS_CONFIG = {
  roadWidth: 6,
  torch: {
    spacing: 10,
    startOffset: 5,
    offset: 1.6,
    jitter: 0.6,
    yOffset: 0,
    maxCount: 40,
    enabled: true
  },
  rock: {
    spacing: [3, 5],
    startOffset: 1,
    offset: 2.3,
    jitter: 1.2,
    forwardJitter: 2.0,
    yOffset: 0,
    scale: [0.7, 1.4],
    maxCount: 80,
    enabled: true
  },
  grass: {
    spacing: [2.2, 3.4],
    startOffset: 1,
    offset: 2.1,
    jitter: 1.0,
    forwardJitter: 2.5,
    clusterSize: [3, 5],
    clusterRadius: 1.4,
    scale: [0.7, 1.2],
    yOffset: 0,
    maxCount: 120,
    enabled: true
  }
};

const PROP_TEMPLATE_CACHE = {
  torch: null,
  rock: null,
  grass: null
};

function toVector3(value) {
  if (!value) {
    return null;
  }

  if (value.isVector3) {
    return value.clone();
  }

  const { x = 0, y = 0, z = 0 } = value;
  return new THREE.Vector3(x, y, z);
}

function computePathSegments(points = []) {
  const segments = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = toVector3(points[i]);
    const end = toVector3(points[i + 1]);

    if (!start || !end) {
      continue;
    }

    const tangent = new THREE.Vector3().subVectors(end, start);
    const length = tangent.length();

    if (length <= 1e-5) {
      continue;
    }

    tangent.divideScalar(length);
    segments.push({ start, end, tangent, length });
  }

  return segments;
}

function resolveRange(range, fallback = 0) {
  if (Array.isArray(range) && range.length >= 2) {
    const min = Number(range[0]);
    const max = Number(range[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return { min: lo, max: hi };
    }
  }

  const value = Number(range);
  if (Number.isFinite(value)) {
    return { min: value, max: value };
  }

  return { min: fallback, max: fallback };
}

function randomInRange(range, fallback = 0) {
  const { min, max } = resolveRange(range, fallback);
  if (min === max) {
    return min;
  }

  return THREE.MathUtils.randFloat(min, max);
}

function createSpacingSampler(spacing, fallback = 1) {
  const { min, max } = resolveRange(spacing, fallback);
  const clampedMin = Math.max(0.5, min);
  const clampedMax = Math.max(clampedMin, max);
  return () => THREE.MathUtils.randFloat(clampedMin, clampedMax);
}

function getPointAtDistance(segments, distance) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  let remaining = distance;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (remaining <= segment.length) {
      const t = segment.length > 0 ? remaining / segment.length : 0;
      const point = segment.start.clone().lerp(segment.end, t);
      return { point, tangent: segment.tangent.clone() };
    }
    remaining -= segment.length;
  }

  const last = segments[segments.length - 1];
  return last ? { point: last.end.clone(), tangent: last.tangent.clone() } : null;
}

function samplePathPoints(segments, spacing, totalLength, options = {}) {
  const { maxCount = Infinity, startOffset } = options;
  if (!Array.isArray(segments) || segments.length === 0 || totalLength <= 0) {
    return [];
  }

  const sampler = createSpacingSampler(spacing, totalLength / Math.max(segments.length, 1));
  const samples = [];
  let nextDistance = Number.isFinite(startOffset)
    ? Math.max(0, startOffset)
    : randomInRange(startOffset, sampler() * 0.5);

  if (!Number.isFinite(nextDistance)) {
    nextDistance = sampler() * 0.5;
  }

  while (nextDistance < totalLength && samples.length < maxCount) {
    const sample = getPointAtDistance(segments, nextDistance);
    if (!sample) {
      break;
    }

    samples.push(sample);
    nextDistance += sampler();
  }

  return samples;
}

function computeSideVector(tangent) {
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
  if (side.lengthSq() <= 1e-6) {
    side.set(1, 0, 0);
  } else {
    side.normalize();
  }
  return side;
}

function mergeGeometries(geometries) {
  let vertexCount = 0;
  let indexCount = 0;

  geometries.forEach((geometry) => {
    if (!geometry?.attributes?.position) {
      return;
    }
    vertexCount += geometry.attributes.position.count;
    indexCount += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  });

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;

  geometries.forEach((geometry) => {
    if (!geometry?.attributes?.position) {
      return;
    }

    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    positions.set(positionAttr.array, vertexOffset * 3);
    normals.set(normalAttr.array, vertexOffset * 3);
    uvs.set(uvAttr.array, vertexOffset * 2);

    if (geometry.index) {
      const indexArray = geometry.index.array;
      for (let i = 0; i < indexArray.length; i += 1) {
        indices[indexOffset + i] = vertexOffset + indexArray[i];
      }
      indexOffset += indexArray.length;
    } else {
      const count = positionAttr.count;
      for (let i = 0; i < count; i += 1) {
        indices[indexOffset + i] = vertexOffset + i;
      }
      indexOffset += count;
    }

    vertexOffset += positionAttr.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  geometries.forEach((geometry) => geometry.dispose?.());

  return merged;
}

function buildTorchFactory() {
  const poleHeight = 2.4;
  const poleGeometry = new THREE.CylinderGeometry(0.12, 0.18, poleHeight, 6);
  const crossGeometry = new THREE.BoxGeometry(0.4, 0.18, 0.12);
  const bowlGeometry = new THREE.ConeGeometry(0.32, 0.5, 8);
  const flameGeometry = new THREE.ConeGeometry(0.24, 0.55, 6);

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b3a21,
    roughness: 0.75,
    metalness: 0.1
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a463e,
    roughness: 0.4,
    metalness: 0.45
  });

  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4c95d,
    emissive: new THREE.Color(0xf8a84b),
    emissiveIntensity: 0.7,
    roughness: 0.65,
    metalness: 0
  });

  return () => {
    const group = new THREE.Group();
    group.name = 'prop:torch';

    const pole = new THREE.Mesh(poleGeometry, woodMaterial);
    pole.position.y = poleHeight / 2;
    pole.castShadow = true;
    pole.receiveShadow = true;
    group.add(pole);

    const brace1 = new THREE.Mesh(crossGeometry, woodMaterial);
    brace1.position.set(0, poleHeight * 0.55, 0);
    brace1.castShadow = true;
    brace1.receiveShadow = true;
    group.add(brace1);

    const brace2 = brace1.clone();
    brace2.rotation.y = Math.PI / 2;
    group.add(brace2);

    const bowl = new THREE.Mesh(bowlGeometry, metalMaterial);
    bowl.position.y = poleHeight * 0.75;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    group.add(bowl);

    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.y = poleHeight * 0.98;
    flame.castShadow = false;
    flame.receiveShadow = false;
    group.add(flame);

    return group;
  };
}

function buildRockTemplate() {
  const geometry = new THREE.DodecahedronGeometry(0.6, 0);
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(1.1, 0.7, 0.9));
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  if (bbox) {
    const lift = -bbox.min.y;
    geometry.translate(0, lift, 0);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0x6f675b,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true
  });

  return { geometry, material };
}

function buildGrassTemplate() {
  const blade = new THREE.PlaneGeometry(0.45, 0.8);
  blade.translate(0, 0.4, 0);

  const blade2 = blade.clone();
  blade2.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));

  const geometry = mergeGeometries([blade, blade2]);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7ea04d,
    roughness: 0.8,
    metalness: 0.05
  });

  return { geometry, material };
}

function getTorchFactory() {
  if (!PROP_TEMPLATE_CACHE.torch) {
    PROP_TEMPLATE_CACHE.torch = buildTorchFactory();
  }
  return PROP_TEMPLATE_CACHE.torch;
}

function getRockTemplate() {
  if (!PROP_TEMPLATE_CACHE.rock) {
    PROP_TEMPLATE_CACHE.rock = buildRockTemplate();
  }
  return PROP_TEMPLATE_CACHE.rock;
}

function getGrassTemplate() {
  if (!PROP_TEMPLATE_CACHE.grass) {
    PROP_TEMPLATE_CACHE.grass = buildGrassTemplate();
  }
  return PROP_TEMPLATE_CACHE.grass;
}

async function loadRoadTexture(texturePath) {
  const resolvedTexturePath = resolveAssetUrl(texturePath);
  if (textureCache.has(resolvedTexturePath)) {
    return textureCache.get(resolvedTexturePath);
  }

  const texture = await textureLoader.loadAsync(resolvedTexturePath);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.max(texture.anisotropy || 1, 8);
  textureCache.set(resolvedTexturePath, texture);
  return texture;
}

export async function createRoadSegment(
  texturePath = 'assets/textures/athens_dust.jpg',
  start,
  end,
  width = DEFAULT_PROPS_CONFIG.roadWidth
) {
  const startVec = toVector3(start);
  const endVec = toVector3(end);

  if (!startVec || !endVec) {
    throw new Error('createRoadSegment requires valid start and end positions.');
  }

  const length = startVec.distanceTo(endVec);
  if (length <= 0) {
    throw new Error('createRoadSegment requires non-zero distance between start and end.');
  }

  const texture = await loadRoadTexture(texturePath);

  const geometry = new THREE.PlaneGeometry(length, width, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const lengthRepeat = Math.max(1, length / 4);
  const widthRepeat = Math.max(1, width / 2);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u * lengthRepeat, v * widthRepeat);
  }
  uv.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'hybrid-road:segment';
  mesh.receiveShadow = true;

  const midpoint = startVec.clone().add(endVec).multiplyScalar(0.5);
  mesh.position.copy(midpoint);

  const angle = Math.atan2(endVec.z - startVec.z, endVec.x - startVec.x);
  mesh.rotation.y = angle;

  mesh.userData.hybridRoad = {
    start: startVec.clone(),
    end: endVec.clone(),
    width,
    length
  };

  return mesh;
}

export async function scatterPropsAlongRoad(scene, roadPath, propsConfig = {}) {
  if (!scene || !scene.isObject3D) {
    throw new Error('scatterPropsAlongRoad requires a THREE.Scene or Object3D as the target container.');
  }

  const segments = computePathSegments(roadPath);
  if (!segments.length) {
    return null;
  }

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength <= 0) {
    return null;
  }

  const config = {
    ...DEFAULT_PROPS_CONFIG,
    ...propsConfig,
    torch: {
      ...DEFAULT_PROPS_CONFIG.torch,
      ...(propsConfig.torch || {})
    },
    rock: {
      ...DEFAULT_PROPS_CONFIG.rock,
      ...(propsConfig.rock || {})
    },
    grass: {
      ...DEFAULT_PROPS_CONFIG.grass,
      ...(propsConfig.grass || {})
    }
  };

  const container = new THREE.Group();
  container.name = 'hybrid-road:props';
  scene.add(container);

  const roadWidth = config.roadWidth ?? DEFAULT_PROPS_CONFIG.roadWidth;

  if (config.torch?.enabled !== false) {
    const torchFactory = getTorchFactory();
    const torchSamples = samplePathPoints(segments, config.torch.spacing, totalLength, {
      maxCount: config.torch.maxCount,
      startOffset: config.torch.startOffset
    });

    const torchGroup = new THREE.Group();
    torchGroup.name = 'hybrid-road:torches';

    torchSamples.forEach((sample, index) => {
      const torch = torchFactory();
      const sideVector = computeSideVector(sample.tangent);
      const sideSign = index % 2 === 0 ? 1 : -1;
      const lateralOffset = roadWidth / 2 + (config.torch.offset ?? 1.5);
      const jitter = config.torch.jitter ?? 0;
      const lateralJitter = jitter ? THREE.MathUtils.randFloatSpread(jitter) : 0;
      const forward = sample.tangent.clone().setY(0).normalize();
      const forwardJitter = THREE.MathUtils.randFloatSpread(0.6);

      const position = sample.point
        .clone()
        .add(sideVector.multiplyScalar(lateralOffset + lateralJitter).multiplyScalar(sideSign))
        .add(forward.multiplyScalar(forwardJitter));

      position.y += config.torch.yOffset ?? 0;

      torch.position.copy(position);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      torch.rotation.set(0, yaw, 0);
      const scaleJitter = THREE.MathUtils.randFloat(0.95, 1.05);
      torch.scale.setScalar(scaleJitter);

      torchGroup.add(torch);
    });

    container.add(torchGroup);
  }

  if (config.rock?.enabled !== false) {
    const rockTemplate = getRockTemplate();
    const rockSamples = samplePathPoints(segments, config.rock.spacing, totalLength, {
      maxCount: config.rock.maxCount,
      startOffset: config.rock.startOffset
    });

    const placements = [];
    const forwardVec = new THREE.Vector3();
    const sideVec = new THREE.Vector3();

    rockSamples.forEach((sample) => {
      const sideSign = Math.random() > 0.5 ? 1 : -1;
      sideVec.copy(computeSideVector(sample.tangent)).multiplyScalar(sideSign);
      forwardVec.copy(sample.tangent).setY(0).normalize();

      const baseOffset = roadWidth / 2 + (config.rock.offset ?? 1.2);
      const jitter = config.rock.jitter ?? 0;
      const lateral = baseOffset + (jitter ? THREE.MathUtils.randFloat(-jitter, jitter) : 0);
      const forwardOffset = THREE.MathUtils.randFloatSpread(config.rock.forwardJitter ?? 1.5);

      const position = sample.point
        .clone()
        .add(sideVec.clone().multiplyScalar(lateral))
        .add(forwardVec.clone().multiplyScalar(forwardOffset));
      position.y += config.rock.yOffset ?? 0;

      placements.push({ position });
    });

    const count = Math.min(placements.length, config.rock.maxCount ?? placements.length);
    if (count > 0) {
      const geometry = rockTemplate.geometry;
      const material = rockTemplate.material.clone();
      const instanced = new THREE.InstancedMesh(geometry, material, count);
      instanced.name = 'hybrid-road:rocks';
      instanced.castShadow = true;
      instanced.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i += 1) {
        const data = placements[i];
        const scaleRange = resolveRange(config.rock.scale, 1);
        const uniform = THREE.MathUtils.randFloat(scaleRange.min, scaleRange.max);
        const heightScale = uniform * THREE.MathUtils.randFloat(0.8, 1.2);

        dummy.position.copy(data.position);
        dummy.rotation.set(0, THREE.MathUtils.randFloat(0, Math.PI * 2), 0);
        dummy.scale.set(uniform, heightScale, uniform);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }

      instanced.instanceMatrix.needsUpdate = true;
      container.add(instanced);
    }
  }

  if (config.grass?.enabled !== false) {
    const grassTemplate = getGrassTemplate();
    const grassSamples = samplePathPoints(segments, config.grass.spacing, totalLength, {
      maxCount: Math.ceil((config.grass.maxCount ?? 0) / 4),
      startOffset: config.grass.startOffset
    });

    const placements = [];
    const forwardVec = new THREE.Vector3();
    const sideVec = new THREE.Vector3();

    grassSamples.forEach((sample) => {
      const clusterRange = resolveRange(config.grass.clusterSize, 3);
      const clusterCount = THREE.MathUtils.randInt(clusterRange.min, clusterRange.max);
      const baseSideSign = Math.random() > 0.5 ? 1 : -1;
      sideVec.copy(computeSideVector(sample.tangent)).multiplyScalar(baseSideSign);
      forwardVec.copy(sample.tangent).setY(0).normalize();

      const baseOffset = roadWidth / 2 + (config.grass.offset ?? 1.0);
      const jitter = config.grass.jitter ?? 0;
      const lateralBase = baseOffset + (jitter ? THREE.MathUtils.randFloat(-jitter, jitter) : 0);
      const forwardBase = THREE.MathUtils.randFloatSpread(config.grass.forwardJitter ?? 1.2);

      const clusterCenter = sample.point
        .clone()
        .add(sideVec.clone().multiplyScalar(lateralBase))
        .add(forwardVec.clone().multiplyScalar(forwardBase));

      for (let i = 0; i < clusterCount; i += 1) {
        if (placements.length >= (config.grass.maxCount ?? Infinity)) {
          break;
        }

        const radius = (config.grass.clusterRadius ?? 1) * Math.random();
        const angle = Math.random() * Math.PI * 2;
        const localSide = Math.cos(angle) * radius;
        const localForward = Math.sin(angle) * radius;

        const position = clusterCenter
          .clone()
          .add(sideVec.clone().multiplyScalar(localSide))
          .add(forwardVec.clone().multiplyScalar(localForward));
        position.y += config.grass.yOffset ?? 0;

        placements.push({ position });
      }
    });

    const count = Math.min(placements.length, config.grass.maxCount ?? placements.length);
    if (count > 0) {
      const geometry = grassTemplate.geometry;
      const material = grassTemplate.material.clone();
      material.side = THREE.DoubleSide;
      material.transparent = true;
      material.opacity = 0.9;

      const instanced = new THREE.InstancedMesh(geometry, material, count);
      instanced.name = 'hybrid-road:grass';
      instanced.castShadow = false;
      instanced.receiveShadow = false;

      const dummy = new THREE.Object3D();
      const scaleRange = resolveRange(config.grass.scale, 1);
      for (let i = 0; i < count; i += 1) {
        const data = placements[i];
        const uniform = THREE.MathUtils.randFloat(scaleRange.min, scaleRange.max);
        const stretch = THREE.MathUtils.randFloat(0.9, 1.3);

        dummy.position.copy(data.position);
        dummy.rotation.set(0, THREE.MathUtils.randFloat(0, Math.PI * 2), 0);
        dummy.scale.set(uniform, uniform * stretch, uniform);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }

      instanced.instanceMatrix.needsUpdate = true;
      container.add(instanced);
    }
  }

  return container;
}
