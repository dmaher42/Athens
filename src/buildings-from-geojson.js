import THREE from './three.js';
import {
  makeTemple, makeStoa, makeTheatre, makeTholos, makeWallPath,
  makePropylon, makeBlock, makeAltar, makeExedra
} from './building-kit.js';
import { applyFeatureOffset } from './geo/featureOffsets.js';

const deg = (d)=> THREE.MathUtils.degToRad(d);

const CITY_WALL_BUILD_OPTS = Object.freeze({
  segment: 12,
  height: 10,
  width: 8
});

const CITY_WALL_POINT_EPSILON = 0.01;

function isCityWallFeature(properties = {}) {
  const kind = typeof properties.kind === 'string' ? properties.kind.toLowerCase() : '';
  if (kind.includes('city_wall') || kind.includes('fortification')) {
    return true;
  }
  const name = typeof properties.name === 'string' ? properties.name.toLowerCase() : '';
  const title = typeof properties.title === 'string' ? properties.title.toLowerCase() : '';
  return name.includes('city wall') || title.includes('city wall');
}

function extractCityWallRings(geometry = {}) {
  const coords = geometry.coordinates;
  if (!coords) return [];
  const { type } = geometry;
  if (type === 'Polygon') {
    const outer = coords[0];
    return Array.isArray(outer) ? [{ coords: outer, closed: true }] : [];
  }
  if (type === 'MultiPolygon') {
    const rings = [];
    for (const polygon of coords) {
      if (Array.isArray(polygon) && Array.isArray(polygon[0])) {
        rings.push({ coords: polygon[0], closed: true });
      }
    }
    return rings;
  }
  if (type === 'LineString') {
    return Array.isArray(coords) ? [{ coords, closed: false }] : [];
  }
  if (type === 'MultiLineString') {
    const segments = [];
    for (const segment of coords) {
      if (Array.isArray(segment)) {
        segments.push({ coords: segment, closed: false });
      }
    }
    return segments;
  }
  return [];
}

function dedupeSequentialPoints(points, epsilon = CITY_WALL_POINT_EPSILON) {
  const deduped = [];
  for (const point of points) {
    if (!point || typeof point.distanceTo !== 'function') continue;
    const last = deduped[deduped.length - 1];
    if (!last || last.distanceTo(point) > epsilon) {
      deduped.push(point);
    }
  }
  return deduped;
}

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

/**
 * Build monuments from GeoJSON Points & Long Walls from LineStrings.
 * Expects features with `properties.name` (or `title`), optional `rotation_deg`.
 * If a name matches REGISTRY, we drop the corresponding building.
 * If a LineString has name including 'Long Wall' we build a wall path.
 */
export async function buildFromGeoJSON({ scene, geoJsonUrl, projector }) {
  const res = await fetch(geoJsonUrl);
  if (!res.ok) throw new Error(`Failed to load ${geoJsonUrl}`);
  const geo = await res.json();

  const root = new THREE.Group(); root.name = 'Buildings';
  scene.add(root);

  const toWorld = (lon, lat) => projector ? projector(lon, lat) : new THREE.Vector3(lon * 1000, 0, -lat * 1000);

  for (const f of geo.features ?? []) {
    const props = f.properties ?? {};
    const rawName = props.title || props.name || '';
    const name = normalizeName(rawName);
    const cfgDirect = REGISTRY[rawName] || REGISTRY[name];
    const rotDeg = props.rotation_deg ?? cfgDirect?.defaultRotationDeg ?? 0;

    if (f.geometry?.type === 'Point') {
      const [lon, lat] = applyFeatureOffset(
        f.geometry.coordinates,
        { properties: props, fallbackName: rawName }
      );
      const pos = toWorld(lon, lat);

      const cfg = cfgDirect;
      if (!cfg) continue; // unknown names are skipped for buildings (but still in pins/labels)

      let mesh;
      if (cfg.kind === 'temple')        mesh = makeTemple(cfg.dims);
      else if (cfg.kind === 'stoa')     mesh = makeStoa(cfg.dims);
      else if (cfg.kind === 'theatre')  mesh = makeTheatre(cfg.dims);
      else if (cfg.kind === 'tholos')   mesh = makeTholos(cfg.dims);
      else if (cfg.kind === 'propylon') mesh = makePropylon(cfg.dims);
      else if (cfg.kind === 'block')    mesh = makeBlock(cfg.dims);
      else if (cfg.kind === 'altar')    mesh = makeAltar(cfg.dims);
      else if (cfg.kind === 'exedra')   mesh = makeExedra(cfg.dims);

      mesh.position.copy(pos);
      mesh.rotation.y = deg(rotDeg);
      mesh.traverse(o => (o.castShadow = o.receiveShadow = true));
      mesh.userData.monument = rawName || name;

      root.add(mesh);
    }

    const cityWallSegments = isCityWallFeature(props) ? extractCityWallRings(f.geometry) : [];
    if (cityWallSegments.length > 0) {
      for (const { coords, closed } of cityWallSegments) {
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const rawPoints = [];
        for (const coord of coords) {
          if (!Array.isArray(coord) || coord.length < 2) continue;
          const [lon, lat] = coord;
          const projected = toWorld(lon, lat);
          if (!projected) continue;
          const point = typeof projected.clone === 'function'
            ? projected.clone()
            : new THREE.Vector3(
                Number.isFinite(projected.x) ? projected.x : 0,
                Number.isFinite(projected.y) ? projected.y : 0,
                Number.isFinite(projected.z) ? projected.z : 0
              );
          if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
          point.y = (Number.isFinite(point.y) ? point.y : 0) + CITY_WALL_BUILD_OPTS.height * 0.5;
          rawPoints.push(point);
        }
        const filtered = dedupeSequentialPoints(rawPoints);
        if (filtered.length < 2) continue;
        if (closed) {
          const first = filtered[0];
          const last = filtered[filtered.length - 1];
          if (first.distanceTo(last) > CITY_WALL_POINT_EPSILON) {
            filtered.push(first.clone());
          } else {
            filtered[filtered.length - 1] = first.clone();
          }
          if (filtered.length < 3) continue;
        }

        const wall = makeWallPath(filtered, CITY_WALL_BUILD_OPTS);
        if (!wall || wall.children.length === 0) continue;
        const nameForWall = rawName || props.title || 'City Wall';
        wall.name = nameForWall;
        wall.userData.monument = nameForWall;
        wall.userData.kind = 'city_wall';
        wall.traverse((child) => {
          if (child && child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        root.add(wall);
      }
      continue;
    }

    // Long Walls (LineStrings) → wall modules
    if (f.geometry?.type === 'LineString') {
      const isLongWall = /long wall|phaler|piraeus/i.test(name);
      if (!isLongWall) continue;

      const pts = f.geometry.coordinates.map(([lon, lat]) => toWorld(lon, lat));
      const wall = makeWallPath(pts, { segment: 10, height: 4, width: 2.5 });
      root.add(wall);
    }
  }

  return root;
}
