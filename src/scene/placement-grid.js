const DEFAULT_CELL_SIZE = 25;

function toFinite(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toIndex(value, cellSize) {
  return Math.floor(value / cellSize);
}

export function estimateAABB(center, dims = {}, rotationY = 0) {
  const cx = toFinite(center?.x);
  const cz = toFinite(center?.z);
  const width = Math.max(0, toFinite(dims.width));
  const depth = Math.max(0, toFinite(dims.depth));
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;

  if (halfWidth === 0 && halfDepth === 0) {
    return { minX: cx, maxX: cx, minZ: cz, maxZ: cz };
  }

  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const halfX = Math.abs(halfWidth * cos) + Math.abs(halfDepth * sin);
  const halfZ = Math.abs(halfWidth * sin) + Math.abs(halfDepth * cos);

  return {
    minX: cx - halfX,
    maxX: cx + halfX,
    minZ: cz - halfZ,
    maxZ: cz + halfZ
  };
}

export class GridIndex {
  constructor(cellSize = DEFAULT_CELL_SIZE) {
    const size = Number.isFinite(cellSize) && cellSize > 0 ? Number(cellSize) : DEFAULT_CELL_SIZE;
    this.cellSize = size;
    this._cells = new Map();
  }

  _forEachCell(aabb, callback) {
    if (!aabb) {
      return;
    }

    const rangeX = { start: toIndex(aabb.minX, this.cellSize), end: toIndex(aabb.maxX, this.cellSize) };
    const rangeZ = { start: toIndex(aabb.minZ, this.cellSize), end: toIndex(aabb.maxZ, this.cellSize) };

    for (let ix = rangeX.start; ix <= rangeX.end; ix += 1) {
      for (let iz = rangeZ.start; iz <= rangeZ.end; iz += 1) {
        callback(ix, iz);
      }
    }
  }

  insert(aabb, id) {
    if (!Number.isInteger(id)) {
      return;
    }

    this._forEachCell(aabb, (ix, iz) => {
      const key = `${ix},${iz}`;
      let bucket = this._cells.get(key);
      if (!bucket) {
        bucket = new Set();
        this._cells.set(key, bucket);
      }
      bucket.add(id);
    });
  }

  query(aabb) {
    const results = new Set();
    this._forEachCell(aabb, (ix, iz) => {
      const key = `${ix},${iz}`;
      const bucket = this._cells.get(key);
      if (bucket) {
        bucket.forEach((id) => results.add(id));
      }
    });
    return Array.from(results);
  }
}
