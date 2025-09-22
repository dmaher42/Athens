import * as THREE from 'three';
import { makeTemple, makeStoa, makeTheatre, makeTholos, makeWallPath } from './building-kit.js';

const deg = (d)=> THREE.MathUtils.degToRad(d);

function normalizeName(s='') {
  return s
    .replace(/[’']/g, "'")
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    // common shorthands
    .replace(/\bodeon\b.*herodes.*atticus/, 'odeon of herodes atticus')
    .replace(/\bdionysus\b.*theatre|\btheatre of dionysus\b/, 'theatre of dionysus')
    .replace(/\bolymp(e)?ion\b/, 'olympeion')
    .replace(/\bhadrian.?s library/, "hadrian's library");
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
      const [lon, lat] = f.geometry.coordinates;
      const pos = toWorld(lon, lat);

      const cfg = cfgDirect;
      if (!cfg) continue; // unknown names are skipped for buildings (but still in pins/labels)

      let mesh;
      if (cfg.kind === 'temple')    mesh = makeTemple(cfg.dims);
      else if (cfg.kind === 'stoa') mesh = makeStoa(cfg.dims);
      else if (cfg.kind === 'theatre') mesh = makeTheatre(cfg.dims);
      else if (cfg.kind === 'tholos')  mesh = makeTholos(cfg.dims);

      mesh.position.copy(pos);
      mesh.rotation.y = deg(rotDeg);
      mesh.traverse(o => (o.castShadow = o.receiveShadow = false));
      mesh.userData.monument = rawName || name;

      root.add(mesh);
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
