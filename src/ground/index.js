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
const BUILDING_NAME_PATTERN = /(foundation|building|pad)/i;
const BUILDING_USERDATA_KEYS = ['building', 'buildingPad', 'foundation', 'isBuilding', 'isFoundation'];

// Skirt tuning values (world units).
const SKIRT_MIN_DELTA = 0.03;
const SKIRT_THICKNESS = 0.02;
const SKIRT_EDGE_TOLERANCE_RATIO = 0.005;
const SKIRT_POSITION_TOLERANCE_MIN = 0.05;
const SKIRT_POSITION_TOLERANCE_MAX = 2;

// Foundation blend ring config
const FOUNDATION_BLEND_RING_OFFSET = 0.03;
const FOUNDATION_BLEND_RING_WIDTH_RATIO = 0.08;
const FOUNDATION_BLEND_RING_MIN_WIDTH = 0.25;
const FOUNDATION_BLEND_RING_SEGMENTS = 48;

const SKIRT_MATERIAL_CACHE = new WeakMap();
const FOUNDATION_BLEND_RING_MATERIAL_CACHE = new Map();

function toVector3(position) {
  if (position instanceof THREE.Vector3) return position.clone();
  if (Array.isArray(position)) {
    const [x = 0, y = 0, z = 0] = position;
    return new THREE.Vector3(x, y, z);
  }
  const source = position && typeof position === 'object' ? position : {};
  const { x = 0, y = 0, z = 0 } = source;
  return new THREE.Vector3(x, y, z);
}

function parseSpacing(spacing) {
  if (typeof spacing === 'number') return { x: spacing, z: spacing };
  if (spacing && typeof spacing === 'object') {
    const { x = 0, z = 0 } = spacing;
    return { x: typeof x === 'number' ? x : 0, z: typeof z === 'number' ? z : 0 };
  }
  return { x: 0, z: 0 };
}

function createGridTiles({ grid, size, repeat, spacing }) {
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
        gridX: col,
        gridZ: row,
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
      gridX: undefined,
      gridZ: undefined,
      disableUnderBuilding: false,
      addFoundationBlendRing: undefined,
    };
  }

  const {
    size = defaultSize,
    repeat = defaultRepeat,
    position,
    x, y, z,
    enableDirt,
    enableGrass,
    dirt,
    grass,
    dirtOptions,
    grassOptions,
    dirtName,
    grassName,
    name,
    gridX,
    gridZ,
    disableUnderBuilding,
    addFoundationBlendRing,
    foundationBlendOptions,
    userData,
    objects,
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
    gridX: typeof gridX === 'number' ? gridX : undefined,
    gridZ: typeof gridZ === 'number' ? gridZ : undefined,
    disableUnderBuilding: Boolean(disableUnderBuilding),
    addFoundationBlendRing: typeof addFoundationBlendRing === 'boolean' ? addFoundationBlendRing : undefined,
    foundationBlendOptions:
      foundationBlendOptions && typeof foundationBlendOptions === 'object'
        ? { ...foundationBlendOptions }
        : undefined,
    userData: userData && typeof userData === 'object' ? { ...userData } : undefined,
    objects: Array.isArray(objects) ? objects : undefined,
    name: typeof name === 'string' ? name : undefined,
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
    definitions = tiles
      .map(t => normalizeTile(t, { defaultSize: effectiveSize, defaultRepeat: effectiveRepeat }))
      .map((tile, index) => ({
        ...tile,
        gridX: typeof tile.gridX === 'number' ? tile.gridX : index,
        gridZ: typeof tile.gridZ === 'number' ? tile.gridZ : 0,
      }));
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

function hasBuildingFlag(userData) {
  if (!userData || typeof userData !== 'object') return false;
  return BUILDING_USERDATA_KEYS.some((key) => userData[key]);
}

function shouldDisableTileGround(tile) {
  if (!tile || typeof tile !== 'object') return false;

  if (tile.disableUnderBuilding === true) return true;
  if (hasBuildingFlag(tile.userData)) return true;
  if (hasBuildingFlag(tile.dirtOptions?.userData) || hasBuildingFlag(tile.grassOptions?.userData)) return true;

  const namesToCheck = [tile.name, tile.dirtName, tile.grassName, tile.dirtOptions?.name, tile.grassOptions?.name];
  if (namesToCheck.some((v) => typeof v === 'string' && BUILDING_NAME_PATTERN.test(v))) return true;

  if (Array.isArray(tile.objects)) {
    for (const obj of tile.objects) {
      if (!obj) continue;
      if (hasBuildingFlag(obj.userData)) return true;
      if (typeof obj.name === 'string' && BUILDING_NAME_PATTERN.test(obj.name)) return true;
    }
  }

  return false;
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
  { key: 'east',  axis: 'x', dir:  1, axisCoord: 'x', perpCoord: 'z', axisMin: 'minX', axisMax: 'maxX', perpMin: 'minZ', perpMax: 'maxZ' },
  { key: 'west',  axis: 'x', dir: -1, axisCoord: 'x', perpCoord: 'z', axisMin: 'minX', axisMax: 'maxX', perpMin: 'minZ', perpMax: 'maxZ' },
  { key: 'south', axis: 'z', dir:  1, axisCoord: 'z', perpCoord: 'x', axisMin: 'minZ', axisMax: 'maxZ', perpMin: 'minX', perpMax: 'maxX' },
  { key: 'north', axis: 'z', dir: -1, axisCoord: 'z', perpCoord: 'x', axisMin: 'minZ', axisMax: 'maxZ', perpMin: 'minX', perpMax: 'maxX' },
];

function getSkirtMaterial(baseMaterial) {
  if (!baseMaterial) return null;
  let material = SKIRT_MATERIAL_CACHE.get(baseMaterial);
  if (!material) {
    material = baseMaterial.clone();
    material.side = THREE.DoubleSide;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.color?.multiplyScalar?.(0.9);
    SKIRT_MATERIAL_CACHE.set(baseMaterial, material);
  }
  return material;
}

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

    if (!best ||
        overlapLength > best.overlapLength ||
        (Math.abs(overlapLength - best.overlapLength) < 1e-6 && distance < best.distance)) {
      best = { instance: candidate, overlapMin, overlapMax, overlapLength, distance };
    }
  }

  return best;
}

function applyElevationSkirts(instances) {
  const records = [];

  instances.forEach((tile) => {
    if (!tile?.dirtGroup || !tile.bounds) return;

    const baseMesh = tile.dirtMesh ?? tile.dirtGroup.children.find(child => child?.isMesh);
    const skirtMaterial = getSkirtMaterial(baseMesh?.material);
    if (!skirtMaterial) return;

    SKIRT_DIRECTIONS.forEach((direction) => {
      const neighborInfo = findNeighborForDirection(instances, tile, direction);
      if (!neighborInfo) return;

      const neighbor = neighborInfo.instance;
      const tileSurface = typeof tile.surfaceY === 'number' ? tile.surfaceY : tile.position?.y ?? 0;
      const neighborSurface = typeof neighbor.surfaceY === 'number' ? neighbor.surfaceY : neighbor.position?.y ?? 0;
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

      const topLocalY = bottomLocal + height;
      const topLocal = direction.axis === 'x'
        ? new THREE.Vector3(centerAxisLocal, topLocalY, centerPerpLocal)
        : new THREE.Vector3(centerPerpLocal, topLocalY, centerAxisLocal);
      const bottomLocalVec = direction.axis === 'x'
        ? new THREE.Vector3(centerAxisLocal, bottomLocal, centerPerpLocal)
        : new THREE.Vector3(centerPerpLocal, bottomLocal, centerAxisLocal);

      const record = {
        mesh,
        tileIndex: tile.index,
        neighborIndex: neighbor.index,
        direction: direction.key,
        height,
        tileSurface,
        neighborSurface,
        topLocal,
        bottomLocal: bottomLocalVec,
      };

      tile.skirts = tile.skirts || [];
      tile.skirts.push(record);
      mesh.userData = mesh.userData || {};
      mesh.userData.groundSkirt = record;
      records.push(record);
    });
  });

  return records;
}

function getFoundationBlendRingMaterial({ repeat, anisotropy }) {
  const repeatKey = typeof repeat === 'number' ? repeat : 'auto';
  const anisotropyKey = typeof anisotropy === 'number' ? anisotropy : 'auto';
  const cacheKey = `${repeatKey}:${anisotropyKey}`;

  if (!FOUNDATION_BLEND_RING_MATERIAL_CACHE.has(cacheKey)) {
    const material = createDirtMaterial({ repeat, anisotropy });
    material.side = THREE.DoubleSide;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.color?.multiplyScalar?.(0.92);
    FOUNDATION_BLEND_RING_MATERIAL_CACHE.set(cacheKey, material);
  }
  return FOUNDATION_BLEND_RING_MATERIAL_CACHE.get(cacheKey);
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
  const material = getFoundationBlendRingMaterial({ repeat, anisotropy });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
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
 * @param {boolean} [options.preventTileSeams=true] - Expand tile geometry slightly to hide seams.
 * @param {boolean} [options.stabilizeTileOverlap=true] - Apply a subtle alternating height bias to dirt tiles.
 *
 * Tile definitions may specify `disableUnderBuilding` to suppress dirt/grass meshes and
 * `addFoundationBlendRing` to render a subtle inset ring around pads.
 * @returns {{
 *   root: THREE.Group,
 *   dirt: THREE.Group,
 *   grass: THREE.Group,
 *   foundationBlend: THREE.Group,
 *   tiles: Array,
 *   skirts: Array,
 *   config: { preventTileSeams: boolean, stabilizeTileOverlap: boolean, addElevationSkirts: boolean }
 * }}
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
  preventTileSeams = true,
  stabilizeTileOverlap = true,
} = {}) {
  const root = new THREE.Group();
  root.name = 'ground:root';

  const dirtLayer = new THREE.Group();
  dirtLayer.name = 'ground:dirt';

  const grassLayer = new THREE.Group();
  grassLayer.name = 'ground:grass';

  const foundationLayer = new THREE.Group();
  foundationLayer.name = 'ground:foundationBlend';

  root.add(dirtLayer);
  root.add(grassLayer);
  root.add(foundationLayer);

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

  const enableSeamPrevention = !!preventTileSeams;
  const enableTileStabilization = !!stabilizeTileOverlap;

  const tileInstances = [];

  tileDefinitions.forEach((tile, index) => {
    const fallbackSize = tile.size ?? resolvedDefaultSize;
    const fallbackRepeat = tile.repeat ?? resolvedDefaultRepeat;

    const disableForBuilding = shouldDisableTileGround(tile);

    // Alternating micro height bias to reduce coplanar z-fighting
    const ix = Math.floor(typeof tile.gridX === 'number' ? tile.gridX : index);
    const iz = Math.floor(typeof tile.gridZ === 'number' ? tile.gridZ : 0);
    const stabilizationBias = ((ix + iz) & 1) ? 0.001 : 0;

    const dirtConfig = {
      ...dirtOptions,
      ...(tile.dirtOptions ?? {}),
      size: tile.dirtOptions?.size ?? fallbackSize ?? resolvedDefaultSize,
      repeat: tile.dirtOptions?.repeat ?? fallbackRepeat ?? resolvedDefaultRepeat,
      expandForSeams: tile.dirtOptions?.expandForSeams ?? dirtOptions.expandForSeams ?? enableSeamPrevention,
      heightBias: tile.dirtOptions?.heightBias ?? dirtOptions.heightBias ?? (enableTileStabilization ? stabilizationBias : 0),
    };

    const grassConfig = {
      ...grassOptions,
      ...(tile.grassOptions ?? {}),
      size: tile.grassOptions?.size ?? fallbackSize ?? resolvedDefaultSize,
      repeat: tile.grassOptions?.repeat ?? fallbackRepeat ?? resolvedDefaultRepeat,
      expandForSeams: tile.grassOptions?.expandForSeams ?? grassOptions.expandForSeams ?? enableSeamPrevention,
    };

    const baseDirtHeight = typeof dirtConfig.height === 'number' ? dirtConfig.height : 0;

    let dirtGroup = null;
    let dirtMesh = null;
    let dirtSize;
    let surfaceY = tile.position.y + baseDirtHeight;

    if (!disableForBuilding && tile.enableDirt) {
      const dirt = createDirtGround(dirtConfig);
      dirt.name = tile.dirtName ?? `ground:dirt:tile:${index}`;
      dirt.position.copy(tile.position);
      dirtLayer.add(dirt);

      dirtGroup = dirt;
      dirtMesh = dirt.children.find(child => child?.isMesh) ?? null;
      dirtSize = dirtConfig.size;
      surfaceY = tile.position.y + baseDirtHeight;
    }

    if (!disableForBuilding && tile.enableGrass) {
      const grass = createGrassGround(grassConfig);
      grass.name = tile.grassName ?? `ground:grass:tile:${index}`;
      grass.position.copy(tile.position);
      grassLayer.add(grass);
    }

    const coverageSize = dirtSize ?? fallbackSize ?? resolvedDefaultSize;
    const bounds = computeTileBounds(tile.position, coverageSize);

    // Optional foundation blend ring around disabled (building pad) tiles
    if (addFoundationBlendRing && tile.addFoundationBlendRing && disableForBuilding) {
      const blendOptions = tile.foundationBlendOptions ?? {};
      const ringSize = blendOptions.size ?? coverageSize;
      const blendMesh = createFoundationBlendRingMesh({
        size: ringSize,
        repeat: blendOptions.repeat ?? tile.dirtOptions?.repeat ?? tile.repeat ?? dirtOptions.repeat ?? resolvedDefaultRepeat,
        anisotropy: blendOptions.anisotropy ?? tile.dirtOptions?.anisotropy ?? dirtOptions.anisotropy ?? undefined,
      });
      if (blendMesh) {
        blendMesh.name = blendOptions.name ?? `${tile.name ?? `tile:${index}`}:foundationBlend`;
        blendMesh.position.copy(tile.position);
        blendMesh.position.y += FOUNDATION_BLEND_RING_OFFSET;
        foundationLayer.add(blendMesh);
      }
    }

    tileInstances.push({
      index,
      definition: tile,
      position: tile.position.clone(),
      disableUnderBuilding: Boolean(tile.disableUnderBuilding),
      addFoundationBlendRing: tile.addFoundationBlendRing,
      dirtGroup,
      dirtMesh,
      dirtHeight: baseDirtHeight,
      dirtSize,
      coverageSize,
      surfaceY,
      bounds,
      skirts: [],
    });
  });

  const skirtRecords = addElevationSkirts ? applyElevationSkirts(tileInstances) : [];

  dirtLayer.visible = !!showDirt;
  grassLayer.visible = !!showGrass;

  const config = {
    preventTileSeams: enableSeamPrevention,
    stabilizeTileOverlap: enableTileStabilization,
    addElevationSkirts: !!addElevationSkirts,
  };

  root.userData = root.userData || {};
  root.userData.tileInstances = tileInstances;
  root.userData.groundConfig = config;

  return {
    root,
    dirt: dirtLayer,
    grass: grassLayer,
    foundationBlend: foundationLayer,
    tiles: tileInstances,
    skirts: skirtRecords,
    config,
  };
}
