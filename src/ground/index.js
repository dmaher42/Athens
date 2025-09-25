// src/ground/index.js
import * as THREE from 'three';
import { createDirtGround } from './dirt.js';
import { createGrassGround } from './grass.js';

/**
 * Enumerates available ground types.
 */
export const GroundType = Object.freeze({
  DIRT: 'dirt',
  GRASS: 'grass',
});

const DEFAULT_TILE_GRID = Object.freeze({ columns: 5, rows: 5 });

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
        enableDirt: false,
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
      enableDirt: false,
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
  } = tile;

  const vectorPosition = position ? toVector3(position) : toVector3({ x, y, z });

  return {
    size,
    repeat,
    position: vectorPosition,
    enableDirt: enableDirt ?? (dirt === true),
    enableGrass: enableGrass ?? (grass !== false),
    dirtOptions: dirtOptions && typeof dirtOptions === 'object' ? { ...dirtOptions } : undefined,
    grassOptions: grassOptions && typeof grassOptions === 'object' ? { ...grassOptions } : undefined,
    dirtName: dirtName ?? (name ? `${name}:dirt` : undefined),
    grassName: grassName ?? (name ? `${name}:grass` : undefined),
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

  tileDefinitions.forEach((tile, index) => {
    if (tile.enableDirt) {
      const dirt = createDirtGround({
        ...dirtOptions,
        ...(tile.dirtOptions ?? {}),
        size: tile.dirtOptions?.size ?? tile.size ?? dirtOptions.size ?? resolvedDefaultSize,
        repeat: tile.dirtOptions?.repeat ?? tile.repeat ?? dirtOptions.repeat ?? resolvedDefaultRepeat,
      });
      dirt.name = tile.dirtName ?? `ground:dirt:tile:${index}`;
      dirt.position.copy(tile.position);
      dirtLayer.add(dirt);
    }

    if (tile.enableGrass) {
      const grass = createGrassGround({
        ...grassOptions,
        ...(tile.grassOptions ?? {}),
        size: tile.grassOptions?.size ?? tile.size ?? grassOptions.size ?? resolvedDefaultSize,
        repeat: tile.grassOptions?.repeat ?? tile.repeat ?? grassOptions.repeat ?? resolvedDefaultRepeat,
      });
      grass.name = tile.grassName ?? `ground:grass:tile:${index}`;
      grass.position.copy(tile.position);
      grassLayer.add(grass);
    }
  });

  dirtLayer.visible = !!showDirt;
  grassLayer.visible = !!showGrass;

  return { root, dirt: dirtLayer, grass: grassLayer };
}
