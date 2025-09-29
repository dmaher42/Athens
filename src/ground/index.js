// src/ground/index.js
import * as THREE from 'three';
import { createDirtGround, createSharedDirtTexture } from './dirt.js';
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

function hasBuildingFlag(userData) {
  if (!userData || typeof userData !== 'object') {
    return false;
  }
  return BUILDING_USERDATA_KEYS.some((key) => userData[key]);
}

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
    addFoundationBlendRing: !!addFoundationBlendRing,
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

function shouldDisableTileGround(tile) {
  if (!tile || typeof tile !== 'object') return false;

  if (tile.disableUnderBuilding === true) {
    return true;
  }

  if (hasBuildingFlag(tile.userData)) {
    return true;
  }

  if (hasBuildingFlag(tile.dirtOptions?.userData) || hasBuildingFlag(tile.grassOptions?.userData)) {
    return true;
  }

  const namesToCheck = [
    tile.name,
    tile.dirtName,
    tile.grassName,
    tile.dirtOptions?.name,
    tile.grassOptions?.name,
  ];
  if (namesToCheck.some((name) => typeof name === 'string' && BUILDING_NAME_PATTERN.test(name))) {
    return true;
  }

  const tileObjects = Array.isArray(tile.objects) ? tile.objects : undefined;
  if (tileObjects) {
    for (const obj of tileObjects) {
      if (!obj) continue;
      if (hasBuildingFlag(obj.userData)) {
        return true;
      }
      if (typeof obj.name === 'string' && BUILDING_NAME_PATTERN.test(obj.name)) {
        return true;
      }
    }
  }

  return false;
}

function createFoundationBlendRingMesh({
  size,
  innerSize,
  thickness,
  heightOffset = 0.03,
  repeat,
  anisotropy,
} = {}) {
  const baseSize = Math.max(typeof size === 'number' ? size : 0, 0);
  if (baseSize <= 0) {
    return null;
  }

  const outerHalf = baseSize / 2;
  const ringThickness = typeof thickness === 'number' ? thickness : Math.min(Math.max(baseSize * 0.08, 0.2), outerHalf);
  const desiredInnerHalf =
    typeof innerSize === 'number' && innerSize > 0 ? Math.min(innerSize / 2, outerHalf - 0.001) : outerHalf - ringThickness;
  const innerHalf = Math.max(0, Math.min(desiredInnerHalf, outerHalf - 0.001));

  const shape = new THREE.Shape([
    new THREE.Vector2(-outerHalf, -outerHalf),
    new THREE.Vector2(outerHalf, -outerHalf),
    new THREE.Vector2(outerHalf, outerHalf),
    new THREE.Vector2(-outerHalf, outerHalf),
  ]);

  const hole = new THREE.Path([
    new THREE.Vector2(-innerHalf, -innerHalf),
    new THREE.Vector2(innerHalf, -innerHalf),
    new THREE.Vector2(innerHalf, innerHalf),
    new THREE.Vector2(-innerHalf, innerHalf),
  ]);
  hole.autoClose = true;
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, heightOffset, 0);

  const textureRepeat = typeof repeat === 'number' ? repeat : Math.max(1, baseSize / 32);
  const texture = createSharedDirtTexture({ repeat: textureRepeat, anisotropy });

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1.0,
    side: THREE.DoubleSide,
  });

  if (!mat.map) {
    mat.color.set(0x6b5a45);
  }

  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  mat.shadowSide = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;

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
 * @param {boolean} [options.preventTileSeams=true] - Expand tile geometry slightly to hide seams.
 * @param {boolean} [options.stabilizeTileOverlap=true] - Apply a subtle alternating height bias to dirt tiles.
 *
 * Tile definitions may include `disableUnderBuilding` to skip creating dirt/grass when a foundation pad occupies the tile, and
 * `addFoundationBlendRing` to create a slim blend mesh around the pad. Optional `foundationBlendOptions` control ring sizing.
 * @returns {{ root: THREE.Group, dirt: THREE.Group, grass: THREE.Group, foundationBlend: THREE.Group }}
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

  tileDefinitions.forEach((tile, index) => {
    const disableForBuilding = shouldDisableTileGround(tile);

    if (!disableForBuilding && tile.enableDirt) {
      const ix = Math.floor(typeof tile.gridX === 'number' ? tile.gridX : index);
      const iz = Math.floor(typeof tile.gridZ === 'number' ? tile.gridZ : 0);
      const stabilizationBias = ((ix + iz) & 1) ? 0.001 : 0;
      const resolvedDirtHeightBias =
        tile.dirtOptions?.heightBias ??
        dirtOptions.heightBias ??
        (enableTileStabilization ? stabilizationBias : 0);
      const resolvedDirtSeamExpansion =
        tile.dirtOptions?.expandForSeams ??
        dirtOptions.expandForSeams ??
        enableSeamPrevention;

      const dirt = createDirtGround({
        ...dirtOptions,
        ...(tile.dirtOptions ?? {}),
        size: tile.dirtOptions?.size ?? tile.size ?? dirtOptions.size ?? resolvedDefaultSize,
        repeat: tile.dirtOptions?.repeat ?? tile.repeat ?? dirtOptions.repeat ?? resolvedDefaultRepeat,
        expandForSeams: resolvedDirtSeamExpansion,
        heightBias: resolvedDirtHeightBias,
      });
      dirt.name = tile.dirtName ?? `ground:dirt:tile:${index}`;
      dirt.position.copy(tile.position);
      dirtLayer.add(dirt);
    }

    if (!disableForBuilding && tile.enableGrass) {
      const resolvedGrassSeamExpansion =
        tile.grassOptions?.expandForSeams ??
        grassOptions.expandForSeams ??
        enableSeamPrevention;
      const grass = createGrassGround({
        ...grassOptions,
        ...(tile.grassOptions ?? {}),
        size: tile.grassOptions?.size ?? tile.size ?? grassOptions.size ?? resolvedDefaultSize,
        repeat: tile.grassOptions?.repeat ?? tile.repeat ?? grassOptions.repeat ?? resolvedDefaultRepeat,
        expandForSeams: resolvedGrassSeamExpansion,
      });
      grass.name = tile.grassName ?? `ground:grass:tile:${index}`;
      grass.position.copy(tile.position);
      grassLayer.add(grass);
    }

    if (tile.addFoundationBlendRing && disableForBuilding) {
      const blendOptions = tile.foundationBlendOptions ?? {};
      const blendMesh = createFoundationBlendRingMesh({
        size: blendOptions.size ?? tile.size ?? resolvedDefaultSize,
        innerSize: blendOptions.innerSize,
        thickness: blendOptions.thickness,
        heightOffset: blendOptions.heightOffset ?? 0.03,
        repeat:
          blendOptions.repeat ?? tile.dirtOptions?.repeat ?? tile.repeat ?? dirtOptions.repeat ?? resolvedDefaultRepeat,
        anisotropy:
          blendOptions.anisotropy ?? tile.dirtOptions?.anisotropy ?? dirtOptions.anisotropy ?? undefined,
      });
      if (blendMesh) {
        blendMesh.name = blendOptions.name ?? `${tile.name ?? `tile:${index}`}:foundationBlend`;
        blendMesh.position.copy(tile.position);
        foundationLayer.add(blendMesh);
      }
    }
  });

  dirtLayer.visible = !!showDirt;
  grassLayer.visible = !!showGrass;

  return { root, dirt: dirtLayer, grass: grassLayer, foundationBlend: foundationLayer };
}
