import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

let districtsGroup = null;
let districtFillGroup = null;
let districtOutlineGroup = null;
let fillsVisible = true;
let outlinesVisible = true;
let resizeListenerAttached = false;
const outlineMaterials = new Set();
const districtChangeHandlers = new Set();
let currentDistricts = [];

function ensureDistrictLayer() {
  if (districtsGroup) {
    return;
  }

  districtsGroup = new THREE.Group();
  districtsGroup.name = 'DistrictsLayer';
  districtsGroup.position.y = 0.02;

  districtFillGroup = new THREE.Group();
  districtFillGroup.name = 'DistrictFills';
  districtFillGroup.renderOrder = 1;

  districtOutlineGroup = new THREE.Group();
  districtOutlineGroup.name = 'DistrictOutlines';
  districtOutlineGroup.renderOrder = 2;

  districtsGroup.add(districtFillGroup);
  districtsGroup.add(districtOutlineGroup);
}

function updateLineMaterialResolution() {
  if (typeof window === 'undefined' || !outlineMaterials.size) {
    return;
  }

  const width = Math.max(1, window.innerWidth || 1);
  const height = Math.max(1, window.innerHeight || 1);

  outlineMaterials.forEach((material) => {
    if (material && material.resolution) {
      material.resolution.set(width, height);
    }
  });
}

function attachResizeListener() {
  if (resizeListenerAttached || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('resize', updateLineMaterialResolution);
  resizeListenerAttached = true;
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  if (material instanceof LineMaterial) {
    outlineMaterials.delete(material);
  }

  if (typeof material.dispose === 'function') {
    material.dispose();
  }
}

function clearGroup(group) {
  if (!group) {
    return;
  }

  for (let i = group.children.length - 1; i >= 0; i -= 1) {
    const child = group.children[i];
    group.remove(child);

    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }

    disposeMaterial(child.material);
  }
}

function computePolygonCentroid(polygon) {
  let area = 0;
  let cx = 0;
  let cz = 0;

  const count = polygon.length;
  if (count === 0) {
    return { x: 0, z: 0 };
  }

  for (let i = 0; i < count; i += 1) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % count];
    const cross = x1 * z2 - x2 * z1;
    area += cross;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
  }

  area *= 0.5;

  if (Math.abs(area) < 1e-5) {
    let sumX = 0;
    let sumZ = 0;
    polygon.forEach(([x, z]) => {
      sumX += x;
      sumZ += z;
    });
    return { x: sumX / count, z: sumZ / count };
  }

  const factor = 1 / (6 * area);
  return { x: cx * factor, z: cz * factor };
}

function pointOnSegment(px, pz, x1, z1, x2, z2) {
  const epsilon = 1e-6;
  const cross = (pz - z1) * (x2 - x1) - (px - x1) * (z2 - z1);
  if (Math.abs(cross) > epsilon) {
    return false;
  }

  const dot = (px - x1) * (px - x2) + (pz - z1) * (pz - z2);
  return dot <= epsilon;
}

function isPointInPolygon(x, z, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];

    if (pointOnSegment(x, z, xi, zi, xj, zj)) {
      return true;
    }

    const intersects = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-7) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function notifyDistrictsChanged() {
  if (!districtChangeHandlers.size) {
    return;
  }

  const snapshot = currentDistricts.map((district) => ({ ...district }));
  districtChangeHandlers.forEach((handler) => {
    try {
      handler(snapshot);
    } catch (error) {
      console.warn('[districts] change handler error', error);
    }
  });
}

export function createDistrictsLayer({ scene } = {}) {
  ensureDistrictLayer();
  attachResizeListener();

  if (scene && !scene.children.includes(districtsGroup)) {
    scene.add(districtsGroup);
  }

  return districtsGroup;
}

export function setDistricts(districtDefs = []) {
  ensureDistrictLayer();
  clearGroup(districtFillGroup);
  clearGroup(districtOutlineGroup);
  outlineMaterials.clear();

  const processed = [];

  districtDefs.forEach((def, index) => {
    if (!def || !Array.isArray(def.polygon) || def.polygon.length < 3) {
      return;
    }

    const id = def.id || `district-${index}`;
    const name = def.name || id;
    const dustBias = typeof def.dustBias === 'number' ? THREE.MathUtils.clamp(def.dustBias, 0, 1) : 0;
    const baseColor = new THREE.Color(def.color !== undefined ? def.color : 0xffd700);

    const polygon = def.polygon.map((vertex) => {
      if (!Array.isArray(vertex) || vertex.length < 2) {
        return [0, 0];
      }
      const [vx, vz] = vertex;
      return [Number(vx) || 0, Number(vz) || 0];
    });

    const centroid = computePolygonCentroid(polygon);

    const shape = new THREE.Shape(polygon.map(([vx, vz]) => new THREE.Vector2(vx, vz)));
    const shapeGeometry = new THREE.ShapeGeometry(shape);
    const fillColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.7);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true
    });

    const fillMesh = new THREE.Mesh(shapeGeometry, fillMaterial);
    fillMesh.rotation.x = -Math.PI / 2;
    fillMesh.name = `district-fill-${id}`;
    fillMesh.renderOrder = districtFillGroup.renderOrder;
    fillMesh.userData.districtId = id;
    districtFillGroup.add(fillMesh);

    const outlinePositions = [];
    polygon.forEach(([vx, vz]) => {
      outlinePositions.push(vx, 0, vz);
    });
    outlinePositions.push(polygon[0][0], 0, polygon[0][1]);

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(outlinePositions);

    const lineColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.3);
    const lineMaterial = new LineMaterial({
      color: lineColor.getHex(),
      linewidth: 3,
      transparent: true,
      opacity: 0.6,
      depthWrite: true,
      depthTest: true,
      alphaToCoverage: true
    });

    if (typeof window !== 'undefined' && lineMaterial.resolution) {
      lineMaterial.resolution.set(Math.max(1, window.innerWidth || 1), Math.max(1, window.innerHeight || 1));
    }

    const line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();
    line.name = `district-outline-${id}`;
    line.renderOrder = districtOutlineGroup.renderOrder;
    line.position.y = 0.001;
    line.userData.districtId = id;
    districtOutlineGroup.add(line);
    outlineMaterials.add(lineMaterial);

    processed.push({
      id,
      name,
      color: baseColor.getHex(),
      polygon,
      centroid,
      dustBias
    });
  });

  currentDistricts = processed;
  districtFillGroup.visible = fillsVisible;
  districtOutlineGroup.visible = outlinesVisible;

  updateLineMaterialResolution();
  notifyDistrictsChanged();

  return currentDistricts;
}

export function getDistrictAt(x, z) {
  if (!currentDistricts.length || typeof x !== 'number' || typeof z !== 'number') {
    return null;
  }

  for (const district of currentDistricts) {
    if (isPointInPolygon(x, z, district.polygon)) {
      return district;
    }
  }

  return null;
}

export function onDistrictsChanged(handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }

  districtChangeHandlers.add(handler);

  if (currentDistricts.length) {
    try {
      handler(currentDistricts.map((district) => ({ ...district })));
    } catch (error) {
      console.warn('[districts] change handler error', error);
    }
  }

  return () => {
    districtChangeHandlers.delete(handler);
  };
}

export function setDistrictFillsVisible(visible) {
  fillsVisible = Boolean(visible);
  if (districtFillGroup) {
    districtFillGroup.visible = fillsVisible;
  }
}

export function setDistrictOutlinesVisible(visible) {
  outlinesVisible = Boolean(visible);
  if (districtOutlineGroup) {
    districtOutlineGroup.visible = outlinesVisible;
  }
}

export function areDistrictFillsVisible() {
  return fillsVisible;
}

export function areDistrictOutlinesVisible() {
  return outlinesVisible;
}

export function getDistricts() {
  return currentDistricts.map((district) => ({ ...district }));
}
