import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createProceduralTree } from './procTree.js';

const TREE_MODEL_FILES = {
  olive: 'olive.glb',
  cypress: 'cypress.glb',
  plane: 'plane.glb'
};

const TARGET_TREE_HEIGHT = 3;
const DEFAULT_LOD_DISTANCES = { mid: 55, far: 130 };
const DEFAULT_SCALE_RANGE = [0.9, 1.15];
const MAX_SCATTER_ATTEMPTS = 20;
const DEFAULT_MIN_DISTANCE = 5;

const TRUNK_BASE_COLOR = new THREE.Color('#8b5a2b');
const LEAF_BASE_COLOR = new THREE.Color('#4f7c46');

const treeLibrary = new Map();
const windTimeUniform = { value: 0 };

let libraryPromise = null;
let libraryHandle = null;

function ensureStandardMaterial(material) {
  if (!material) {
    return new THREE.MeshStandardMaterial({
      color: LEAF_BASE_COLOR.clone(),
      roughness: 0.85,
      metalness: 0
    });
  }

  if (material.isMeshStandardMaterial) {
    const clone = material.clone();
    normalizeMaterialTextures(clone);
    return clone;
  }

  const standard = new THREE.MeshStandardMaterial({
    color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    roughness: typeof material.roughness === 'number' ? material.roughness : 0.85,
    metalness: typeof material.metalness === 'number' ? material.metalness : 0
  });

  const transferableProps = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'alphaMap',
    'emissiveMap'
  ];

  transferableProps.forEach((prop) => {
    if (material[prop]) {
      standard[prop] = material[prop];
    }
  });

  if (material.emissive) {
    standard.emissive = material.emissive.clone();
  }

  if (typeof material.opacity === 'number') {
    standard.opacity = material.opacity;
    standard.transparent = material.transparent ?? material.opacity < 1;
  }

  normalizeMaterialTextures(standard);
  return standard;
}

function normalizeMaterialTextures(material) {
  const colorMaps = ['map', 'emissiveMap'];
  colorMaps.forEach((prop) => {
    const texture = material[prop];
    if (texture && texture.isTexture) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  });
}

function detectTreePart(mesh) {
  const name = (mesh.name || '').toLowerCase();
  const materialName = Array.isArray(mesh.material)
    ? mesh.material.map((mat) => (mat?.name || '').toLowerCase()).join(' ')
    : (mesh.material?.name || '').toLowerCase();

  const trunkMatch = /trunk|stem|bark|branch/.test(name) || /trunk|stem|bark|branch/.test(materialName);
  if (trunkMatch) {
    return 'trunk';
  }

  const leafMatch = /leaf|leaves|canopy|foliage|crown/.test(name) || /leaf|leaves|canopy|foliage|crown/.test(materialName);
  if (leafMatch) {
    return 'leaves';
  }

  const geometry = mesh.geometry;
  if (geometry) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox;
    if (box) {
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y > size.x * 1.6 && size.y > size.z * 1.6) {
        return 'trunk';
      }
    }
  }

  return 'leaves';
}

function enableWind(material, height) {
  if (!material || material.userData?.windApplied) {
    return;
  }

  material.userData = material.userData || {};
  material.userData.windApplied = true;

  const uniforms = {
    uTime: windTimeUniform,
    uWindStrength: { value: 0.18 },
    uWindHeight: { value: height },
    uWindFrequency: { value: 1.25 }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uWindHeight = uniforms.uWindHeight;
    shader.uniforms.uWindFrequency = uniforms.uWindFrequency;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nuniform float uWindStrength;\nuniform float uWindHeight;\nuniform float uWindFrequency;\n`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );\nfloat swayPhase = ( position.x + position.z ) * 0.35 + uTime * uWindFrequency;\nfloat sway = sin( swayPhase ) * uWindStrength;\nfloat heightFactor = clamp( position.y / max( uWindHeight, 0.001 ), 0.0, 1.0 );\ntransformed.x += sway * heightFactor;\ntransformed.z += sway * heightFactor * 0.6;\n`
      );
  };

  material.needsUpdate = true;
}

function applyTreeMaterial(mesh, targetHeight, { skipWind = false } = {}) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const processed = materials.map((material) => {
    const standard = ensureStandardMaterial(material);
    const part = detectTreePart(mesh);

    if (part === 'trunk' && !standard.map) {
      standard.color.copy(TRUNK_BASE_COLOR);
      standard.roughness = 0.9;
      standard.metalness = 0;
    }

    if (part === 'leaves' && !standard.map) {
      standard.color.copy(LEAF_BASE_COLOR);
      standard.roughness = 0.85;
      standard.metalness = 0;
    }

    if (part === 'leaves' && !skipWind) {
      enableWind(standard, targetHeight);
    }

    return standard;
  });

  mesh.material = Array.isArray(mesh.material) ? processed : processed[0];
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function prepareTreeTemplate(name, source, { targetHeight = TARGET_TREE_HEIGHT, skipWind = false } = {}) {
  const clone = source.clone(true);
  const container = new THREE.Group();
  container.name = `${name}-template`;
  container.add(clone);

  clone.traverse((child) => {
    if (child.isMesh) {
      applyTreeMaterial(child, targetHeight, { skipWind });
    }
  });

  const initialBox = new THREE.Box3().setFromObject(container);
  const initialHeight = Math.max(initialBox.max.y - initialBox.min.y, 0.001);
  const scale = targetHeight / initialHeight;

  container.scale.setScalar(scale);
  container.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(container);
  const minY = scaledBox.min.y;
  clone.position.y -= minY;
  container.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(container);
  const height = finalBox.max.y - finalBox.min.y;

  container.userData.treeName = name;
  container.userData.treeHeight = height;

  return { object: container, height };
}

function buildInstancingData(group, height) {
  const trunkMesh = group.getObjectByName('trunk');
  const leavesMesh = group.getObjectByName('leaves');

  if (!trunkMesh || !leavesMesh) {
    return null;
  }

  if (!trunkMesh.isMesh || !leavesMesh.isMesh) {
    return null;
  }

  if (Array.isArray(trunkMesh.material) || Array.isArray(leavesMesh.material)) {
    return null;
  }

  const trunkGeometry = trunkMesh.geometry.clone();
  const leavesGeometry = leavesMesh.geometry.clone();
  const trunkMaterial = trunkMesh.material.clone();
  const leavesMaterial = leavesMesh.material.clone();

  enableWind(leavesMaterial, height);

  return {
    trunkGeometry,
    trunkMaterial,
    leavesGeometry,
    leavesMaterial,
    height
  };
}

async function loadTreeDefinition(name, file, loader) {
  let gltfScene = null;
  try {
    const url = new URL(`../../public/assets/models/${file}`, import.meta.url).href;
    const gltf = await loader.loadAsync(url);
    gltfScene = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
  } catch (error) {
    console.warn(`[trees] Missing ${file}, using procedural fallback`);
  }

  const highSource = gltfScene ?? createProceduralTree(name, 'high');
  const midSource = createProceduralTree(name, 'mid');
  const farSource = createProceduralTree(name, 'far');

  const high = prepareTreeTemplate(name, highSource, { targetHeight: TARGET_TREE_HEIGHT });
  const mid = prepareTreeTemplate(`${name}-mid`, midSource, { targetHeight: TARGET_TREE_HEIGHT });
  const far = prepareTreeTemplate(`${name}-far`, farSource, {
    targetHeight: TARGET_TREE_HEIGHT,
    skipWind: true
  });

  const definition = {
    name,
    source: gltfScene ? 'gltf' : 'procedural',
    highTemplate: high.object,
    midTemplate: mid.object,
    farTemplate: far.object,
    height: high.height,
    lodDistances: {
      mid: DEFAULT_LOD_DISTANCES.mid,
      far: DEFAULT_LOD_DISTANCES.far
    },
    instancing: buildInstancingData(mid.object, mid.height)
  };

  treeLibrary.set(name, definition);
  return definition;
}

function getTreeDefinition(name) {
  if (treeLibrary.has(name)) {
    return treeLibrary.get(name);
  }

  const fallback = createProceduralTree(name, 'high');
  const midFallback = createProceduralTree(name, 'mid');
  const farFallback = createProceduralTree(name, 'far');

  const high = prepareTreeTemplate(name, fallback, { targetHeight: TARGET_TREE_HEIGHT });
  const mid = prepareTreeTemplate(`${name}-mid`, midFallback, { targetHeight: TARGET_TREE_HEIGHT });
  const far = prepareTreeTemplate(`${name}-far`, farFallback, {
    targetHeight: TARGET_TREE_HEIGHT,
    skipWind: true
  });

  const definition = {
    name,
    source: 'procedural',
    highTemplate: high.object,
    midTemplate: mid.object,
    farTemplate: far.object,
    height: high.height,
    lodDistances: {
      mid: DEFAULT_LOD_DISTANCES.mid,
      far: DEFAULT_LOD_DISTANCES.far
    },
    instancing: buildInstancingData(mid.object, mid.height)
  };

  treeLibrary.set(name, definition);
  return definition;
}

export async function loadTreeLibrary(renderer) {
  if (libraryHandle) {
    return libraryHandle;
  }

  if (!libraryPromise) {
    const loader = new GLTFLoader();
    const entries = Object.entries(TREE_MODEL_FILES);

    libraryPromise = Promise.all(entries.map(([name, file]) => loadTreeDefinition(name, file, loader))).then(() => {
      libraryHandle = {
        getTree(treeName) {
          return treeLibrary.get(treeName) ?? null;
        },
        get names() {
          return Array.from(treeLibrary.keys());
        }
      };
      return libraryHandle;
    });
  }

  return libraryPromise;
}

function cloneTemplate(template) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return clone;
}

function applyTransform(object, options = {}) {
  const { position, rotation, scale } = options;

  if (position) {
    object.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  } else {
    object.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  }

  if (rotation) {
    if (rotation instanceof THREE.Euler) {
      object.rotation.copy(rotation);
    } else if (rotation instanceof THREE.Vector3) {
      object.rotation.set(rotation.x, rotation.y, rotation.z);
    } else if (typeof rotation === 'number') {
      object.rotation.y = rotation;
    } else {
      object.rotation.set(
        rotation.x ?? object.rotation.x,
        rotation.y ?? object.rotation.y,
        rotation.z ?? object.rotation.z
      );
    }
  } else if (options.rotateY !== undefined) {
    object.rotation.y = options.rotateY;
  }

  if (scale instanceof THREE.Vector3) {
    object.scale.copy(scale);
  } else if (Array.isArray(scale)) {
    object.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  } else if (typeof scale === 'number') {
    object.scale.setScalar(scale);
  } else if (options.uniformScale) {
    object.scale.setScalar(options.uniformScale);
  } else {
    object.scale.setScalar(1);
  }
}

export function createTreeInstance(name, options = {}) {
  const definition = getTreeDefinition(name);
  if (!definition) {
    return new THREE.Group();
  }

  const lod = new THREE.LOD();
  lod.name = `${name}-lod-tree`;

  const distances = {
    ...definition.lodDistances,
    ...(options.lodDistances || {})
  };

  const high = cloneTemplate(definition.highTemplate);
  const mid = cloneTemplate(definition.midTemplate);
  const far = cloneTemplate(definition.farTemplate);

  lod.addLevel(high, 0);
  lod.addLevel(mid, distances.mid);
  lod.addLevel(far, distances.far);

  lod.onBeforeRender = function onBeforeRender(renderer, scene, camera) {
    this.update(camera);
  };

  applyTransform(lod, options);

  return lod;
}

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function generateScatterPositions({ area, count, minDist, scaleRange, heightFn }) {
  const placements = [];
  if (!area || count <= 0) {
    return placements;
  }

  const xMin = area.xMin ?? -50;
  const xMax = area.xMax ?? 50;
  const zMin = area.zMin ?? -50;
  const zMax = area.zMax ?? 50;
  const minDistance = Math.max(minDist ?? DEFAULT_MIN_DISTANCE, 0);
  const minDistanceSq = minDistance * minDistance;
  const [scaleA, scaleB] = scaleRange || DEFAULT_SCALE_RANGE;
  const scaleMin = Math.min(scaleA, scaleB);
  const scaleMax = Math.max(scaleA, scaleB);

  const maxAttempts = Math.max(count * MAX_SCATTER_ATTEMPTS, count);
  let attempts = 0;

  while (placements.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = randomInRange(xMin, xMax);
    const z = randomInRange(zMin, zMax);

    if (minDistanceSq > 0) {
      let tooClose = false;
      for (let i = 0; i < placements.length; i += 1) {
        const dx = placements[i].x - x;
        const dz = placements[i].z - z;
        if (dx * dx + dz * dz < minDistanceSq) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }
    }

    const rotation = Math.random() * Math.PI * 2;
    const scale = randomInRange(scaleMin, scaleMax);
    const y = typeof heightFn === 'function' ? heightFn(x, z) : 0;

    placements.push({ x, y, z, rotation, scale });
  }

  for (let i = placements.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = placements[i];
    placements[i] = placements[j];
    placements[j] = temp;
  }

  return placements;
}

function createInstancedGrove(definition, placements) {
  const instancing = definition.instancing;
  if (!instancing) {
    return null;
  }

  const { trunkGeometry, trunkMaterial, leavesGeometry, leavesMaterial } = instancing;
  const count = placements.length;
  if (count === 0) {
    return null;
  }

  const group = new THREE.Group();
  group.name = `${definition.name}-instanced`;

  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const leavesMesh = new THREE.InstancedMesh(leavesGeometry, leavesMaterial, count);

  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  leavesMesh.castShadow = true;
  leavesMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  placements.forEach((placement, index) => {
    dummy.position.set(placement.x, placement.y, placement.z);
    dummy.rotation.set(0, placement.rotation, 0);
    dummy.scale.setScalar(placement.scale);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(index, dummy.matrix);
    leavesMesh.setMatrixAt(index, dummy.matrix);
  });

  trunkMesh.instanceMatrix.needsUpdate = true;
  leavesMesh.instanceMatrix.needsUpdate = true;

  group.add(trunkMesh);
  group.add(leavesMesh);
  return group;
}

export function scatterTrees({
  name = 'olive',
  area,
  count = 0,
  minDist = DEFAULT_MIN_DISTANCE,
  scaleRange = DEFAULT_SCALE_RANGE,
  heightFn,
  useInstancing = true,
  maxLod = 32
} = {}) {
  if (!treeLibrary.size) {
    console.warn('[trees] Tree library not loaded before scatterTrees call');
  }

  const definition = getTreeDefinition(name);
  const placements = generateScatterPositions({ area, count, minDist, scaleRange, heightFn });
  const group = new THREE.Group();
  group.name = `${name}-grove`;

  if (!placements.length) {
    return group;
  }

  const lodCount = Math.min(placements.length, Math.max(1, maxLod));
  const lodPlacements = placements.slice(0, lodCount);
  const instancedPlacements = placements.slice(lodCount);

  lodPlacements.forEach((placement) => {
    const tree = createTreeInstance(name, {
      position: { x: placement.x, y: placement.y, z: placement.z },
      rotation: placement.rotation,
      scale: placement.scale
    });
    group.add(tree);
  });

  if (useInstancing && instancedPlacements.length > 0) {
    const instanced = createInstancedGrove(definition, instancedPlacements);
    if (instanced) {
      group.add(instanced);
    } else {
      instancedPlacements.forEach((placement) => {
        const tree = createTreeInstance(name, {
          position: { x: placement.x, y: placement.y, z: placement.z },
          rotation: placement.rotation,
          scale: placement.scale
        });
        group.add(tree);
      });
    }
  } else {
    instancedPlacements.forEach((placement) => {
      const tree = createTreeInstance(name, {
        position: { x: placement.x, y: placement.y, z: placement.z },
        rotation: placement.rotation,
        scale: placement.scale
      });
      group.add(tree);
    });
  }

  return group;
}

export function updateTrees(delta) {
  if (typeof delta === 'number' && !Number.isNaN(delta)) {
    windTimeUniform.value += delta;
  }
}

