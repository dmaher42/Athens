import * as THREE from 'three';

const DEFAULT_OPTIONS = {
  simplificationEpsilon: 0.05,
  minTriangleArea: 0.1,
  minNormalY: 0.25,
  barycentricTolerance: 0.02
};

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_NORMAL = new THREE.Vector3();
const TMP_EDGE1 = new THREE.Vector3();
const TMP_EDGE2 = new THREE.Vector3();
const TMP_TRIANGLE = new THREE.Triangle();
const TMP_PROJECTED = new THREE.Vector3();
const TMP_CLOSEST = new THREE.Vector3();
const TMP_BARY = new THREE.Vector3();
const BEST_INSIDE = new THREE.Vector3();
const BEST_POINT = new THREE.Vector3();

function isMeshLike(obj) {
  return Boolean(obj && (obj.isMesh || obj instanceof THREE.Mesh) && obj.geometry);
}

function quantize(value, epsilon) {
  const inv = 1 / epsilon;
  return Math.round(value * inv);
}

function buildVertexKey(vector, epsilon) {
  return `${quantize(vector.x, epsilon)}|${quantize(vector.y, epsilon)}|${quantize(vector.z, epsilon)}`;
}

function copyVertex(array, index, target = new THREE.Vector3()) {
  const base = index * 3;
  target.set(array[base], array[base + 1], array[base + 2]);
  return target;
}

function setTriangleVertices(vertexArray, triangle) {
  copyVertex(vertexArray, triangle.a, TMP_A);
  copyVertex(vertexArray, triangle.b, TMP_B);
  copyVertex(vertexArray, triangle.c, TMP_C);
  TMP_TRIANGLE.set(TMP_A, TMP_B, TMP_C);
}

function projectPointToTriangle(vertexArray, triangle, point, tolerance) {
  setTriangleVertices(vertexArray, triangle);
  TMP_PROJECTED.copy(point);
  const planeDistance = triangle.normal.dot(TMP_PROJECTED) + triangle.planeConstant;
  TMP_PROJECTED.addScaledVector(triangle.normal, -planeDistance);
  THREE.Triangle.getBarycoord(TMP_PROJECTED, TMP_A, TMP_B, TMP_C, TMP_BARY);
  const inside =
    TMP_BARY.x >= -tolerance &&
    TMP_BARY.y >= -tolerance &&
    TMP_BARY.z >= -tolerance;
  const distanceSq = TMP_PROJECTED.distanceToSquared(point);
  return { inside, distanceSq, projected: TMP_PROJECTED, bary: TMP_BARY };
}

function closestPointOnTriangle(vertexArray, triangle, point) {
  setTriangleVertices(vertexArray, triangle);
  return TMP_TRIANGLE.closestPointToPoint(point, TMP_CLOSEST);
}

function findBestTriangle(vertexArray, triangles, point, tolerance) {
  let bestInsideIdx = -1;
  let bestInsideDist = Infinity;
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < triangles.length; i += 1) {
    const triangle = triangles[i];
    const { inside, distanceSq, projected } = projectPointToTriangle(vertexArray, triangle, point, tolerance);
    if (inside) {
      if (distanceSq < bestInsideDist) {
        bestInsideDist = distanceSq;
        bestInsideIdx = i;
        BEST_INSIDE.copy(projected);
      }
      continue;
    }

    const closest = closestPointOnTriangle(vertexArray, triangle, point);
    const distSq = closest.distanceToSquared(point);
    if (distSq < bestDist) {
      bestDist = distSq;
      bestIdx = i;
      BEST_POINT.copy(closest);
    }
  }

  if (bestInsideIdx !== -1) {
    return { triangleIndex: bestInsideIdx, point: BEST_INSIDE, distanceSq: bestInsideDist };
  }

  if (bestIdx !== -1) {
    return { triangleIndex: bestIdx, point: BEST_POINT, distanceSq: bestDist };
  }

  return { triangleIndex: -1, point: null, distanceSq: Infinity };
}

function buildNavMeshObject(vertexBuffer, triangles, boundsMin, boundsMax, options) {
  const vertexArray = new Float32Array(vertexBuffer);
  const tolerance = Math.max(1e-4, options.barycentricTolerance ?? DEFAULT_OPTIONS.barycentricTolerance);
  const sharedEdgeMap = new Map();

  for (let i = 0; i < triangles.length; i += 1) {
    const triangle = triangles[i];
    triangle.index = i;
    triangle.neighbors = triangle.neighbors || [];
    triangle.portals = triangle.portals || [];

    const edges = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a]
    ];

    for (const [va, vb] of edges) {
      if (va === vb) continue;
      const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
      const existing = sharedEdgeMap.get(key);
      if (existing) {
        const otherTriangle = triangles[existing.triangle];
        if (otherTriangle && triangle.neighbors.indexOf(existing.triangle) === -1) {
          triangle.neighbors.push(existing.triangle);
          triangle.portals.push(existing.portal);
        }
        if (otherTriangle && otherTriangle.neighbors.indexOf(i) === -1) {
          otherTriangle.neighbors.push(i);
          otherTriangle.portals.push(existing.portal);
        }
      } else {
        const portal = { a: va, b: vb };
        sharedEdgeMap.set(key, { triangle: i, portal });
      }
    }
  }

  const bounds = {
    min: boundsMin.clone(),
    max: boundsMax.clone()
  };

  return {
    vertexCount: vertexArray.length / 3,
    triangleCount: triangles.length,
    vertices: vertexArray,
    triangles,
    bounds,
    getVertex(index, target = new THREE.Vector3()) {
      return copyVertex(vertexArray, index, target);
    },
    getTriangle(index) {
      return triangles[index] || null;
    },
    getPortalBetween(aIndex, bIndex, outA = new THREE.Vector3(), outB = new THREE.Vector3()) {
      const triangle = triangles[aIndex];
      if (!triangle) return false;
      const { neighbors = [], portals = [] } = triangle;
      for (let i = 0; i < neighbors.length; i += 1) {
        if (neighbors[i] === bIndex && portals[i]) {
          copyVertex(vertexArray, portals[i].a, outA);
          copyVertex(vertexArray, portals[i].b, outB);
          return true;
        }
      }
      return false;
    },
    projectPoint(point, out = new THREE.Vector3()) {
      if (!point) return { triangleIndex: -1, distanceSq: Infinity };
      const result = findBestTriangle(vertexArray, triangles, point, tolerance);
      if (result.triangleIndex !== -1 && result.point) {
        out.copy(result.point);
      }
      return result;
    }
  };
}

export function buildNavMeshFromMeshes(meshes, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const epsilon = Math.max(1e-4, Number(opts.simplificationEpsilon) || DEFAULT_OPTIONS.simplificationEpsilon);
  const minArea = Math.max(0, Number(opts.minTriangleArea) || DEFAULT_OPTIONS.minTriangleArea);
  const minNormalY = Math.max(0, Math.min(1, Number(opts.minNormalY) ?? DEFAULT_OPTIONS.minNormalY));

  const vertexBuffer = [];
  const vertexMap = new Map();
  const triangles = [];

  const boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  const addVertex = (vector) => {
    const key = buildVertexKey(vector, epsilon);
    if (vertexMap.has(key)) {
      return vertexMap.get(key);
    }
    const index = vertexBuffer.length / 3;
    vertexBuffer.push(vector.x, vector.y, vector.z);
    vertexMap.set(key, index);
    boundsMin.min(vector);
    boundsMax.max(vector);
    return index;
  };

  const worldVertexCache = [];

  for (const mesh of meshes || []) {
    if (!isMeshLike(mesh)) continue;
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry;
    const positionAttr = geometry?.attributes?.position;
    if (!positionAttr) continue;

    const indexAttr = geometry.index ? geometry.index.array : null;
    const count = indexAttr ? indexAttr.length : positionAttr.count;

    worldVertexCache.length = positionAttr.count;
    for (let i = 0; i < positionAttr.count; i += 1) {
      const vertex = worldVertexCache[i] || new THREE.Vector3();
      vertex.fromBufferAttribute(positionAttr, i).applyMatrix4(mesh.matrixWorld);
      worldVertexCache[i] = vertex;
    }

    const step = 3;
    for (let i = 0; i < count; i += step) {
      const ia = indexAttr ? indexAttr[i] : i;
      const ib = indexAttr ? indexAttr[i + 1] : i + 1;
      const ic = indexAttr ? indexAttr[i + 2] : i + 2;

      const va = worldVertexCache[ia];
      const vb = worldVertexCache[ib];
      const vc = worldVertexCache[ic];
      if (!va || !vb || !vc) continue;

      TMP_EDGE1.subVectors(vb, va);
      TMP_EDGE2.subVectors(vc, va);
      TMP_NORMAL.copy(TMP_EDGE1).cross(TMP_EDGE2);
      const area = TMP_NORMAL.length() * 0.5;
      if (!Number.isFinite(area) || area < minArea) continue;

      TMP_NORMAL.normalize();
      if (!Number.isFinite(TMP_NORMAL.y) || TMP_NORMAL.y < minNormalY) continue;

      const aIndex = addVertex(va);
      const bIndex = addVertex(vb);
      const cIndex = addVertex(vc);
      if (aIndex === bIndex || bIndex === cIndex || cIndex === aIndex) continue;

      const triangle = {
        a: aIndex,
        b: bIndex,
        c: cIndex,
        normal: TMP_NORMAL.clone(),
        centroid: new THREE.Vector3(
          (va.x + vb.x + vc.x) / 3,
          (va.y + vb.y + vc.y) / 3,
          (va.z + vb.z + vc.z) / 3
        ),
        planeConstant: -TMP_NORMAL.dot(va),
        neighbors: [],
        portals: [],
        area,
        boundingRadius: Math.max(
          va.distanceToSquared(vb),
          vb.distanceToSquared(vc),
          vc.distanceToSquared(va)
        )
      };

      triangle.boundingRadius = Math.sqrt(Math.max(triangle.boundingRadius, 1e-6));

      triangles.push(triangle);
    }
  }

  if (!triangles.length) {
    return null;
  }

  return buildNavMeshObject(vertexBuffer, triangles, boundsMin, boundsMax, opts);
}

export default buildNavMeshFromMeshes;
