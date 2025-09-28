const SQRT2 = Math.SQRT2;

class MinHeap {
  constructor(capacity = 64) {
    const initial = Math.max(16, capacity);
    this.indices = new Int32Array(initial);
    this.priorities = new Float32Array(initial);
    this.length = 0;
    this.lastPriority = Infinity;
  }

  _ensure(size) {
    if (size <= this.indices.length) {
      return;
    }
    let nextSize = this.indices.length;
    while (nextSize < size) {
      nextSize <<= 1;
    }
    const newIndices = new Int32Array(nextSize);
    newIndices.set(this.indices);
    this.indices = newIndices;
    const newPriorities = new Float32Array(nextSize);
    newPriorities.set(this.priorities);
    this.priorities = newPriorities;
  }

  push(index, priority) {
    const insertIndex = this.length;
    this._ensure(insertIndex + 1);
    this.length = insertIndex + 1;
    let i = insertIndex;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentPriority = this.priorities[parent];
      if (priority >= parentPriority) {
        break;
      }
      this.indices[i] = this.indices[parent];
      this.priorities[i] = parentPriority;
      i = parent;
    }
    this.indices[i] = index;
    this.priorities[i] = priority;
  }

  pop() {
    if (this.length === 0) {
      this.lastPriority = Infinity;
      return -1;
    }
    const rootIndex = this.indices[0];
    const rootPriority = this.priorities[0];
    const tailIndex = this.indices[this.length - 1];
    const tailPriority = this.priorities[this.length - 1];
    this.length -= 1;
    let i = 0;
    const half = this.length >> 1;
    while (i < half) {
      let left = (i << 1) + 1;
      let right = left + 1;
      let best = left;
      if (right < this.length && this.priorities[right] < this.priorities[left]) {
        best = right;
      }
      if (this.priorities[best] >= tailPriority) {
        break;
      }
      this.indices[i] = this.indices[best];
      this.priorities[i] = this.priorities[best];
      i = best;
    }
    if (this.length > 0) {
      this.indices[i] = tailIndex;
      this.priorities[i] = tailPriority;
    }
    this.lastPriority = rootPriority;
    return rootIndex;
  }

  isEmpty() {
    return this.length === 0;
  }
}

function heuristic(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

function indexFor(cx, cz, cols) {
  return cz * cols + cx;
}

function reconstructPath(cameFromX, cameFromZ, startIndex, goalIndex, cols) {
  const path = [];
  let current = goalIndex;
  const safety = cameFromX.length + 4;
  let guard = 0;
  while (current !== -1 && guard < safety) {
    const cx = current % cols;
    const cz = (current - cx) / cols;
    path.push({ cx, cz });
    if (current === startIndex) {
      break;
    }
    const px = cameFromX[current];
    const pz = cameFromZ[current];
    if (px < 0 || pz < 0) {
      break;
    }
    current = indexFor(px, pz, cols);
    guard += 1;
  }
  path.reverse();
  return path;
}

const NEIGHBORS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: SQRT2 },
  { dx: -1, dz: 1, cost: SQRT2 },
  { dx: 1, dz: -1, cost: SQRT2 },
  { dx: -1, dz: -1, cost: SQRT2 }
];

export function findPath(grid, startCell, goalCell) {
  if (!grid || !startCell || !goalCell) {
    return [];
  }
  const cols = grid.cols | 0;
  const rows = grid.rows | 0;
  if (cols <= 0 || rows <= 0) {
    return [];
  }

  const startCx = Math.floor(startCell.cx);
  const startCz = Math.floor(startCell.cz);
  const goalCx = Math.floor(goalCell.cx);
  const goalCz = Math.floor(goalCell.cz);

  if (
    startCx < 0 || startCx >= cols || startCz < 0 || startCz >= rows ||
    goalCx < 0 || goalCx >= cols || goalCz < 0 || goalCz >= rows
  ) {
    return [];
  }

  const total = cols * rows;
  const gScore = new Float32Array(total);
  const fScore = new Float32Array(total);
  const cameFromX = new Int16Array(total);
  const cameFromZ = new Int16Array(total);
  const closed = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    gScore[i] = Infinity;
    fScore[i] = Infinity;
    cameFromX[i] = -1;
    cameFromZ[i] = -1;
    closed[i] = 0;
  }

  const startIndex = indexFor(startCx, startCz, cols);
  const goalIndex = indexFor(goalCx, goalCz, cols);

  gScore[startIndex] = 0;
  fScore[startIndex] = heuristic(startCx, startCz, goalCx, goalCz);

  const heap = new MinHeap(total);
  heap.push(startIndex, fScore[startIndex]);

  const walkable = grid.walk;
  const isWalkable = (cx, cz) => {
    if (cx === startCx && cz === startCz) return true;
    if (cx === goalCx && cz === goalCz) return true;
    if (cx < 0 || cx >= cols || cz < 0 || cz >= rows) return false;
    const row = walkable[cz];
    return Array.isArray(row) ? row[cx] === true : grid.isWalkable?.(cx, cz) === true;
  };

  while (!heap.isEmpty()) {
    const currentIndex = heap.pop();
    if (currentIndex === -1) {
      break;
    }
    if (heap.lastPriority > fScore[currentIndex] + 1e-4) {
      continue;
    }
    if (closed[currentIndex]) {
      continue;
    }
    closed[currentIndex] = 1;

    if (currentIndex === goalIndex) {
      return reconstructPath(cameFromX, cameFromZ, startIndex, goalIndex, cols);
    }

    const currentCx = currentIndex % cols;
    const currentCz = (currentIndex - currentCx) / cols;

    for (let i = 0; i < NEIGHBORS.length; i += 1) {
      const { dx, dz, cost } = NEIGHBORS[i];
      const neighborCx = currentCx + dx;
      const neighborCz = currentCz + dz;
      if (neighborCx < 0 || neighborCx >= cols || neighborCz < 0 || neighborCz >= rows) {
        continue;
      }
      if (!isWalkable(neighborCx, neighborCz)) {
        continue;
      }
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(currentCx + dx, currentCz) || !isWalkable(currentCx, currentCz + dz)) {
          continue;
        }
      }
      const neighborIndex = indexFor(neighborCx, neighborCz, cols);
      if (closed[neighborIndex]) {
        continue;
      }

      const tentative = gScore[currentIndex] + cost;
      if (tentative >= gScore[neighborIndex]) {
        continue;
      }

      cameFromX[neighborIndex] = currentCx;
      cameFromZ[neighborIndex] = currentCz;
      gScore[neighborIndex] = tentative;
      const h = heuristic(neighborCx, neighborCz, goalCx, goalCz);
      const f = tentative + h;
      fScore[neighborIndex] = f;
      heap.push(neighborIndex, f);
    }
  }

  return [];
}

export default findPath;
