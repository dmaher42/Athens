// src/ground/index.js
import * as THREE from 'three';
import { createDirtGround, createDirtMaterial } from './dirt.js';
import { createGrassGround } from './grass.js';

/**
 * Enumerates available ground types.
 */
export const GroundType = Object.freeze({
  DIRT: 'dirt',
  GRASS: 'grass',
});

const DEFAULT_TILE_GRID = Object.freeze({ columns: 5, rows: 5 });

const SKIRT_MIN_DELTA = 0.03;
const SKIRT_THICKNESS = 0.02;
const SKIRT_EDGE_TOLERANCE_RATIO = 0.005;
const SKIRT_POSITION_TOLERANCE_MIN = 0.05;
const SKIRT_POSITION_TOLERANCE_MAX = 2;

const FOUNDATION_BLEND_RING_OFFSET = 0.03;
const FOUNDATION_BLEND_RING_WIDTH_RATIO = 0.08;
const FOUNDATION_BLEND_RING_MIN_WIDTH = 0.25;
const FOUNDATION_BLEND_RING_SEGMENTS = 48;

function toVector3(position) {
  if (position instanceof THREE.Vector3) {
    return position.clone();
  }

  if (Array.isArray(position)) {
    const [x = 0, y = 0, z = 0] = position;
    return new THREE.Vector3(x, y, z);
  }

  const source = position && typeof position === 'object' ? position : {};
  const { x = 0, y = 0, z = 0 } = source;
  return new THREE.Vector3(x, y, z);
}

function parseSpacing(spacing) {
  if (typeof spacing === 'number') {
    return { x: spacing, z: spacing };
  }

  if (spacing && typeof spacing === 'object') {
    const { x = 0, z = 0 } = spacing;
    return {
      x: typeof x === 'number' ? x : 0,
      z: typeof z === 'number' ? z : 0,
    };
  }

  return { x: 0, z: 0 };
}

function createGridTiles({
  grid,
  size,
  repeat,
  spacing,
}) {
  const columns = Math.max(1, Math.floor(grid?.columns ?? grid?.x ?? 1));
  const rows = Math.max(1, Math.floor(grid?.rows ?? grid?.z ?? 1));
  const { x: spacingX, z: spacingZ } = parseSpacing(spacing);

  const tiles = [];
  const stepX = size + spacingX;
  const stepZ = size + spacingZ;
  const offsetX = ((columns - 1) * stepX) / 2;
  const offsetZ = ((rows - 1) * stepZ) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = col * stepX - offsetX;
      const z = row * stepZ - offsetZ;

      tiles.push({
        size,
        repeat,
        position: new THREE.Vector3(x, 0, z),
        enableDirt: true,
        enableGrass: true,
      });
    }
  }

  return tiles;
}

function normalizeTile(tile, { defaultSize, defaultRepeat }) {
  if (!tile || typeof tile !== 'object') {
    return {
      size: defaultSize,
      repeat: defaultRepeat,
      position: new THREE.Vector3(),
      enableDirt: true,
      enableGrass: true,
    };
  }

  const {
    size = defaultSize,
    repeat = defaultRepeat,
    position,
    x,
    y,
    z,
    enableDirt,
    enableGrass,
    dirt,
    grass,
    dirtOptions,
    grassOptions,
    dirtName,
    grassName,
    name,
    disableUnderBuilding,
    addFoundationBlendRing,
  } = tile;

  const vectorPosition = position ? toVector3(position) : toVector3({ x, y, z });

  return {
    size,
    repeat,
    position: vectorPosition,
    enableDirt: enableDirt ?? (dirt !== false),
    enableGrass: enableGrass ?? (grass !== false),
    dirtOptions: dirtOptions && typeof dirtOptions === 'object' ? { ...dirtOptions } : undefined,
    grassOptions: grassOptions && typeof grassOptions === 'object' ? { ...grassOptions } : undefined,
    dirtName: dirtName ?? (name ? `${name}:dirt` : undefined),
    grassName: grassName ?? (name ? `${name}:grass` : undefined),
    disableUnderBuilding: Boolean(disableUnderBuilding),
    addFoundationBlendRing: typeof addFoundationBlendRing === 'boolean' ? addFoundationBlendRing : undefined,
  };
}

function buildTileDefinitions({
  tiles,
  tileGrid,
  tileSize,
  tileRepeat,
  tileSpacing,
  defaultSize,
  defaultRepeat,
}) {
  const effectiveSize = typeof tileSize === 'number' ? tileSize : defaultSize;
  const effectiveRepeat = typeof tileRepeat === 'number' ? tileRepeat : defaultRepeat;

  let definitions = [];

  if (Array.isArray(tiles) && tiles.length > 0) {
    definitions = tiles.map(t => normalizeTile(t, { defaultSize: effectiveSize, defaultRepeat: effectiveRepeat }));
  } else {
    const gridTiles = createGridTiles({
      grid: tileGrid ?? DEFAULT_TILE_GRID,
      size: effectiveSize,
      repeat: effectiveRepeat,
      spacing: tileSpacing,
    });
    definitions = gridTiles.map(t => normalizeTile(t, { defaultSize: effectiveSize, defaultRepeat: effectiveRepeat }));
  }

  if (definitions.length === 0) {
    definitions.push(normalizeTile({}, { defaultSize, defaultRepeat }));
  }

  return definitions;
}

/**
 * Builds a layered ground group containing separate dirt and grass groups.
 * You can toggle visibility on each layer independently.
 *
 * @param {Object} options
 * @param {Object} [options.dirtOptions]  - Options passed to createDirtGround
 * @param {Object} [options.grassOptions] - Options passed to createGrassGround
 * @param {boolean} [options.showDirt=true]
 * @param {boolean} [options.showGrass=true]
 * @param {Object[]} [options.tiles]      - Explicit tile definitions. If omitted a grid will be generated.
 * @param {{ columns?: number, rows?: number }} [options.tileGrid] - Grid size when generating tiles. Defaults to 5x5.
 * @param {number} [options.tileSize]     - Base tile size (used for generated tiles and as fallback for explicit tiles).
 * @param {number} [options.tileRepeat]   - Base texture repeat for generated tiles.
 * @param {number|{x?:number,z?:number}} [options.tileSpacing=0] - Gap/overlap between generated tiles.
 * @param {boolean} [options.addElevationSkirts=false] - Adds skirts between tiles with height differences.
 * @param {boolean} [options.addFoundationBlendRing=false] - Adds optional blend ring when dirt is disabled.
 * @returns {{ root: THREE.Group, dirt: THREE.Group, grass: THREE.Group }}
 */
export function createGroundLayered({
  dirtOptions = {},
  grassOptions = {},
  showDirt = true,
  showGrass = true,
  tiles,
  tileGrid,
  tileSize,
  tileRepeat,
  tileSpacing = 0,
  addElevationSkirts = false,
  addFoundationBlendRing = false,
} = {}) {
  const root = new THREE.Group();
  root.name = 'ground:root';

  const dirtLayer = new THREE.Group();
  dirtLayer.name = 'ground:dirt';

  const grassLayer = new THREE.Group();
  grassLayer.name = 'ground:grass';

  root.add(dirtLayer);
  root.add(grassLayer);

  const defaultSize =
    (typeof tileSize === 'number' && tileSize > 0) ? tileSize :
    (typeof grassOptions.size === 'number' ? grassOptions.size : dirtOptions.size);

  const resolvedDefaultSize = typeof defaultSize === 'number' ? defaultSize : 200;

  const defaultRepeat =
    (typeof tileRepeat === 'number' && tileRepeat > 0) ? tileRepeat :
    (typeof grassOptions.repeat === 'number' ? grassOptions.repeat : dirtOptions.repeat);

  const resolvedDefaultRepeat = typeof defaultRepeat === 'number' ? defaultRepeat : 16;

  const tileDefinitions = buildTileDefinitions({
    tiles,
    tileGrid,
    tileSize: resolvedDefaultSize,
    tileRepeat: resolvedDefaultRepeat,
    tileSpacing,
    defaultSize: resolvedDefaultSize,
    defaultRepeat: resolvedDefaultRepeat,
  });

  const tileInstances = tileDefinitions.map((tile, index) => ({
    index,
    definition: tile,
    position: tile.position.clone(),
    disableUnderBuilding: !!tile.disableUnderBuilding,
    addFoundationBlendRing: tile.addFoundationBlendRing,
    dirtGroup: null,
    dirtMesh: null,
    dirtHeight: 0,
    dirtSize: undefined,
    coverageSize: tile.size ?? resolvedDefaultSize,
    surfaceY: tile.position.y,
    bounds: null,
  }));

  tileDefinitions.forEach((tile, index) => {
    const instance = tileInstances[index];

    const fallbackSize = tile.size ?? resolvedDefaultSize;
    const fallbackRepeat = tile.repeat ?? resolvedDefaultRepeat;

    const dirtConfig = {
      ...dirtOptions,
      ...(tile.dirtOptions ?? {}),
      size: tile.dirtOptions?.size ?? fallbackSize ?? resolvedDefaultSize,
      repeat: tile.dirtOptions?.repeat ?? fallbackRepeat ?? resolvedDefaultRepeat,
    };

    const grassConfig = {
      ...grassOptions,
      ...(tile.grassOptions ?? {}),
      size: tile.grassOptions?.size ?? fallbackSize ?? resolvedDefaultSize,
      repeat: tile.grassOptions?.repeat ?? fallbackRepeat ?? resolvedDefaultRepeat,
    };

    const baseDirtHeight = typeof dirtConfig.height === 'number' ? dirtConfig.height : 0;

    if (!tile.disableUnderBuilding && tile.enableDirt) {
      const dirt = createDirtGround(dirtConfig);
      dirt.name = tile.dirtName ?? `ground:dirt:tile:${index}`;
      dirt.position.copy(tile.position);
      dirtLayer.add(dirt);

      instance.dirtGroup = dirt;
      instance.dirtMesh = dirt.children.find(child => child?.isMesh);
      instance.dirtHeight = baseDirtHeight;
      instance.dirtSize = dirtConfig.size;
      instance.surfaceY = tile.position.y + baseDirtHeight;
    } else {
      instance.surfaceY = tile.position.y + baseDirtHeight;
    }

    if (!tile.disableUnderBuilding && tile.enableGrass) {
      const grass = createGrassGround(grassConfig);
      grass.name = tile.grassName ?? `ground:grass:tile:${index}`;
      grass.position.copy(tile.position);
      grassLayer.add(grass);
    }

    instance.coverageSize = instance.dirtSize ?? fallbackSize ?? resolvedDefaultSize;
    instance.bounds = computeTileBounds(tile.position, instance.coverageSize);

    if (tile.disableUnderBuilding && addFoundationBlendRing) {
      const allowBlend = instance.addFoundationBlendRing ?? true;
      if (allowBlend) {
        const ringRepeat = typeof dirtConfig.repeat === 'number'
          ? Math.max(1, dirtConfig.repeat / 2)
          : dirtConfig.repeat;
        const blendRing = createFoundationBlendRingMesh({
          size: instance.coverageSize,
          repeat: ringRepeat,
          anisotropy: dirtConfig.anisotropy,
        });
        if (blendRing) {
          const surfaceOffset = instance.surfaceY - tile.position.y;
          blendRing.name = tile.dirtName
            ? `${tile.dirtName}:foundationBlendRing`
            : `ground:dirt:foundationBlendRing:${index}`;
          blendRing.position.set(
            tile.position.x,
            tile.position.y + surfaceOffset + FOUNDATION_BLEND_RING_OFFSET,
            tile.position.z,
          );
          dirtLayer.add(blendRing);
        }
      }
    }
  });

  if (addElevationSkirts) {
    applyElevationSkirts(tileInstances);
  }

  dirtLayer.visible = !!showDirt;
  grassLayer.visible = !!showGrass;

  return { root, dirt: dirtLayer, grass: grassLayer };
}

function computeTileBounds(position, size) {
  const effectiveSize = typeof size === 'number' ? size : 0;
  const half = effectiveSize / 2;
  return {
    minX: position.x - half,
    maxX: position.x + half,
    minZ: position.z - half,
    maxZ: position.z + half,
  };
}

const SKIRT_DIRECTIONS = [
  {
    key: 'east',
    axis: 'x',
    dir: 1,
    axisCoord: 'x',
    perpCoord: 'z',
    axisMin: 'minX',
    axisMax: 'maxX',
    perpMin: 'minZ',
    perpMax: 'maxZ',
  },
  {
    key: 'west',
    axis: 'x',
    dir: -1,
    axisCoord: 'x',
    perpCoord: 'z',
    axisMin: 'minX',
    axisMax: 'maxX',
    perpMin: 'minZ',
    perpMax: 'maxZ',
  },
  {
    key: 'south',
    axis: 'z',
    dir: 1,
    axisCoord: 'z',
    perpCoord: 'x',
    axisMin: 'minZ',
    axisMax: 'maxZ',
    perpMin: 'minX',
    perpMax: 'maxX',
  },
  {
    key: 'north',
    axis: 'z',
    dir: -1,
    axisCoord: 'z',
    perpCoord: 'x',
    axisMin: 'minZ',
    axisMax: 'maxZ',
    perpMin: 'minX',
    perpMax: 'maxX',
  },
];

function findNeighborForDirection(instances, tile, direction) {
  const bounds = tile.bounds;
  if (!bounds) return null;

  const targetEdge = direction.dir > 0 ? bounds[direction.axisMax] : bounds[direction.axisMin];

  let best = null;

  for (const candidate of instances) {
    if (candidate === tile || !candidate.bounds) continue;

    const candidateEdge = direction.dir > 0
      ? candidate.bounds[direction.axisMin]
      : candidate.bounds[direction.axisMax];

    const sizeForTolerance = Math.max(tile.coverageSize ?? 0, candidate.coverageSize ?? 0);
    const tolerance = Math.max(
      SKIRT_POSITION_TOLERANCE_MIN,
      Math.min(SKIRT_POSITION_TOLERANCE_MAX, sizeForTolerance * SKIRT_EDGE_TOLERANCE_RATIO),
    );

    const distance = Math.abs(candidateEdge - targetEdge);
    if (distance > tolerance) continue;

    const overlapMin = Math.max(bounds[direction.perpMin], candidate.bounds[direction.perpMin]);
    const overlapMax = Math.min(bounds[direction.perpMax], candidate.bounds[direction.perpMax]);
    const overlapLength = overlapMax - overlapMin;
    if (overlapLength <= 0) continue;

    if (
      !best ||
      overlapLength > best.overlapLength ||
      (Math.abs(overlapLength - best.overlapLength) < 1e-6 && distance < best.distance)
    ) {
      best = {
        instance: candidate,
        overlapMin,
        overlapMax,
        overlapLength,
        distance,
      };
    }
  }

  return best;
}

function applyElevationSkirts(instances) {
  instances.forEach((tile) => {
    if (!tile?.dirtGroup || !tile.bounds) return;

    const baseMesh = tile.dirtMesh ?? tile.dirtGroup.children.find(child => child?.isMesh);
    if (!baseMesh?.material) return;

    const skirtMaterial = baseMesh.material.clone();
    skirtMaterial.side = THREE.DoubleSide;
    skirtMaterial.polygonOffset = true;
    skirtMaterial.polygonOffsetFactor = 1;
    skirtMaterial.polygonOffsetUnits = 1;
    skirtMaterial.color?.multiplyScalar?.(0.9);

    SKIRT_DIRECTIONS.forEach((direction) => {
      const neighborInfo = findNeighborForDirection(instances, tile, direction);
      if (!neighborInfo) return;

      const neighbor = neighborInfo.instance;
      const tileSurface = typeof tile.surfaceY === 'number'
        ? tile.surfaceY
        : tile.position?.y ?? 0;
      const neighborSurface = typeof neighbor.surfaceY === 'number'
        ? neighbor.surfaceY
        : neighbor.position?.y ?? 0;
      const height = tileSurface - neighborSurface;
      if (!(height > SKIRT_MIN_DELTA)) return;

      const length = neighborInfo.overlapLength;
      if (!(length > 0.001)) return;

      const width = direction.axis === 'x' ? SKIRT_THICKNESS : length;
      const depth = direction.axis === 'x' ? length : SKIRT_THICKNESS;
      const geometry = new THREE.BoxGeometry(width, height, depth);

      const mesh = new THREE.Mesh(geometry, skirtMaterial);
      mesh.castShadow = baseMesh.castShadow;
      mesh.receiveShadow = baseMesh.receiveShadow;
      mesh.name = `${baseMesh.name || 'ground:dirt'}:skirt:${direction.key}:${tile.index}`;

      const tilePosition = tile.position;
      const bounds = tile.bounds;
      const overlapCenter = neighborInfo.overlapMin + (neighborInfo.overlapLength / 2);

      const axisThickness = direction.axis === 'x' ? width : depth;
      const axisEdgeWorld = direction.dir > 0
        ? bounds[direction.axisMax] - (axisThickness / 2)
        : bounds[direction.axisMin] + (axisThickness / 2);

      const centerAxisLocal = axisEdgeWorld - tilePosition[direction.axisCoord];
      const centerPerpLocal = overlapCenter - tilePosition[direction.perpCoord];

      const bottomLocal = neighborSurface - tilePosition.y;
      const centerYLocal = bottomLocal + (height / 2);

      if (direction.axis === 'x') {
        mesh.position.set(centerAxisLocal, centerYLocal, centerPerpLocal);
      } else {
        mesh.position.set(centerPerpLocal, centerYLocal, centerAxisLocal);
      }

      tile.dirtGroup.add(mesh);
    });
  });
}

function createFoundationBlendRingMesh({ size, repeat, anisotropy } = {}) {
  if (!(size > 0)) return null;

  const outerRadius = size / 2;
  const ringWidth = Math.min(
    outerRadius,
    Math.max(FOUNDATION_BLEND_RING_MIN_WIDTH, outerRadius * FOUNDATION_BLEND_RING_WIDTH_RATIO),
  );
  const innerRadius = outerRadius - ringWidth;
  if (!(innerRadius > 0)) return null;

  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, FOUNDATION_BLEND_RING_SEGMENTS);
  const material = createDirtMaterial({ repeat, anisotropy });
  material.side = THREE.DoubleSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
  material.color?.multiplyScalar?.(0.92);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
}
