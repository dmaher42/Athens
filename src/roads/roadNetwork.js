import * as THREE from 'three';
import { collectGround } from '../physics/groundRegistry.js';
import { sampleGroundY } from '../physics/groundProject.js';

const DEFAULT_OPTIONS = {
  width: 3,
  heightOffset: 0.02,
  segmentLength: 2.5,
  tileScale: 6,
  jitter: 0.1,
  knn: 4
};

function clonePoints(points = []) {
  return points
    .filter((p) => p && typeof p.x === 'number' && typeof p.z === 'number')
    .map((p) => (p.clone ? p.clone() : new THREE.Vector3(p.x, p.y ?? 0, p.z)));
}

function dedupePoints(points, threshold = 1.5) {
  const out = [];
  const threshSq = threshold * threshold;
  for (const point of points) {
    if (!out.some((existing) => existing.distanceToSquared(point) < threshSq)) {
      out.push(point);
    }
  }
  return out;
}

function buildDistanceMatrix(points) {
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = points[i].distanceTo(points[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

function buildMST(points, matrix) {
  const n = points.length;
  if (n < 2) return [];

  const inTree = new Array(n).fill(false);
  const dist = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  const edges = [];

  inTree[0] = true;
  for (let i = 1; i < n; i += 1) {
    dist[i] = matrix[0][i];
    parent[i] = 0;
  }

  for (let count = 1; count < n; count += 1) {
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (!inTree[i] && dist[i] < bestDist) {
        bestDist = dist[i];
        bestIndex = i;
      }
    }
    if (bestIndex === -1 || parent[bestIndex] === -1) break;
    inTree[bestIndex] = true;
    edges.push({ a: parent[bestIndex], b: bestIndex });
    for (let j = 0; j < n; j += 1) {
      if (!inTree[j] && matrix[bestIndex][j] < dist[j]) {
        dist[j] = matrix[bestIndex][j];
        parent[j] = bestIndex;
      }
    }
  }

  return edges;
}

function addKnnEdges(points, matrix, k, edgeSet) {
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const distances = [];
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      distances.push({ index: j, distance: matrix[i][j] });
    }
    distances.sort((a, b) => a.distance - b.distance);
    const limit = Math.min(k, distances.length);
    for (let m = 0; m < limit; m += 1) {
      const j = distances[m].index;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!edgeSet.has(key)) {
        edgeSet.set(key, { a: Math.min(i, j), b: Math.max(i, j) });
      }
    }
  }
}

function createCurveBetween(a, b, jitter = 0.1) {
  const start = a.clone();
  const end = b.clone();
  const mid = start.clone().lerp(end, 0.5);
  const dir = end.clone().sub(start);
  const length = Math.max(1, dir.length());
  dir.normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const wobble = (Math.random() - 0.5) * jitter * length;
  mid.addScaledVector(perp, wobble);
  return new THREE.CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.15);
}

function sampleCurvePoints(curve, segmentLength) {
  const length = Math.max(curve.getLength(), segmentLength);
  const segments = Math.max(2, Math.ceil(length / segmentLength));
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push(curve.getPoint(t));
  }
  return points;
}

function buildRibbonGeometry(points, width, groundMeshes, heightOffset, tileScale) {
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const next = new THREE.Vector3();

  const positions = [];
  const uvs = [];
  const indices = [];
  let dist = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    if (i < points.length - 1) {
      next.copy(points[i + 1]);
      tangent.subVectors(next, current).normalize();
      tangent.y = 0;
      if (tangent.lengthSq() < 1e-6 && i > 0) {
        tangent.subVectors(current, points[i - 1]).normalize();
      }
    }
    if (tangent.lengthSq() < 1e-6) {
      tangent.set(1, 0, 0);
    }
    binormal.copy(up).cross(tangent).normalize();
    if (binormal.lengthSq() < 1e-6) {
      binormal.set(0, 0, 1);
    }

    const groundY = sampleGroundY(current.x, current.z, groundMeshes) ?? current.y ?? 0;
    const y = groundY + heightOffset;

    const halfWidth = width * 0.5;
    const left = current.clone().addScaledVector(binormal, halfWidth);
    const right = current.clone().addScaledVector(binormal, -halfWidth);
    left.y = y;
    right.y = y;

    if (i > 0) {
      dist += current.distanceTo(points[i - 1]);
    }
    const v = dist / tileScale;

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, v, 1, v);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function ensureRoadMaterial(materials) {
  if (materials?.road) return materials.road;
  return new THREE.MeshStandardMaterial({ color: 0x6f5b43, roughness: 0.95, metalness: 0.08 });
}

export function buildRoadNetwork({ scene, points: inputPoints = [], materials = {}, options = {} }) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const group = new THREE.Group();
  group.name = 'RoadNetwork';

  const cloned = dedupePoints(clonePoints(inputPoints));
  if (cloned.length < 2) {
    return group;
  }

  const distanceMatrix = buildDistanceMatrix(cloned);
  const mstEdges = buildMST(cloned, distanceMatrix);
  const edgeMap = new Map();
  mstEdges.forEach((edge) => {
    const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
    edgeMap.set(key, edge);
  });
  addKnnEdges(cloned, distanceMatrix, opts.knn, edgeMap);

  const groundMeshes = scene ? collectGround(scene) : [];
  const roadMaterial = ensureRoadMaterial(materials);

  edgeMap.forEach(({ a, b }) => {
    const start = cloned[a];
    const end = cloned[b];
    if (!start || !end) return;
    const curve = createCurveBetween(start, end, opts.jitter);
    const sampled = sampleCurvePoints(curve, opts.segmentLength);
    if (sampled.length < 2) return;
    const geometry = buildRibbonGeometry(sampled, opts.width, groundMeshes, opts.heightOffset, opts.tileScale);
    const mesh = new THREE.Mesh(geometry, roadMaterial);
    mesh.name = `Road_${a}_${b}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.isCollider = true;
    group.add(mesh);
  });

  return group;
}

export default buildRoadNetwork;
