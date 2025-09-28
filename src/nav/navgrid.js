import * as THREE from 'three';

const DOWN_VECTOR = new THREE.Vector3(0, -1, 0);
const RAY_ORIGIN = new THREE.Vector3();

const DEFAULT_BOUNDS = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
const SAMPLE_HEIGHT = 800;
const SLOPE_LIMIT_DEGREES = 25;
const SLOPE_THRESHOLD = Math.tan(THREE.MathUtils.degToRad(SLOPE_LIMIT_DEGREES));
const HEIGHT_TOLERANCE = 0.01;

function normalizeBounds(bounds) {
  if (!bounds) return { ...DEFAULT_BOUNDS };
  const { minX = DEFAULT_BOUNDS.minX, maxX = DEFAULT_BOUNDS.maxX, minZ = DEFAULT_BOUNDS.minZ, maxZ = DEFAULT_BOUNDS.maxZ } = bounds;
  const loX = Number.isFinite(minX) ? minX : DEFAULT_BOUNDS.minX;
  const hiX = Number.isFinite(maxX) ? maxX : DEFAULT_BOUNDS.maxX;
  const loZ = Number.isFinite(minZ) ? minZ : DEFAULT_BOUNDS.minZ;
  const hiZ = Number.isFinite(maxZ) ? maxZ : DEFAULT_BOUNDS.maxZ;
  return { minX: Math.min(loX, hiX), maxX: Math.max(loX, hiX), minZ: Math.min(loZ, hiZ), maxZ: Math.max(loZ, hiZ) };
}

function buildColliderData(colliders = []) {
  const items = [];
  for (let i = 0; i < colliders.length; i += 1) {
    const entry = colliders[i];
    const box = entry?.box || entry;
    if (!box || !box.isBox3) continue;
    const expanded = box.clone();
    expanded.expandByScalar(0.3);
    items.push({
      minX: expanded.min.x,
      maxX: expanded.max.x,
      minY: expanded.min.y,
      maxY: expanded.max.y,
      minZ: expanded.min.z,
      maxZ: expanded.max.z
    });
  }
  return items;
}

function sampleHeight(raycaster, meshes, x, z) {
  if (!meshes || meshes.length === 0) {
    return Number.NaN;
  }
  RAY_ORIGIN.set(x, SAMPLE_HEIGHT, z);
  raycaster.set(RAY_ORIGIN, DOWN_VECTOR);
  raycaster.far = SAMPLE_HEIGHT * 2;
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits || hits.length === 0) {
    return Number.NaN;
  }
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (hit && Number.isFinite(hit.point?.y)) {
      return hit.point.y;
    }
  }
  return Number.NaN;
}

function intersectsCollider(colliders, cellMinX, cellMaxX, cellMinZ, cellMaxZ, height) {
  if (!colliders || colliders.length === 0) {
    return false;
  }
  for (let i = 0; i < colliders.length; i += 1) {
    const collider = colliders[i];
    if (!collider) continue;
    if (cellMaxX < collider.minX || cellMinX > collider.maxX) continue;
    if (cellMaxZ < collider.minZ || cellMinZ > collider.maxZ) continue;
    const verticalOverlap = !Number.isFinite(height)
      ? true
      : (height + 1.0) >= collider.minY && (height - 1.0) <= collider.maxY;
    if (verticalOverlap) {
      return true;
    }
  }
  return false;
}

export function buildNavGrid({
  groundMeshes = [],
  colliderAABBs = [],
  bounds = DEFAULT_BOUNDS,
  cell = 2.0
} = {}) {
  const effectiveCell = Number.isFinite(cell) && cell > 0.2 ? cell : 2.0;
  const { minX, maxX, minZ, maxZ } = normalizeBounds(bounds);
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cols = Math.max(1, Math.ceil(width / effectiveCell));
  const rows = Math.max(1, Math.ceil(depth / effectiveCell));

  const walk = new Array(rows);
  const heights = new Array(rows);
  for (let r = 0; r < rows; r += 1) {
    walk[r] = new Array(cols).fill(true);
    heights[r] = new Array(cols).fill(Number.NaN);
  }

  const colliderData = buildColliderData(Array.isArray(colliderAABBs) ? colliderAABBs : []);
  const raycaster = new THREE.Raycaster();
  const ground = Array.isArray(groundMeshes) ? groundMeshes : [];
  const origin = { x: minX, z: minZ };
  const halfCell = effectiveCell * 0.5;

  for (let row = 0; row < rows; row += 1) {
    const wz = origin.z + (row + 0.5) * effectiveCell;
    for (let col = 0; col < cols; col += 1) {
      const wx = origin.x + (col + 0.5) * effectiveCell;
      const height = sampleHeight(raycaster, ground, wx, wz);
      if (!Number.isFinite(height)) {
        walk[row][col] = false;
        heights[row][col] = Number.NaN;
        continue;
      }
      heights[row][col] = height;
      const minXCell = wx - halfCell;
      const maxXCell = wx + halfCell;
      const minZCell = wz - halfCell;
      const maxZCell = wz + halfCell;
      if (intersectsCollider(colliderData, minXCell, maxXCell, minZCell, maxZCell, height)) {
        walk[row][col] = false;
      }
    }
  }

  const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1]
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!walk[row][col]) {
        continue;
      }
      const baseHeight = heights[row][col];
      if (!Number.isFinite(baseHeight)) {
        walk[row][col] = false;
        continue;
      }
      for (let i = 0; i < neighborOffsets.length; i += 1) {
        const [dx, dz] = neighborOffsets[i];
        const nz = row + dz;
        const nx = col + dx;
        if (nz < 0 || nz >= rows || nx < 0 || nx >= cols) {
          walk[row][col] = false;
          break;
        }
        const neighborHeight = heights[nz][nx];
        if (!Number.isFinite(neighborHeight)) {
          walk[row][col] = false;
          break;
        }
        const horizontal = Math.sqrt(dx * dx + dz * dz) * effectiveCell;
        if (horizontal <= HEIGHT_TOLERANCE) {
          continue;
        }
        const slope = Math.abs(neighborHeight - baseHeight) / horizontal;
        if (!Number.isFinite(slope) || slope > SLOPE_THRESHOLD) {
          walk[row][col] = false;
          break;
        }
      }
    }
  }

  const grid = {
    cell: effectiveCell,
    cols,
    rows,
    origin,
    walk,
    heights,
    worldToCell(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return null;
      }
      const localX = x - origin.x;
      const localZ = z - origin.z;
      const cx = Math.floor(localX / effectiveCell);
      const cz = Math.floor(localZ / effectiveCell);
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) {
        return null;
      }
      return { cx, cz };
    },
    cellToWorld(cx, cz) {
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
        return null;
      }
      const icx = Math.floor(cx);
      const icz = Math.floor(cz);
      if (icx < 0 || icx >= cols || icz < 0 || icz >= rows) {
        return null;
      }
      const height = heights[icz][icx];
      if (!Number.isFinite(height)) {
        return null;
      }
      const wx = origin.x + (icx + 0.5) * effectiveCell;
      const wz = origin.z + (icz + 0.5) * effectiveCell;
      return new THREE.Vector3(wx, height, wz);
    },
    isWalkable(cx, cz) {
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
        return false;
      }
      const icx = Math.floor(cx);
      const icz = Math.floor(cz);
      if (icx < 0 || icx >= cols || icz < 0 || icz >= rows) {
        return false;
      }
      return walk[icz][icx] === true;
    },
    setWalkable(cx, cz, value) {
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
        return;
      }
      const icx = Math.floor(cx);
      const icz = Math.floor(cz);
      if (icx < 0 || icx >= cols || icz < 0 || icz >= rows) {
        return;
      }
      walk[icz][icx] = Boolean(value);
    }
  };

  return grid;
}

export default buildNavGrid;
