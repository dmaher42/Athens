import * as THREE from 'three';
import { makeTemple, makeStoa, makeTheatre, makeTholos, makeWallPath } from './building-kit.js';

const deg = (d)=> THREE.MathUtils.degToRad(d);

/** Known monuments with sensible defaults (easy to tweak) */
const REGISTRY = {
  // Acropolis
  'Parthenon':            { kind: 'temple',  dims: { width: 31, length: 70, colsShort: 8, colsLong: 17, colH: 11 } },
  'Erechtheion':          { kind: 'temple',  dims: { width: 13, length: 24, colsShort: 6, colsLong: 12, colH: 8  } },
  'Propylaea':            { kind: 'stoa',    dims: { length: 50, depth: 22, colH: 10, cols: 20 } },
  'Temple of Athena Nike':{ kind: 'temple',  dims: { width: 8,  length: 13, colsShort: 4, colsLong: 6,  colH: 6  } },

  // South slope
  'Theatre of Dionysus':  { kind: 'theatre', dims: { radius: 60, height: 18, steps: 28 } },
  'Odeon of Herodes Atticus': { kind: 'theatre', dims: { radius: 45, height: 16, steps: 24 } },

  // City
  'Temple of Olympian Zeus': { kind: 'temple', dims: { width: 44, length: 110, colsShort: 8, colsLong: 20, colH: 17 } },
  'Roman Agora':          { kind: 'stoa',    dims: { length: 95, depth: 35, colH: 9, cols: 36 } },
  'Tower of the Winds':   { kind: 'tholos',  dims: { radius: 6.5, colH: 6, cols: 8 } },
  "Hadrian’s Library":    { kind: 'stoa',    dims: { length: 120, depth: 80, colH: 10, cols: 40 } },
  'Panathenaic Stadium':  { kind: 'theatre', dims: { radius: 140, height: 24, steps: 32, openAngleDeg: 60 } },

  // Agora & civic
  'Temple of Hephaistos': { kind: 'temple',  dims: { width: 14, length: 32, colsShort: 6, colsLong: 13, colH: 8.5 } },
  'Stoa of Attalos':      { kind: 'stoa',    dims: { length: 115, depth: 20, colH: 9, cols: 46 } },
  'Tholos':               { kind: 'tholos',  dims: { radius: 12, colH: 6.5, cols: 18 } },
  'Bouleuterion':         { kind: 'stoa',    dims: { length: 35, depth: 28, colH: 8, cols: 10 } },
};

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
    const name = props.title || props.name || '';
    const rotDeg = props.rotation_deg ?? 0;

    if (f.geometry?.type === 'Point') {
      const [lon, lat] = f.geometry.coordinates;
      const pos = toWorld(lon, lat);

      const cfg = REGISTRY[name];
      if (!cfg) continue; // unknown names are skipped for buildings (but still in pins/labels)

      let mesh;
      if (cfg.kind === 'temple')    mesh = makeTemple(cfg.dims);
      else if (cfg.kind === 'stoa') mesh = makeStoa(cfg.dims);
      else if (cfg.kind === 'theatre') mesh = makeTheatre(cfg.dims);
      else if (cfg.kind === 'tholos')  mesh = makeTholos(cfg.dims);

      mesh.position.copy(pos);
      mesh.rotation.y = deg(rotDeg);
      mesh.traverse(o => (o.castShadow = o.receiveShadow = false));
      mesh.userData.monument = name;

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
