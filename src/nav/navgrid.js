import * as THREE from 'three';
import { runIdleChunks } from '../utils/idle.js';

const DEFAULT_CELL_SIZE = 2;
const DEFAULT_CHUNK_SIZE = 60;

function createNavGridComputation(navMesh, options = {}) {
  if (!navMesh || typeof navMesh.projectPoint !== 'function' || !navMesh.bounds) {
    return null;
  }

  const bounds = navMesh.bounds;
  const cellSize = Math.max(0.25, Number(options.cellSize) || DEFAULT_CELL_SIZE);
  const chunkSize = Math.max(1, Math.floor(Number(options.chunkSize) || DEFAULT_CHUNK_SIZE));
  const originX = bounds.min?.x ?? 0;
  const originZ = bounds.min?.z ?? 0;
  const width = Math.max(1, Math.ceil(((bounds.max?.x ?? originX) - originX) / cellSize));
  const height = Math.max(1, Math.ceil(((bounds.max?.z ?? originZ) - originZ) / cellSize));
  const totalCells = width * height;

  const walkable = new Uint8Array(totalCells);
  const heights = new Float32Array(totalCells);
  const triangles = new Int32Array(totalCells);
  triangles.fill(-1);

  const samplePoint = new THREE.Vector3();
  const projectedPoint = new THREE.Vector3();
  const steps = [];
  let processed = 0;

  const notifyProgress = (count) => {
    processed += count;
    if (typeof options.onProgress === 'function' && totalCells > 0) {
      try {
        options.onProgress(Math.min(1, processed / totalCells), processed, totalCells);
      } catch (error) {
        console.error('[navgrid] progress callback failed', error);
      }
    }
  };

  for (let tileY = 0; tileY < height; tileY += chunkSize) {
    for (let tileX = 0; tileX < width; tileX += chunkSize) {
      const startX = tileX;
      const startY = tileY;
      const endX = Math.min(width, tileX + chunkSize);
      const endY = Math.min(height, tileY + chunkSize);
      const cellsInTile = (endX - startX) * (endY - startY);

      steps.push(() => {
        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const index = y * width + x;
            const worldX = originX + (x + 0.5) * cellSize;
            const worldZ = originZ + (y + 0.5) * cellSize;
            const worldY = (bounds.max?.y ?? 0) + 10;
            samplePoint.set(worldX, worldY, worldZ);
            const result = navMesh.projectPoint(samplePoint, projectedPoint);
            if (result && result.triangleIndex !== -1 && projectedPoint) {
              walkable[index] = 1;
              triangles[index] = result.triangleIndex;
              heights[index] = projectedPoint.y;
            } else {
              walkable[index] = 0;
              triangles[index] = -1;
              heights[index] = bounds.min?.y ?? 0;
            }
          }
        }
        notifyProgress(cellsInTile);
      });
    }
  }

  const grid = {
    cellSize,
    width,
    height,
    origin: { x: originX, z: originZ },
    bounds: {
      min: bounds.min?.clone ? bounds.min.clone() : new THREE.Vector3(bounds.min?.x ?? 0, bounds.min?.y ?? 0, bounds.min?.z ?? 0),
      max: bounds.max?.clone ? bounds.max.clone() : new THREE.Vector3(bounds.max?.x ?? 0, bounds.max?.y ?? 0, bounds.max?.z ?? 0)
    },
    walkable,
    heights,
    triangles,
    totalCells,
    getIndex(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
        return -1;
      }
      return y * this.width + x;
    },
    getCell(x, y) {
      const index = this.getIndex(x, y);
      if (index === -1) {
        return null;
      }
      return {
        walkable: Boolean(this.walkable[index]),
        height: this.heights[index],
        triangle: this.triangles[index]
      };
    },
    getWorldPosition(x, y, target = new THREE.Vector3()) {
      const index = this.getIndex(x, y);
      if (index === -1) {
        return null;
      }
      target.set(
        this.origin.x + (x + 0.5) * this.cellSize,
        this.heights[index],
        this.origin.z + (y + 0.5) * this.cellSize
      );
      return target;
    }
  };

  return { grid, steps, totalCells };
}

export function buildNavGrid(options = {}) {
  const computation = createNavGridComputation(options.navMesh, options);
  if (!computation) {
    return null;
  }
  for (const step of computation.steps) {
    try {
      step();
    } catch (error) {
      console.error('[navgrid] step error', error);
    }
  }
  return computation.grid;
}

export function buildNavGridChunked(options = {}) {
  const computation = createNavGridComputation(options.navMesh, options);
  if (!computation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const steps = [...computation.steps, () => resolve(computation.grid)];
    runIdleChunks(steps);
  });
}
