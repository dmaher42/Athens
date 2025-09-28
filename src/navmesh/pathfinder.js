import * as THREE from 'three';

const DEFAULT_OPTIONS = {
  heuristicScale: 1.0,
  maxIterationsMultiplier: 16
};

const TMP_START = new THREE.Vector3();
const TMP_END = new THREE.Vector3();
const TMP_PORTAL_A = new THREE.Vector3();
const TMP_PORTAL_B = new THREE.Vector3();
const TMP_PORTAL_CENTER = new THREE.Vector3();

function createHeap() {
  const nodes = [];
  const pool = [];

  const swap = (i, j) => {
    const tmp = nodes[i];
    nodes[i] = nodes[j];
    nodes[j] = tmp;
  };

  const bubbleUp = (index) => {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (nodes[parent].f <= nodes[i].f) break;
      swap(i, parent);
      i = parent;
    }
  };

  const bubbleDown = (index) => {
    let i = index;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < nodes.length && nodes[left].f < nodes[smallest].f) smallest = left;
      if (right < nodes.length && nodes[right].f < nodes[smallest].f) smallest = right;
      if (smallest === i) break;
      swap(i, smallest);
      i = smallest;
    }
  };

  return {
    push(index, fScore) {
      const node = pool.pop() || { index: 0, f: 0 };
      node.index = index;
      node.f = fScore;
      nodes.push(node);
      bubbleUp(nodes.length - 1);
    },
    pop() {
      if (!nodes.length) return null;
      const top = nodes[0];
      const last = nodes.pop();
      if (nodes.length) {
        nodes[0] = last;
        bubbleDown(0);
      }
      return top;
    },
    clear() {
      nodes.length = 0;
      pool.length = 0;
    },
    release(node) {
      if (node) pool.push(node);
    },
    isEmpty() {
      return nodes.length === 0;
    }
  };
}

function pushPathPoint(path, source) {
  if (!source) {
    return;
  }
  const index = path.length;
  if (path[index]) {
    path[index].copy(source);
  } else {
    path[index] = source.clone();
  }
}

function removeRedundantPoints(path, epsilonSq = 1e-4) {
  for (let i = path.length - 1; i > 0; i -= 1) {
    if (path[i].distanceToSquared(path[i - 1]) <= epsilonSq) {
      path.splice(i, 1);
    }
  }
}

export function createNavMeshPathfinder(navMesh, options = {}) {
  if (!navMesh || !navMesh.triangleCount || navMesh.triangleCount <= 0) {
    return null;
  }

  const triangles = navMesh.triangles;
  const triangleCount = triangles.length;
  if (!triangleCount) {
    return null;
  }

  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const heuristicScale = Number.isFinite(opts.heuristicScale) ? opts.heuristicScale : DEFAULT_OPTIONS.heuristicScale;
  const maxIterations = Math.max(32, Math.floor((opts.maxIterationsMultiplier || DEFAULT_OPTIONS.maxIterationsMultiplier) * triangleCount));

  const cameFrom = new Int32Array(triangleCount);
  const gScore = new Float32Array(triangleCount);
  const fScore = new Float32Array(triangleCount);
  const visitId = new Uint32Array(triangleCount);
  let searchId = 1;

  const heap = createHeap();
  const trianglePath = [];

  const ensureSearchId = () => {
    searchId += 1;
    if (searchId === 0 || searchId >= 0xfffffffe) {
      visitId.fill(0);
      searchId = 1;
    }
  };

  const reconstructPath = (current) => {
    trianglePath.length = 0;
    trianglePath.push(current);
    let node = current;
    while (cameFrom[node] !== -1) {
      node = cameFrom[node];
      if (node === -1) break;
      trianglePath.push(node);
    }
    trianglePath.reverse();
    return trianglePath;
  };

  const buildPointPath = (triangleIndices, startPoint, endPoint, out) => {
    out.length = 0;
    pushPathPoint(out, startPoint);

    for (let i = 0; i < triangleIndices.length - 1; i += 1) {
      const triIndex = triangleIndices[i];
      const nextIndex = triangleIndices[i + 1];
      if (navMesh.getPortalBetween(triIndex, nextIndex, TMP_PORTAL_A, TMP_PORTAL_B)) {
        TMP_PORTAL_CENTER.copy(TMP_PORTAL_A).add(TMP_PORTAL_B).multiplyScalar(0.5);
        pushPathPoint(out, TMP_PORTAL_CENTER);
      }
    }

    pushPathPoint(out, endPoint);
    removeRedundantPoints(out, 1e-3);
    return out;
  };

  const ensureProjectedPoint = (point, target) => {
    const projection = navMesh.projectPoint(point, target);
    if (!projection || projection.triangleIndex === -1) {
      return null;
    }
    return projection;
  };

  const directFallback = (startPoint, endPoint, out) => {
    out.length = 0;
    pushPathPoint(out, startPoint);
    pushPathPoint(out, endPoint);
    removeRedundantPoints(out);
    return out;
  };

  return {
    findPath(startPoint, endPoint, out = []) {
      if (!startPoint || !endPoint) {
        out.length = 0;
        return out;
      }

      const startProjection = ensureProjectedPoint(startPoint, TMP_START);
      const endProjection = ensureProjectedPoint(endPoint, TMP_END);
      if (!startProjection || !endProjection) {
        return directFallback(startPoint, endPoint, out);
      }

      const startTriangle = startProjection.triangleIndex;
      const goalTriangle = endProjection.triangleIndex;
      if (startTriangle === -1 || goalTriangle === -1) {
        return directFallback(startProjection.point || startPoint, endProjection.point || endPoint, out);
      }

      ensureSearchId();
      heap.clear();

      const visitedFlag = searchId;
      for (let i = 0; i < triangleCount; i += 1) {
        if (visitId[i] === visitedFlag) continue;
        cameFrom[i] = -1;
        gScore[i] = Infinity;
        fScore[i] = Infinity;
      }

      visitId[startTriangle] = visitedFlag;
      cameFrom[startTriangle] = -1;
      gScore[startTriangle] = 0;
      const initialHeuristic = triangles[startTriangle].centroid.distanceTo(TMP_END);
      fScore[startTriangle] = initialHeuristic * heuristicScale;
      heap.push(startTriangle, fScore[startTriangle]);

      let iterations = 0;
      let found = false;

      while (!heap.isEmpty() && iterations < maxIterations) {
        iterations += 1;
        const node = heap.pop();
        if (!node) break;
        const current = node.index;
        heap.release(node);

        if (node.f > fScore[current] + 1e-5) {
          continue;
        }

        if (current === goalTriangle) {
          found = true;
          break;
        }

        const currentTriangle = triangles[current];
        const neighbors = currentTriangle?.neighbors || [];

        for (let i = 0; i < neighbors.length; i += 1) {
          const neighbor = neighbors[i];
          if (neighbor == null || neighbor < 0 || neighbor >= triangleCount) continue;
          const cost = currentTriangle.centroid.distanceTo(triangles[neighbor].centroid);
          if (!Number.isFinite(cost)) continue;

          const tentativeG = gScore[current] + cost;
          const visited = visitId[neighbor] === visitedFlag;
          if (!visited || tentativeG + 1e-6 < gScore[neighbor]) {
            visitId[neighbor] = visitedFlag;
            cameFrom[neighbor] = current;
            gScore[neighbor] = tentativeG;
            const heuristic = triangles[neighbor].centroid.distanceTo(TMP_END);
            const total = tentativeG + heuristic * heuristicScale;
            fScore[neighbor] = total;
            heap.push(neighbor, total);
          }
        }
      }

      if (!found) {
        return directFallback(TMP_START, TMP_END, out);
      }

      const triangleIndices = reconstructPath(goalTriangle);
      return buildPointPath(triangleIndices, TMP_START, TMP_END, out);
    }
  };
}

export default createNavMeshPathfinder;
