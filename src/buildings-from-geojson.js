import * as THREE from 'three';
import {
  makeTemple, makeStoa, makeTheatre, makeTholos, makeWallPath,
  makePropylon, makeBlock, makeAltar, makeExedra
} from './building-kit.js';
import { applyFeatureOffset } from './geo/featureOffsets.js';
import { getDistrictAt, getDistricts } from './scene/districts.js';
import { defaultPlacementOptions } from './scene/placement-options.js';
import { estimateAABB, GridIndex } from './scene/placement-grid.js';

const deg = (d)=> THREE.MathUtils.degToRad(d);

function normalizeName(s='') {
  return s
    .replace(/[’']/g, "'")
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim()

    // existing replacements...
    .replace(/\bodeon\b.*herodes.*atticus/, 'odeon of herodes atticus')
    .replace(/\btheatre of dionysus|\bdionysus theatre\b/, 'theatre of dionysus')
    .replace(/\bolymp(e)?ion\b/, 'olympeion')
    .replace(/\bhadrian.?s library\b/, "hadrian's library")

    // NEW: stoas & gates
    .replace(/\bpainted stoa\b/, 'stoa poikile')
    .replace(/\broyal stoa\b/, 'stoa basileios')
    .replace(/\broman agora east gate|east gate of the roman agora|gate of the roman agora east\b/,
              'gate of the roman agora (east)')
    .replace(/\broman agora west gate|west gate of the roman agora|gate of the roman agora west\b/,
              'gate of the roman agora (west)')

    // Library exedrae generic
    .replace(/\bhadrian.?s library (n|north) exedra\b/, "hadrian's library north exedra")
    .replace(/\bhadrian.?s library (e|east) exedra\b/,  "hadrian's library east exedra")
    .replace(/\bhadrian.?s library (s|south) exedra\b/, "hadrian's library south exedra")
    .replace(/\bhadrian.?s library (w|west) exedra\b/,  "hadrian's library west exedra")
    ;
}

/** Known monuments with sensible defaults (easy to tweak) */
const REGISTRY = {
  // Acropolis
  'Parthenon':               { kind: 'temple',  dims: { width: 31, length: 70, colsShort: 8, colsLong: 17, colH: 11 }, defaultRotationDeg: 15 },
  'Erechtheion':             { kind: 'temple',  dims: { width: 13, length: 24, colsShort: 6, colsLong: 12, colH: 8  }, defaultRotationDeg: 110 },
  'Propylaea':               { kind: 'stoa',    dims: { length: 50, depth: 22, colH: 10, cols: 20 },               defaultRotationDeg: 100 },
  'Temple of Athena Nike':   { kind: 'temple',  dims: { width: 8,  length: 13, colsShort: 4, colsLong: 6,  colH: 6  }, defaultRotationDeg: 100 },

  // South slope
  'Theatre of Dionysus':     { kind: 'theatre', dims: { radius: 60, height: 18, steps: 28, openAngleDeg: 120 },    defaultRotationDeg: 180 },
  'Dionysus Theatre':        { kind: 'theatre', dims: { radius: 60, height: 18, steps: 28, openAngleDeg: 120 },    defaultRotationDeg: 180 },
  'Odeon of Herodes Atticus':{ kind: 'theatre', dims: { radius: 45, height: 16, steps: 24, openAngleDeg: 140 },    defaultRotationDeg: 180 },

  // City
  'Temple of Olympian Zeus': { kind: 'temple',  dims: { width: 44, length: 110, colsShort: 8, colsLong: 20, colH: 17 }, defaultRotationDeg: 0 },
  'Olympeion':               { kind: 'temple',  dims: { width: 44, length: 110, colsShort: 8, colsLong: 20, colH: 17 }, defaultRotationDeg: 0 },
  'Roman Agora':             { kind: 'stoa',    dims: { length: 95, depth: 35, colH: 9, cols: 36 },                    defaultRotationDeg: 90 },
  'Tower of the Winds':      { kind: 'tholos',  dims: { radius: 7,  colH: 6,  cols: 8 },                                defaultRotationDeg: 30 },
  "Hadrian's Library":       { kind: 'stoa',    dims: { length: 120, depth: 80, colH: 10, cols: 40 },                   defaultRotationDeg: 90 },
  'Hadrian’s Library':       { kind: 'stoa',    dims: { length: 120, depth: 80, colH: 10, cols: 40 },                   defaultRotationDeg: 90 },
  'Panathenaic Stadium':     { kind: 'theatre', dims: { radius: 140, height: 24, steps: 32, openAngleDeg: 60 },         defaultRotationDeg: 20 },

  // Agora & civic core
  'Temple of Hephaistos':    { kind: 'temple',  dims: { width: 14, length: 32, colsShort: 6, colsLong: 13, colH: 8.5 }, defaultRotationDeg: -17 },
  'Stoa of Attalos':         { kind: 'stoa',    dims: { length: 115, depth: 20, colH: 9, cols: 46 },                     defaultRotationDeg: 5 },
  'Tholos':                  { kind: 'tholos',  dims: { radius: 12, colH: 6.5, cols: 18 },                                defaultRotationDeg: 0 },
  'Bouleuterion':            { kind: 'stoa',    dims: { length: 35, depth: 28, colH: 8, cols: 10 },                      defaultRotationDeg: -20 },

  // --- NEW: Stoas in the Agora
  'Stoa Poikile': {
    kind: 'stoa',
    dims: { length: 115, depth: 16, colH: 9, cols: 46 },
    defaultRotationDeg: -5
  },
  'Stoa Basileios': {
    kind: 'stoa',
    dims: { length: 40, depth: 14, colH: 8.5, cols: 16 },
    defaultRotationDeg: -10
  },

  // --- NEW: Roman Agora gate (East)
  'Gate of the Roman Agora (East)': {
    kind: 'propylon',
    dims: { span: 14, depth: 9, colH: 7.2, colR: 0.55, columns: 4 },
    defaultRotationDeg: 90
  },
  // (Optional) West gate too, if you add a point for it:
  'Gate of the Roman Agora (West)': {
    kind: 'propylon',
    dims: { span: 14, depth: 9, colH: 7.2, colR: 0.55, columns: 4 },
    defaultRotationDeg: 270
  },

  // --- NEW: Hadrian's Library exedrae (N/E/S/W + generic)
  "Hadrian's Library North Exedra": {
    kind: 'exedra',
    dims: { radius: 9, wallHeight: 4, benchH: 0.6, colH: 5, cols: 12 },
    defaultRotationDeg: 0
  },
  "Hadrian's Library East Exedra": {
    kind: 'exedra',
    dims: { radius: 9, wallHeight: 4, benchH: 0.6, colH: 5, cols: 12 },
    defaultRotationDeg: 90
  },
  "Hadrian's Library South Exedra": {
    kind: 'exedra',
    dims: { radius: 9, wallHeight: 4, benchH: 0.6, colH: 5, cols: 12 },
    defaultRotationDeg: 180
  },
  "Hadrian's Library West Exedra": {
    kind: 'exedra',
    dims: { radius: 9, wallHeight: 4, benchH: 0.6, colH: 5, cols: 12 },
    defaultRotationDeg: 270
  },
  'Library Exedra': {
    kind: 'exedra',
    dims: { radius: 9, wallHeight: 4, benchH: 0.6, colH: 5, cols: 12 },
    defaultRotationDeg: 0
  },

  // --- NEW: Temple of Ares (Agora)
  'Temple of Ares': {
    kind: 'temple',
    dims: { width: 13, length: 30, colsShort: 6, colsLong: 13, colH: 8.5 },
    defaultRotationDeg: -10
  },

  // Assembly hills (modeled as big open theatres)
  'Pnyx':                    { kind: 'theatre', dims: { radius: 90, height: 12, steps: 20, openAngleDeg: 180 },          defaultRotationDeg: 200 },
  // Areopagus is a rock; skip 3D building—pin/label only.
};

const normalizedRegistryEntries = Object.entries(REGISTRY);
for (const [key, value] of normalizedRegistryEntries) {
  const normalizedKey = normalizeName(key);
  if (!(normalizedKey in REGISTRY)) {
    REGISTRY[normalizedKey] = value;
  }
}

const radToDeg = (r) => THREE.MathUtils.radToDeg(r);
const DEFAULT_PATH_SEARCH_RADIUS = 30;
const DEFAULT_MAX_NUDGE_ATTEMPTS = 12;

const ACROPOLIS_PRIORITY = [
  'Parthenon',
  'Erechtheion',
  'Propylaea',
  'Temple of Athena Nike'
].map((label) => normalizeName(label));

const AGORA_PRIORITY = [
  'Stoa of Attalos',
  'Bouleuterion',
  'Tholos'
].map((label) => normalizeName(label));

const ACROPOLIS_PRIORITY_MAP = new Map(ACROPOLIS_PRIORITY.map((name, index) => [name, index]));
const AGORA_PRIORITY_MAP = new Map(AGORA_PRIORITY.map((name, index) => [name, index]));

let lastCollectionContext = null;

function ensureContext() {
  if (!lastCollectionContext) {
    lastCollectionContext = {
      namedPaths: [],
      longWalls: [],
      projector: null,
      toWorld: null
    };
  }
  return lastCollectionContext;
}

function cloneVector3(v) {
  const out = new THREE.Vector3();
  if (v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
    out.set(v.x, v.y, v.z);
  }
  return out;
}

function createToWorld(projector) {
  if (projector) {
    return (lon, lat) => {
      const projected = projector(lon, lat);
      return cloneVector3(projected instanceof THREE.Vector3 ? projected : new THREE.Vector3(projected.x, projected.y, projected.z));
    };
  }
  return (lon, lat) => new THREE.Vector3(lon * 1000, 0, -lat * 1000);
}

function isFiniteNumber(v) {
  return Number.isFinite(v);
}

function getClearanceForKind(kind, map) {
  if (!map) {
    return 0;
  }
  if (isFiniteNumber(map[kind])) {
    return Number(map[kind]);
  }
  if (isFiniteNumber(map.default)) {
    return Number(map.default);
  }
  return 0;
}

function computeFootprint(candidate) {
  const dims = candidate?.dims ?? {};
  const kind = candidate?.kind ?? '';

  const radius = (value, fallback = 0) => {
    const r = Number(dims[value]);
    if (Number.isFinite(r) && r > 0) return r;
    return fallback;
  };

  const size = (value, fallback = 0) => {
    const s = Number(dims[value]);
    if (Number.isFinite(s) && s > 0) return s;
    return fallback;
  };

  let width = 12;
  let depth = 12;
  let area = width * depth;
  let axis = 'z';

  switch (kind) {
    case 'temple':
      width = size('width', width);
      depth = size('length', depth);
      area = width * depth;
      axis = depth >= width ? 'z' : 'x';
      break;
    case 'stoa':
      width = size('depth', width);
      depth = size('length', depth);
      area = width * depth;
      axis = depth >= width ? 'z' : 'x';
      break;
    case 'theatre': {
      const r = radius('radius', 18);
      width = depth = r * 2;
      const openAngle = Number(dims.openAngleDeg);
      const angleFactor = Number.isFinite(openAngle) ? Math.max(0, Math.min(360, openAngle)) / 360 : 0.5;
      area = Math.PI * r * r * Math.max(0.5, angleFactor);
      axis = 'z';
      break;
    }
    case 'tholos': {
      const r = radius('radius', 6);
      width = depth = r * 2;
      area = Math.PI * r * r;
      axis = 'z';
      break;
    }
    case 'propylon':
      width = size('span', width);
      depth = size('depth', depth);
      area = width * depth;
      axis = depth >= width ? 'z' : 'x';
      break;
    case 'altar':
    case 'block':
      width = size('width', width);
      depth = size('depth', depth);
      area = width * depth;
      axis = depth >= width ? 'z' : 'x';
      break;
    case 'exedra': {
      const r = radius('radius', 6);
      width = depth = r * 2;
      area = Math.PI * r * r * 0.5;
      axis = 'z';
      break;
    }
    default:
      width = size('width', width) || size('span', width) || width;
      depth = size('length', depth) || size('depth', depth) || depth;
      area = width * depth;
      axis = depth >= width ? 'z' : 'x';
      break;
  }

  width = Math.max(width, 4);
  depth = Math.max(depth, 4);

  return { width, depth, area, longAxis: axis };
}

function aabbOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function length2D(dx, dz) {
  return Math.hypot(dx, dz);
}

function shortestAngleDeltaDeg(fromDeg, toDeg) {
  let delta = (toDeg - fromDeg) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function normalizeAngleDeg(angle) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

function findNearestPathDirection(position, paths, maxDistance = DEFAULT_PATH_SEARCH_RADIUS) {
  if (!Array.isArray(paths) || !paths.length) {
    return null;
  }

  let best = null;

  const checkSegment = (p0, p1, path) => {
    const vx = p1.x - p0.x;
    const vz = p1.z - p0.z;
    const segmentLenSq = vx * vx + vz * vz;
    if (segmentLenSq <= 1e-4) {
      return;
    }
    const t = THREE.MathUtils.clamp(((position.x - p0.x) * vx + (position.z - p0.z) * vz) / segmentLenSq, 0, 1);
    const projX = p0.x + vx * t;
    const projZ = p0.z + vz * t;
    const dx = position.x - projX;
    const dz = position.z - projZ;
    const dist = length2D(dx, dz);
    if (dist > maxDistance) {
      return;
    }
    if (best && dist >= best.distance) {
      return;
    }
    const len = Math.sqrt(segmentLenSq);
    best = {
      distance: dist,
      direction: { x: vx / len, z: vz / len },
      path
    };
  };

  for (const path of paths) {
    const pts = Array.isArray(path?.points) ? path.points : [];
    if (pts.length < 2) {
      continue;
    }
    for (let i = 1; i < pts.length; i += 1) {
      checkSegment(pts[i - 1], pts[i], path);
    }
    if (path.closed) {
      checkSegment(pts[pts.length - 1], pts[0], path);
    }
  }

  return best;
}

function alignRotationToPaths(position, rotationDeg, defaultRotationDeg, footprint, paths, maxRotationAdjustDeg) {
  const nearestPath = findNearestPathDirection(position, paths, DEFAULT_PATH_SEARCH_RADIUS);
  if (!nearestPath) {
    const baseAngle = defaultRotationDeg ?? rotationDeg ?? 0;
    return { rotationDeg: normalizeAngleDeg(baseAngle), aligned: false };
  }

  const axis = footprint?.longAxis === 'x' ? 'x' : 'z';
  let pathAngle;
  if (axis === 'x') {
    pathAngle = radToDeg(Math.atan2(-nearestPath.direction.z, nearestPath.direction.x));
  } else {
    pathAngle = radToDeg(Math.atan2(nearestPath.direction.x, nearestPath.direction.z));
  }
  pathAngle = normalizeAngleDeg(pathAngle);

  const baseAngle = normalizeAngleDeg(defaultRotationDeg ?? rotationDeg ?? 0);
  let delta = shortestAngleDeltaDeg(baseAngle, pathAngle);
  if (maxRotationAdjustDeg > 0 && Math.abs(delta) > maxRotationAdjustDeg) {
    delta = Math.sign(delta) * maxRotationAdjustDeg;
  }

  const adjusted = normalizeAngleDeg(baseAngle + delta);
  return { rotationDeg: adjusted, aligned: Math.abs(delta) > 1e-3 };
}

function computeBiasDirection(position, containingDistrict, districts) {
  if (containingDistrict && containingDistrict.centroid) {
    const dx = containingDistrict.centroid.x - position.x;
    const dz = containingDistrict.centroid.z - position.z;
    const len = length2D(dx, dz);
    if (len > 1e-4) {
      return { x: dx / len, z: dz / len, keepInside: true };
    }
  }

  if (Array.isArray(districts) && districts.length) {
    let nearest = null;
    for (const district of districts) {
      const cx = district.centroid?.x ?? 0;
      const cz = district.centroid?.z ?? 0;
      const dx = cx - position.x;
      const dz = cz - position.z;
      const dist = length2D(dx, dz);
      if (!nearest || dist < nearest.dist) {
        nearest = { dist, dx, dz };
      }
    }
    if (nearest && nearest.dist > 1e-4) {
      return { x: -nearest.dx / nearest.dist, z: -nearest.dz / nearest.dist, keepInside: false };
    }
  }

  return null;
}

function generateOffsets(maxRadius, biasDir, maxAttempts = DEFAULT_MAX_NUDGE_ATTEMPTS) {
  const offsets = [{ x: 0, z: 0, radius: 0 }];
  if (maxAttempts <= 1 || maxRadius <= 0) {
    return offsets.slice(0, maxAttempts);
  }

  const baseDirections = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: -1, z: -1 }
  ];

  const dirs = [];
  if (biasDir) {
    dirs.push({ x: biasDir.x, z: biasDir.z });
    dirs.push({ x: -biasDir.x, z: -biasDir.z });
  }
  for (const dir of baseDirections) {
    if (!dirs.some((existing) => Math.abs(existing.x - dir.x) < 1e-6 && Math.abs(existing.z - dir.z) < 1e-6)) {
      dirs.push(dir);
    }
  }

  const ringCount = Math.max(1, Math.ceil((maxAttempts - 1) / Math.max(1, dirs.length)));
  for (let ring = 1; offsets.length < maxAttempts && ring <= ringCount; ring += 1) {
    const radius = (maxRadius * ring) / ringCount;
    for (const dir of dirs) {
      const len = length2D(dir.x, dir.z);
      if (len < 1e-4) continue;
      offsets.push({ x: (dir.x / len) * radius, z: (dir.z / len) * radius, radius });
      if (offsets.length >= maxAttempts) break;
    }
  }

  return offsets.slice(0, maxAttempts);
}

function resolvePlacementOptions(userOptions = {}, contextNamedPaths = []) {
  const defaults = defaultPlacementOptions || {};
  const minClearance = {
    ...(defaults.minClearanceByKind || {}),
    ...(userOptions.minClearanceByKind || {})
  };
  const namedPaths = Array.isArray(userOptions.namedPaths)
    ? userOptions.namedPaths
    : contextNamedPaths;
  const collisionGeometry = userOptions.collisionGeometry
    ?? defaults.collisionGeometry
    ?? globalThis?.collisionGeometry
    ?? null;

  return {
    ...defaults,
    ...userOptions,
    minClearanceByKind: minClearance,
    namedPaths,
    collisionGeometry
  };
}

function prioritizeCandidates(candidates) {
  const enriched = candidates.map((candidate, index) => {
    const normalized = normalizeName(candidate.rawName || candidate.name || '');
    const footprint = computeFootprint(candidate);
    const priority = ACROPOLIS_PRIORITY_MAP.has(normalized)
      ? { tier: 0, order: ACROPOLIS_PRIORITY_MAP.get(normalized) }
      : AGORA_PRIORITY_MAP.has(normalized)
        ? { tier: 1, order: AGORA_PRIORITY_MAP.get(normalized) }
        : { tier: 2, order: -footprint.area };
    return { candidate, normalized, footprint, priority, index };
  });

  enriched.sort((a, b) => {
    if (a.priority.tier !== b.priority.tier) {
      return a.priority.tier - b.priority.tier;
    }
    if (a.priority.tier <= 1) {
      if (a.priority.order !== b.priority.order) {
        return a.priority.order - b.priority.order;
      }
      return a.index - b.index;
    }
    if (a.priority.order !== b.priority.order) {
      return b.priority.order - a.priority.order;
    }
    return a.index - b.index;
  });

  return enriched;
}

function buildPlacement(candidate, position, rotationDeg) {
  return {
    name: candidate.rawName || candidate.name,
    meshKind: candidate.kind,
    dims: candidate.dims,
    position,
    rotationY: deg(rotationDeg)
  };
}

function extractLinePoints(coordinates, toWorld) {
  return coordinates.map(([lon, lat]) => {
    const v = toWorld(lon, lat);
    return new THREE.Vector3(v.x, v.y, v.z);
  });
}

function extractPathPoints(coordinates, toWorld) {
  return coordinates.map(([lon, lat]) => {
    const v = toWorld(lon, lat);
    return { x: v.x, z: v.z };
  });
}

export async function collectCandidatesFromGeo({ geoJsonUrl, projector }) {
  if (!geoJsonUrl) {
    throw new Error('collectCandidatesFromGeo requires a geoJsonUrl');
  }

  const res = await fetch(geoJsonUrl);
  if (!res.ok) {
    throw new Error(`Failed to load ${geoJsonUrl}`);
  }
  const geo = await res.json();

  const context = ensureContext();
  context.projector = projector || null;
  context.toWorld = createToWorld(projector);
  context.namedPaths = [];
  context.longWalls = [];

  const candidates = [];

  for (const feature of geo.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const properties = feature.properties ?? {};
    const rawName = properties.title || properties.name || '';
    const normalized = normalizeName(rawName);
    const registryEntry = REGISTRY[rawName] || REGISTRY[normalized];

    if (geometry.type === 'Point') {
      const cfg = registryEntry;
      if (!cfg) {
        continue;
      }
      const [lon, lat] = applyFeatureOffset(geometry.coordinates, { properties, fallbackName: rawName });
      const pos = context.toWorld(lon, lat);
      const rotationExplicit = isFiniteNumber(properties.rotation_deg);
      const baseRotation = rotationExplicit ? Number(properties.rotation_deg) : (cfg.defaultRotationDeg ?? 0);

      candidates.push({
        name: rawName || normalized,
        rawName,
        kind: cfg.kind,
        dims: { ...cfg.dims },
        worldPos: pos,
        rotDeg: baseRotation,
        defaultRotDeg: cfg.defaultRotationDeg ?? baseRotation,
        rotationLocked: rotationExplicit,
        normalizedName: normalized
      });
    } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
      const coordinateSets = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates];
      const isLongWall = /long wall|phaler|piraeus/i.test(normalized) || /long wall|phaler|piraeus/i.test(rawName) || properties.kind === 'wall_corridor';
      for (const coordinates of coordinateSets) {
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          continue;
        }
        if (isLongWall) {
          context.longWalls.push(extractLinePoints(coordinates, context.toWorld));
        } else {
          context.namedPaths.push({
            name: rawName || properties.name || 'Path',
            points: extractPathPoints(coordinates, context.toWorld),
            closed: false
          });
        }
      }
    } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      const polygonSets = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
      const isCityWall = properties.kind === 'city_wall';
      for (const polygon of polygonSets) {
        if (!Array.isArray(polygon) || !polygon.length) {
          continue;
        }
        const outer = polygon[0];
        if (!isCityWall && Array.isArray(outer) && outer.length >= 3) {
          context.namedPaths.push({
            name: rawName || properties.name || 'Path Area',
            points: extractPathPoints(outer, context.toWorld),
            closed: true
          });
        }
      }
    }
  }

  return candidates;
}

export function planPlacements(candidates, placementOptions = {}) {
  const context = ensureContext();
  const options = resolvePlacementOptions(placementOptions, context.namedPaths);
  const prioritized = prioritizeCandidates(candidates);
  const districts = getDistricts();
  const collisionGeometry = options.collisionGeometry;
  const maxAdjustRadius = Number.isFinite(options.maxAdjustRadius)
    ? Math.max(0, options.maxAdjustRadius)
    : defaultPlacementOptions.maxAdjustRadius ?? 12;
  const maxRotationAdjustDeg = Number.isFinite(options.maxRotationAdjustDeg)
    ? Math.max(0, options.maxRotationAdjustDeg)
    : defaultPlacementOptions.maxRotationAdjustDeg ?? 0;
  const maxAttempts = Number.isInteger(options.maxNudgeAttempts)
    ? Math.max(1, options.maxNudgeAttempts)
    : DEFAULT_MAX_NUDGE_ATTEMPTS;

  const placements = [];
  const placementAabbs = [];
  let maxSpan = 0;

  for (const item of prioritized) {
    const clearance = getClearanceForKind(item.candidate.kind, options.minClearanceByKind);
    const span = Math.max(item.footprint.width, item.footprint.depth) + clearance * 2;
    if (span > maxSpan) {
      maxSpan = span;
    }
  }

  const baseCellSize = Number.isFinite(options.gridCellSize)
    ? Math.max(1, options.gridCellSize)
    : Math.max(1, defaultPlacementOptions.gridCellSize ?? 25);
  const cellSize = Math.max(baseCellSize, maxSpan || 0, 1);
  const grid = new GridIndex(cellSize);

  const stats = {
    total: prioritized.length,
    placed: 0,
    movedCount: 0,
    maxMoveDistance: 0,
    skippedOverlap: 0,
    pathAligned: 0,
    exceededAdjustRadius: [],
    cellSize
  };

  for (const item of prioritized) {
    const candidate = item.candidate;
    const basePosition = candidate.worldPos.clone();
    const baseRotationDeg = candidate.rotDeg ?? candidate.defaultRotDeg ?? 0;
    let rotationDeg = baseRotationDeg;

    if (options.alignToPaths && !candidate.rotationLocked) {
      const aligned = alignRotationToPaths(basePosition, rotationDeg, candidate.defaultRotDeg, item.footprint, options.namedPaths, maxRotationAdjustDeg);
      rotationDeg = aligned.rotationDeg;
      if (aligned.aligned) {
        stats.pathAligned += 1;
      }
    }

    const clearance = getClearanceForKind(candidate.kind, options.minClearanceByKind);
    const containingDistrict = getDistrictAt(basePosition.x, basePosition.z);
    const biasDir = computeBiasDirection(basePosition, containingDistrict, districts);
    const offsets = generateOffsets(maxAdjustRadius, biasDir, maxAttempts);

    let acceptedPlacement = null;
    for (const offset of offsets) {
      const testPosition = new THREE.Vector3(basePosition.x + offset.x, basePosition.y, basePosition.z + offset.z);

      if (options.snapToDistricts) {
        if (containingDistrict) {
          const districtHere = getDistrictAt(testPosition.x, testPosition.z);
          if (!districtHere || districtHere.id !== containingDistrict.id) {
            continue;
          }
        } else {
          const districtHere = getDistrictAt(testPosition.x, testPosition.z);
          if (districtHere) {
            continue;
          }
        }
      }

      if (collisionGeometry && typeof collisionGeometry.isWalkable === 'function') {
        if (!collisionGeometry.isWalkable(testPosition.x, testPosition.z)) {
          continue;
        }
      }

      const footprintDims = {
        width: item.footprint.width + clearance * 2,
        depth: item.footprint.depth + clearance * 2
      };
      const aabb = estimateAABB(testPosition, footprintDims, deg(rotationDeg));

      const conflicts = grid.query(aabb);
      let intersects = false;
      for (const id of conflicts) {
        const existing = placementAabbs[id];
        if (existing && aabbOverlap(aabb, existing)) {
          intersects = true;
          break;
        }
      }
      if (intersects) {
        continue;
      }

      acceptedPlacement = {
        position: testPosition,
        aabb,
        distance: offset.radius ?? length2D(offset.x, offset.z)
      };
      break;
    }

    if (!acceptedPlacement) {
      stats.skippedOverlap += 1;
      if (maxAdjustRadius > 0) {
        stats.exceededAdjustRadius.push(candidate.rawName || candidate.name);
      }
      continue;
    }

    const placement = buildPlacement(candidate, acceptedPlacement.position, rotationDeg);
    placements.push(placement);
    placementAabbs.push(acceptedPlacement.aabb);
    grid.insert(acceptedPlacement.aabb, placementAabbs.length - 1);
    stats.placed += 1;
    if (acceptedPlacement.distance > 1e-3) {
      stats.movedCount += 1;
      if (acceptedPlacement.distance > stats.maxMoveDistance) {
        stats.maxMoveDistance = acceptedPlacement.distance;
      }
    }
  }

  planPlacements.lastReport = stats;

  return placements;
}

export function instantiateMeshes(placements, scene) {
  if (!scene) {
    throw new Error('instantiateMeshes requires a scene');
  }

  const context = ensureContext();
  const groupName = 'Buildings';
  let root = scene.getObjectByName(groupName);
  if (!root) {
    root = new THREE.Group();
    root.name = groupName;
    scene.add(root);
  }

  for (let i = root.children.length - 1; i >= 0; i -= 1) {
    const child = root.children[i];
    root.remove(child);
  }

  for (const placement of placements) {
    let mesh = null;
    if (placement.meshKind === 'temple')        mesh = makeTemple(placement.dims);
    else if (placement.meshKind === 'stoa')     mesh = makeStoa(placement.dims);
    else if (placement.meshKind === 'theatre')  mesh = makeTheatre(placement.dims);
    else if (placement.meshKind === 'tholos')   mesh = makeTholos(placement.dims);
    else if (placement.meshKind === 'propylon') mesh = makePropylon(placement.dims);
    else if (placement.meshKind === 'block')    mesh = makeBlock(placement.dims);
    else if (placement.meshKind === 'altar')    mesh = makeAltar(placement.dims);
    else if (placement.meshKind === 'exedra')   mesh = makeExedra(placement.dims);

    if (!mesh) {
      continue;
    }

    mesh.position.copy(placement.position);
    mesh.rotation.y = placement.rotationY;
    mesh.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    mesh.userData.monument = placement.name;
    root.add(mesh);
  }

  for (const points of context.longWalls ?? []) {
    if (!Array.isArray(points) || points.length < 2) {
      continue;
    }
    const wall = makeWallPath(points, { segment: 10, height: 4, width: 2.5 });
    root.add(wall);
  }

  return root;
}

export async function buildFromGeoJSON({ scene, geoJsonUrl, projector, placementOptions } = {}) {
  const candidates = await collectCandidatesFromGeo({ geoJsonUrl, projector });
  const placements = planPlacements(candidates, placementOptions);
  const group = instantiateMeshes(placements, scene);

  const report = planPlacements.lastReport;
  const shouldLog = placementOptions?.logReport ?? defaultPlacementOptions.logReport ?? true;
  if (report && shouldLog) {
    const movedInfo = `${report.movedCount} (max ${report.maxMoveDistance.toFixed(1)}m)`;
    const skippedInfo = report.skippedOverlap ?? 0;
    const alignedInfo = report.pathAligned ?? 0;
    const exceededCount = report.exceededAdjustRadius?.length ?? 0;
    console.info(
      `[placement] placed ${report.placed}/${report.total}; moved ${movedInfo}; skipped ${skippedInfo}; aligned ${alignedInfo}; exceeded radius ${exceededCount}.`
    );
    if (exceededCount > 0) {
      console.info('[placement] adjustment radius exceeded for:', report.exceededAdjustRadius.join(', '));
    }
  }

  return { group, placements };
}
