/**
 * Road network builder for landmark traversal guidance.
 *
 * Options:
 * - texturePath: road texture URL (resolved via resolveAssetUrl).
 * - width: ribbon width in world units.
 * - connectStrategy: 'mst+knn', 'mst', 'knn', or 'manual'.
 *   - mst+knn: builds an MST backbone then augments with nearest neighbour links.
 *   - mst: minimum spanning tree only.
 *   - knn: connect to k nearest neighbours (deduped).
 *   - manual: uses options.manualEdges [[idA, idB], ...] exclusively.
 * - knn: neighbour count (clamped to 1–3) when using knn-based strategies.
 * - curvature: 0 for straight lines; 0.2–0.5 yields gentle curves.
 * - yOffset: lifts meshes slightly to mitigate z-fighting.
 * - scatterProps: enable prop scattering when hybridRoads integration is available.
 * - propsConfigPath: JSON config for prop scattering.
 */
import THREE from '../three.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';

const DEFAULT_OPTIONS = {
  texturePath: 'assets/roads/road_texture.jpg',
  width: 6,
  connectStrategy: 'mst+knn',
  knn: 2,
  curvature: 0.35,
  yOffset: 0.02,
  scatterProps: false,
  propsConfigPath: 'assets/roads/propsConfig.json'
};

const MIN_EDGE_LENGTH = 2;
const TEXTURE_REPEAT_DISTANCE = 4;
const MAX_KNN = 3;
const MIN_KNN = 1;

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function cloneLandmarks(input = []) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index) => {
      if (!item || !item.position || typeof item.position.x !== 'number') return null;
      const position = item.position.clone ? item.position.clone() : new THREE.Vector3(item.position.x, item.position.y ?? 0, item.position.z ?? 0);
      return {
        id: item.id ?? item.name ?? `landmark-${index}`,
        name: item.name ?? `Landmark ${index}`,
        position
      };
    })
    .filter(Boolean);
}

function clampCurvature(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return THREE.MathUtils.clamp(numeric, 0, 0.8);
}

function clampWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_OPTIONS.width;
  return Math.max(0.5, numeric);
}

function clampKnn(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_OPTIONS.knn;
  return THREE.MathUtils.clamp(Math.round(numeric), MIN_KNN, MAX_KNN);
}

function normalizeOptions(options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  merged.width = clampWidth(merged.width);
  merged.knn = clampKnn(merged.knn);
  merged.curvature = clampCurvature(merged.curvature);
  merged.yOffset = Number.isFinite(merged.yOffset) ? merged.yOffset : DEFAULT_OPTIONS.yOffset;
  merged.connectStrategy = typeof merged.connectStrategy === 'string' ? merged.connectStrategy.toLowerCase() : DEFAULT_OPTIONS.connectStrategy;
  merged.scatterProps = Boolean(merged.scatterProps);
  return merged;
}

function ensureTexture(path = DEFAULT_OPTIONS.texturePath) {
  const resolvedPath = resolveAssetUrl(path);
  if (textureCache.has(resolvedPath)) {
    return textureCache.get(resolvedPath);
  }

  const texture = textureLoader.load(resolvedPath, (tex) => {
    if ('colorSpace' in tex && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in tex && THREE.sRGBEncoding) {
      tex.encoding = THREE.sRGBEncoding;
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;

  textureCache.set(resolvedPath, texture);
  return texture;
}

function distance2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function computeDistanceMatrix(nodes) {
  const n = nodes.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = distance2D(nodes[i].position, nodes[j].position);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

function buildMST(nodes, distanceMatrix) {
  const n = nodes.length;
  if (n < 2) return [];

  const inTree = new Array(n).fill(false);
  const bestDist = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  const edges = [];

  inTree[0] = true;
  for (let i = 1; i < n; i += 1) {
    bestDist[i] = distanceMatrix[0][i];
    parent[i] = 0;
  }

  for (let k = 1; k < n; k += 1) {
    let minDist = Infinity;
    let next = -1;

    for (let i = 0; i < n; i += 1) {
      if (!inTree[i] && bestDist[i] < minDist) {
        minDist = bestDist[i];
        next = i;
      }
    }

    if (next === -1 || parent[next] === -1) {
      break;
    }

    inTree[next] = true;
    edges.push({ a: parent[next], b: next, length: distanceMatrix[parent[next]][next] });

    for (let j = 0; j < n; j += 1) {
      if (!inTree[j] && distanceMatrix[next][j] < bestDist[j]) {
        bestDist[j] = distanceMatrix[next][j];
        parent[j] = next;
      }
    }
  }

  return edges;
}

function addKnnEdges(nodes, distanceMatrix, k, edgeSet) {
  const n = nodes.length;
  for (let i = 0; i < n; i += 1) {
    const distances = [];
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      distances.push({ index: j, distance: distanceMatrix[i][j] });
    }
    distances.sort((a, b) => a.distance - b.distance);
    const count = Math.min(k, distances.length);
    for (let m = 0; m < count; m += 1) {
      const { index: j, distance } = distances[m];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!edgeSet.has(key) && distance >= MIN_EDGE_LENGTH) {
        edgeSet.set(key, { a: Math.min(i, j), b: Math.max(i, j), length: distance });
      }
    }
  }
}

function buildManualEdges(nodes, manualEdges = []) {
  if (!Array.isArray(manualEdges) || !manualEdges.length) return [];
  const indexById = new Map();
  nodes.forEach((node, index) => indexById.set(node.id, index));
  const edgeSet = new Map();

  for (const pair of manualEdges) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [aId, bId] = pair;
    if (!indexById.has(aId) || !indexById.has(bId)) continue;
    const a = indexById.get(aId);
    const b = indexById.get(bId);
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) continue;
    const dist = distance2D(nodes[a].position, nodes[b].position);
    if (dist < MIN_EDGE_LENGTH) continue;
    edgeSet.set(key, { a: Math.min(a, b), b: Math.max(a, b), length: dist });
  }

  return Array.from(edgeSet.values());
}

function buildGraphEdges(nodes, options) {
  const n = nodes.length;
  if (n < 2) return [];
  const edgeSet = new Map();
  const strategy = options.connectStrategy;
  const distanceMatrix = computeDistanceMatrix(nodes);

  if (strategy === 'manual') {
    return buildManualEdges(nodes, options.manualEdges);
  }

  if (strategy === 'mst' || strategy === 'mst+knn') {
    const mstEdges = buildMST(nodes, distanceMatrix);
    for (const edge of mstEdges) {
      const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
      if (edge.length >= MIN_EDGE_LENGTH) {
        edgeSet.set(key, { a: Math.min(edge.a, edge.b), b: Math.max(edge.a, edge.b), length: edge.length });
      }
    }
  }

  if (strategy === 'knn' || strategy === 'mst+knn') {
    addKnnEdges(nodes, distanceMatrix, options.knn, edgeSet);
  }

  return Array.from(edgeSet.values());
}

function computeCurvePoints(start, end, curvature) {
  const startPoint = start.clone();
  const endPoint = end.clone();
  if (curvature <= 0) {
    return [startPoint, endPoint];
  }

  const direction = endPoint.clone().sub(startPoint);
  const length = direction.length();
  if (length < 1e-3) {
    return [startPoint, endPoint];
  }

  direction.normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const midpoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);
  const offsetMagnitude = curvature * length * 0.5;
  const control = midpoint.add(side.multiplyScalar(offsetMagnitude));

  const curve = new THREE.CatmullRomCurve3([startPoint, control, endPoint], false, 'centripetal', 0.5);
  const previewPoints = curve.getPoints(16);
  let approxLength = 0;
  for (let i = 1; i < previewPoints.length; i += 1) {
    approxLength += previewPoints[i].distanceTo(previewPoints[i - 1]);
  }
  const segmentCount = Math.max(2, Math.ceil(approxLength / 1.5));
  return curve.getSpacedPoints(segmentCount);
}

function computeStraightPoints(start, end) {
  return [start.clone(), end.clone()];
}

function samplePolyline(start, end, curvature) {
  if (curvature > 0) {
    return computeCurvePoints(start, end, curvature);
  }
  return computeStraightPoints(start, end);
}

function createRoadMeshFromPolyline(points, width, material, yOffset) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const origin = points[0].clone();
  const vertexCount = points.length * 2;
  const positionArray = new Float32Array(vertexCount * 3);
  const uvArray = new Float32Array(vertexCount * 2);
  const indexCount = (points.length - 1) * 6;
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indexArray = new IndexArray(indexCount);
  const lengths = new Array(points.length).fill(0);

  for (let i = 1; i < points.length; i += 1) {
    lengths[i] = lengths[i - 1] + points[i].distanceTo(points[i - 1]);
  }

  const tangent = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const next = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    prev.copy(i === 0 ? point : points[i - 1]);
    next.copy(i === points.length - 1 ? point : points[i + 1]);

    tangent.copy(next).sub(prev);
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-6) {
      tangent.copy(next).sub(point);
      tangent.y = 0;
    }
    if (tangent.lengthSq() < 1e-6) {
      tangent.set(1, 0, 0);
    }
    tangent.normalize();

    normal.set(-tangent.z, 0, tangent.x).normalize();

    center.copy(point).sub(origin);
    left.copy(normal).multiplyScalar(width / 2);
    right.copy(normal).multiplyScalar(-width / 2);

    const leftIndex = i * 2;
    const rightIndex = leftIndex + 1;

    positionArray[leftIndex * 3 + 0] = center.x + left.x;
    positionArray[leftIndex * 3 + 1] = center.y + left.y;
    positionArray[leftIndex * 3 + 2] = center.z + left.z;

    positionArray[rightIndex * 3 + 0] = center.x + right.x;
    positionArray[rightIndex * 3 + 1] = center.y + right.y;
    positionArray[rightIndex * 3 + 2] = center.z + right.z;

    const u = lengths[i] / TEXTURE_REPEAT_DISTANCE;
    uvArray[leftIndex * 2 + 0] = u;
    uvArray[leftIndex * 2 + 1] = 0;
    uvArray[rightIndex * 2 + 0] = u;
    uvArray[rightIndex * 2 + 1] = 1;
  }

  let offset = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const base = i * 2;
    indexArray[offset + 0] = base;
    indexArray[offset + 1] = base + 1;
    indexArray[offset + 2] = base + 2;
    indexArray[offset + 3] = base + 1;
    indexArray[offset + 4] = base + 3;
    indexArray[offset + 5] = base + 2;
    offset += 6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(origin);
  mesh.position.y += yOffset;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  mesh.userData.roadPolyline = points.map((pt) => pt.clone());

  return mesh;
}

function disposeRoadMeshes(group) {
  const toDispose = [...group.children];
  toDispose.forEach((child) => {
    group.remove(child);
    if (child.isMesh) {
      child.geometry?.dispose();
    }
  });
}

async function loadPropsConfig(path) {
  if (!path) return null;
  const resolved = resolveAssetUrl(path);
  try {
    const res = await fetch(resolved);
    if (!res?.ok) {
      console.warn(`[roadNetwork] Failed to load props config: ${resolved}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn('[roadNetwork] Error loading props config', error);
    return null;
  }
}

async function scatterProps(scene, polylines, options, state) {
  if (!scene || !Array.isArray(polylines) || !polylines.length) return;
  try {
    const module = await import('./hybridRoads.js');
    if (!module?.scatterPropsAlongRoad) return;
    const propsConfig = await loadPropsConfig(options.propsConfigPath);
    const targets = [];
    for (const line of polylines) {
      try {
        const container = await module.scatterPropsAlongRoad(scene, line, propsConfig || {});
        if (container) {
          targets.push(container);
        }
      } catch (error) {
        console.warn('[roadNetwork] Failed to scatter props along road', error);
      }
    }
    state.propsContainers = targets;
  } catch (error) {
    console.warn('[roadNetwork] Prop scattering unavailable', error);
  }
}

function removeScatteredProps(state) {
  if (!state?.propsContainers?.length) return;
  for (const container of state.propsContainers) {
    if (container?.parent) {
      container.parent.remove(container);
    }
  }
  state.propsContainers = [];
}

function rebuildNetwork(state) {
  const { root, scene } = state;
  disposeRoadMeshes(root);
  removeScatteredProps(state);

  const landmarks = cloneLandmarks(state.landmarks);
  if (!landmarks.length) {
    return;
  }

  const options = state.options;
  const edges = buildGraphEdges(landmarks, options);
  if (!edges.length) {
    return;
  }

  const texture = ensureTexture(options.texturePath);
  if (!state.sharedMaterial || state.sharedMaterial.map !== texture) {
    if (state.sharedMaterial) {
      state.sharedMaterial.dispose?.();
    }
    state.sharedMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0.05,
      depthWrite: true,
      depthTest: true
    });
  }

  const polylines = [];
  for (const edge of edges) {
    const start = landmarks[edge.a].position;
    const end = landmarks[edge.b].position;
    const points = samplePolyline(start, end, options.curvature);
    if (points.length < 2) continue;
    polylines.push(points.map((pt) => pt.clone()));
    const mesh = createRoadMeshFromPolyline(points, options.width, state.sharedMaterial, options.yOffset);
    if (mesh) {
      mesh.userData.roadEdge = {
        startId: landmarks[edge.a].id,
        endId: landmarks[edge.b].id,
        length: edge.length
      };
      root.add(mesh);
    }
  }

  if (options.scatterProps) {
    state.scatterToken += 1;
    const currentToken = state.scatterToken;
    scatterProps(scene, polylines, options, state).then(() => {
      if (currentToken !== state.scatterToken) {
        removeScatteredProps(state);
      }
    });
  }
}

export function buildRoadNetwork({ scene, landmarks = [], options = {} } = {}) {
  const root = new THREE.Group();
  root.name = 'RoadNetwork';

  const state = {
    scene,
    root,
    landmarks,
    options: normalizeOptions(options),
    sharedMaterial: null,
    propsContainers: [],
    scatterToken: 0
  };

  rebuildNetwork(state);

  return {
    root,
    rebuild(newOptions = {}) {
      state.options = normalizeOptions({ ...state.options, ...newOptions });
      rebuildNetwork(state);
    },
    setVisible(visible) {
      root.visible = Boolean(visible);
    }
  };
}

export default buildRoadNetwork;
