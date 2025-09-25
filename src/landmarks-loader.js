import THREE from './three.js';
import { applyFeatureOffset } from './geo/featureOffsets.js';

const WORLD_COMPRESSION = 0.5; // 50% closer

function applyWorldCompression(vector) {
  if (!vector) {
    return vector;
  }
  if (typeof vector.x === 'number') {
    vector.x *= WORLD_COMPRESSION;
  }
  if (typeof vector.z === 'number') {
    vector.z *= WORLD_COMPRESSION;
  }
  return vector;
}

/**
 * Load every feature from a GeoJSON file and add to the scene.
 * - projector(lon, lat) -> THREE.Vector3: optional; if missing we use a local Athens projection.
 * - onPoint(feature, obj3d, worldPos): optional callback (e.g., add to mini-map).
 */
export async function loadLandmarks({
  scene,
  geoJsonUrl = './data/athens_places.geojson',
  projector = null,
  onPoint = null
}) {
  const root = new THREE.Group();
  root.name = 'Landmarks';
  scene.add(root);

  const groups = {
    democracy: new THREE.Group(),
    cultural: new THREE.Group(),
    natural: new THREE.Group(),
    lines: new THREE.Group(),
    polygons: new THREE.Group()
  };
  Object.entries(groups).forEach(([k, g]) => { g.name = `Landmarks_${k}`; root.add(g); });

  const res = await fetch(geoJsonUrl);
  if (!res.ok) throw new Error(`Failed to load ${geoJsonUrl}: ${res.status}`);
  const geo = await res.json();

  const markers = [];
  const labels = [];

  for (const f of geo.features || []) {
    const props = f.properties || {};
    const name = props.title || props.name || 'Unnamed';
    const cat = (props.category || 'cultural').toLowerCase();
    const targetGroup = groups[cat] || groups.cultural;

    if (f.geometry?.type === 'Point') {
      const [lon, lat] = applyFeatureOffset(f.geometry.coordinates, {
        properties: props,
        fallbackName: name
      });
      const pos = projector ? projector(lon, lat) : lonLatToLocal(lon, lat);
      applyWorldCompression(pos);

      const pin = makePinMesh(cat);
      pin.position.copy(pos);
      pin.userData = { name, props };
      targetGroup.add(pin);
      markers.push(pin);

      const label = makeLabelSprite(name);
      label.position.copy(pos).add(new THREE.Vector3(0, 15, 0));
      targetGroup.add(label);
      labels.push(label);

      onPoint?.(f, pin, pos.clone());

    } else if (f.geometry?.type === 'LineString') {
      const line = makeLine(f.geometry.coordinates, projector);
      line.userData = { name, props };
      groups.lines.add(line);

    } else if (f.geometry?.type === 'Polygon') {
      // Outline only (outer ring)
      const poly = makePolygonOutline(f.geometry.coordinates[0], projector);
      poly.userData = { name, props };
      groups.polygons.add(poly);

    } else if (f.geometry?.type === 'MultiLineString') {
      for (const seg of f.geometry.coordinates) {
        const line = makeLine(seg, projector);
        line.userData = { name, props };
        groups.lines.add(line);
      }
    } else if (f.geometry?.type === 'MultiPolygon') {
      for (const polyCoords of f.geometry.coordinates) {
        const poly = makePolygonOutline(polyCoords[0], projector);
        poly.userData = { name, props };
        groups.polygons.add(poly);
      }
    }
  }

  // keep labels facing the camera (utility; call this each frame)
  const update = (camera) => {
    for (const s of labels) s.quaternion.copy(camera.quaternion);
  };

  return { root, groups, markers, labels, update };
}

/* ---------- helpers ---------- */

function lonLatToLocal(lon, lat) {
  // Simple local meters-at-Athens projection centered near Syntagma
  const lon0 = 23.7275, lat0 = 37.9838;
  const toRad = Math.PI / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * toRad) + 1.175 * Math.cos(4 * lat0 * toRad);
  const mPerDegLon = 111412.84 * Math.cos(lat0 * toRad) - 93.5 * Math.cos(3 * lat0 * toRad);
  const x = (lon - lon0) * mPerDegLon;
  const z = -(lat - lat0) * mPerDegLat; // -lat so north is -Z (Three's default forward)
  return new THREE.Vector3(x, 0, z);
}

function makePinMesh(cat) {
  const colors = { democracy: 0x14b8a6, cultural: 0x60a5fa, natural: 0x22c55e };
  const c = colors[cat] ?? 0x60a5fa;

  const pin = new THREE.Group();

  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 4, 8),
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15 })
  );
  stalk.position.y = 2;

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 6.5, 10),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, roughness: 0.45, metalness: 0.15 })
  );
  head.position.y = 7;
  head.rotation.x = Math.PI;

  pin.add(stalk, head);
  pin.castShadow = false; pin.receiveShadow = false;
  return pin;
}

function makeLabelSprite(text) {
  const pad = 6, fontPx = 28;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial`;
  const tw = Math.ceil(ctx.measureText(text).width);

  canvas.width = tw + pad * 2;
  canvas.height = fontPx + pad * 2;

  // bg
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  // text
  ctx.fillStyle = '#e2e8f0';
  ctx.textBaseline = 'top';
  ctx.fillText(text, pad, pad);

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(canvas.width / 6, canvas.height / 6, 1);
  s.renderOrder = 10;
  return s;
}

function makeLine(coords, projector) {
  const pts = coords.map(([lon, lat]) => {
    const v = projector ? projector(lon, lat) : lonLatToLocal(lon, lat);
    return applyWorldCompression(v);
  });
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.95 });
  return new THREE.Line(geom, mat);
}

function makePolygonOutline(coords, projector) {
  const pts = coords.map(([lon, lat]) => {
    const v = projector ? projector(lon, lat) : lonLatToLocal(lon, lat);
    return applyWorldCompression(v);
  });
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({ color: 0xa8a29e, dashSize: 6, gapSize: 3, transparent: true, opacity: 0.85 });
  const loop = new THREE.LineLoop(geom, mat);
  loop.computeLineDistances();
  return loop;
}
