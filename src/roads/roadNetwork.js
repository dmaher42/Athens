import * as THREE from 'three';
import { collectGround } from '../physics/groundRegistry.js';
import { sampleGroundY } from '../physics/groundProject.js';

const DEFAULT_WIDTH = 3;
const DEFAULT_HEIGHT_OFFSET = 0.02;
const DEFAULT_TILE_SCALE = 6;
const K_NEIGHBOURS = 4;
const SEGMENT_LENGTH = 2.5;

function sanitizePoints(points = []) {
  const cleaned = [];
  const seen = [];
  for (const point of points) {
    if (!point) continue;
    const v = point.isVector3 ? point.clone() : new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) continue;
    if (seen.some((p) => p.distanceToSquared(v) < 1)) continue;
    seen.push(v);
    cleaned.push(v);
  }
  return cleaned;
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

function buildMST(points, distanceMatrix) {
  const n = points.length;
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

  for (let count = 1; count < n; count += 1) {
    let next = -1;
    let min = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (!inTree[i] && bestDist[i] < min) {
        min = bestDist[i];
        next = i;
      }
    }
    if (next === -1 || parent[next] === -1) break;
    inTree[next] = true;
    edges.push({ a: parent[next], b: next });

    for (let j = 0; j < n; j += 1) {
      if (!inTree[j] && distanceMatrix[next][j] < bestDist[j]) {
        bestDist[j] = distanceMatrix[next][j];
        parent[j] = next;
      }
    }
  }

  return edges;
}

function buildKnnEdges(points, distanceMatrix, k) {
  const n = points.length;
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    const neighbours = [];
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      neighbours.push({ index: j, distance: distanceMatrix[i][j] });
    }
    neighbours.sort((a, b) => a.distance - b.distance);
    const count = Math.min(k, neighbours.length);
    for (let m = 0; m < count; m += 1) {
      edges.push({ a: i, b: neighbours[m].index });
    }
  }
  return edges;
}

function uniqueEdges(edges) {
  const map = new Map();
  for (const edge of edges) {
    const a = Math.min(edge.a, edge.b);
    const b = Math.max(edge.a, edge.b);
    if (a === b) continue;
    const key = `${a}:${b}`;
    if (!map.has(key)) {
      map.set(key, { a, b });
    }
  }
  return Array.from(map.values());
}

function makeCurve(start, end, edgeIndex) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length === 0) {
    return new THREE.CatmullRomCurve3([start.clone(), end.clone()]);
  }
  dir.multiplyScalar(1 / length);
  const left = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const jitterSeed = Math.sin((edgeIndex + 1) * 12.9898) * 43758.5453;
  const jitter = (jitterSeed - Math.floor(jitterSeed)) - 0.5;
  const offset = left.multiplyScalar(Math.min(8, length * 0.25) * jitter);
  const third = length / 3;
  const mid1 = start.clone().addScaledVector(dir, third).add(offset.clone().multiplyScalar(0.6));
  const mid2 = start.clone().addScaledVector(dir, third * 2).add(offset.clone().multiplyScalar(-0.6));
  return new THREE.CatmullRomCurve3([start.clone(), mid1, mid2, end.clone()]);
}

function createRibbonFromCurve(curve, {
  width = DEFAULT_WIDTH,
  heightOffset = DEFAULT_HEIGHT_OFFSET,
  tileScale = DEFAULT_TILE_SCALE,
  material,
  groundMeshes
}) {
  const length = curve.getLength();
  const segments = Math.max(2, Math.ceil(length / SEGMENT_LENGTH));
  const vertexCount = (segments + 1) * 2;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(segments * 6);

  const tangent = new THREE.Vector3();
  const left = new THREE.Vector3();
  const center = new THREE.Vector3();
  const prevCenter = new THREE.Vector3();

  let distanceAlong = 0;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    curve.getPointAt(t, center);
    if (i > 0) {
      distanceAlong += center.distanceTo(prevCenter);
    }
    prevCenter.copy(center);

    curve.getTangentAt(t, tangent).setY(0);
    if (tangent.lengthSq() < 1e-4) {
      tangent.set(1, 0, 0);
    } else {
      tangent.normalize();
    }
    left.set(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width * 0.5);

    let y = center.y;
    if (groundMeshes?.length) {
      const sampled = sampleGroundY(center.x, center.z, groundMeshes, { fromY: center.y + 100 });
      if (sampled != null) {
        y = sampled;
      }
    }
    y += heightOffset;

    const baseIndex = i * 2;
    const posLeft = baseIndex * 3;
    const posRight = posLeft + 3;

    positions[posLeft] = center.x - left.x;
    positions[posLeft + 1] = y;
    positions[posLeft + 2] = center.z - left.z;

    positions[posRight] = center.x + left.x;
    positions[posRight + 1] = y;
    positions[posRight + 2] = center.z + left.z;

    const uvV = distanceAlong / tileScale;
    const uvIndex = baseIndex * 2;
    uvs[uvIndex] = 0;
    uvs[uvIndex + 1] = uvV;
    uvs[uvIndex + 2] = 1;
    uvs[uvIndex + 3] = uvV;

    const normalIndex = baseIndex * 3;
    normals[normalIndex] = 0;
    normals[normalIndex + 1] = 1;
    normals[normalIndex + 2] = 0;
    normals[normalIndex + 3] = 0;
    normals[normalIndex + 4] = 1;
    normals[normalIndex + 5] = 0;
  }

  for (let i = 0; i < segments; i += 1) {
    const idx = i * 6;
    const vi = i * 2;
    indices[idx] = vi;
    indices[idx + 1] = vi + 1;
    indices[idx + 2] = vi + 2;
    indices[idx + 3] = vi + 1;
    indices[idx + 4] = vi + 3;
    indices[idx + 5] = vi + 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material || new THREE.MeshStandardMaterial({ color: 0x6c6258, roughness: 0.9 }));
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  return mesh;
}

export function buildRoadNetwork({ scene, points, materials, options = {} }) {
  const nodes = sanitizePoints(points);
  const group = new THREE.Group();
  group.name = 'RoadNetwork';

  if (nodes.length < 2) {
    return group;
  }

  const width = Number.isFinite(options.width) ? options.width : DEFAULT_WIDTH;
  const tileScale = Number.isFinite(options.tileScale) ? options.tileScale : DEFAULT_TILE_SCALE;
  const heightOffset = Number.isFinite(options.heightOffset) ? options.heightOffset : DEFAULT_HEIGHT_OFFSET;

  const distanceMatrix = buildDistanceMatrix(nodes);
  const mstEdges = buildMST(nodes, distanceMatrix);
  const knnEdges = buildKnnEdges(nodes, distanceMatrix, K_NEIGHBOURS);
  const edges = uniqueEdges([...mstEdges, ...knnEdges]);

  const groundMeshes = collectGround(scene);
  const material = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x6c6258, roughness: 0.9 });

  edges.forEach((edge, index) => {
    const start = nodes[edge.a];
    const end = nodes[edge.b];
    const curve = makeCurve(start, end, index);
    const ribbon = createRibbonFromCurve(curve, {
      width,
      tileScale,
      heightOffset,
      material,
      groundMeshes
    });
    ribbon.name = `RoadSegment_${edge.a}_${edge.b}`;
    group.add(ribbon);
  });

  return group;
}
