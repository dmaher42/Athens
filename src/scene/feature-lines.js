import THREE from '../three.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const DEFAULT_STYLE_MAP = {
  road: { color: 0xC8B68A, width: 2.0, dashed: false, opacity: 0.85 },
  sacred_way: { color: 0xFFD166, width: 3.0, dashed: false, opacity: 0.95 },
  long_walls: {
    color: 0x7DD3FC,
    width: 2.5,
    dashed: true,
    dashSize: 0.15,
    gapSize: 0.08,
    opacity: 0.9
  },
  city_wall: { color: 0x94A3B8, width: 3.2, dashed: false, opacity: 0.9 },
  district: {
    color: 0xA8A29E,
    width: 1.8,
    dashed: true,
    dashSize: 0.12,
    gapSize: 0.08,
    opacity: 0.7
  }
};

const PATCHED_CAMERA_FLAG = '__featureLinesProjectionPatched';
const tempSize = new THREE.Vector2(1, 1);

function cloneStyle(style) {
  return style ? { ...style } : {};
}

function ensureVector3(value) {
  if (!value) {
    return null;
  }
  if (value.isVector3) {
    return value.clone();
  }
  const { x, y, z } = value;
  if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
    return new THREE.Vector3(x, y, z);
  }
  return null;
}

function getRendererSize() {
  const globalScope = typeof window !== 'undefined' ? window : undefined;
  const renderer = globalScope?.renderer;

  if (renderer?.getSize) {
    renderer.getSize(tempSize);
    return { width: Math.max(1, tempSize.x), height: Math.max(1, tempSize.y) };
  }

  const canvas = renderer?.domElement;
  if (canvas) {
    return {
      width: Math.max(1, canvas.width || 0),
      height: Math.max(1, canvas.height || 0)
    };
  }

  return {
    width: Math.max(1, globalScope?.innerWidth || 1),
    height: Math.max(1, globalScope?.innerHeight || 1)
  };
}

function updateMaterialStyle(material, style) {
  if (!material || !style) {
    return;
  }

  material.linewidth = typeof style.width === 'number' ? style.width : material.linewidth;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.opacity = typeof style.opacity === 'number' ? style.opacity : material.opacity;

  if (!material.color) {
    material.color = new THREE.Color();
  }
  material.color.set(style.color ?? 0xffffff);
  if (typeof material.color.convertSRGBToLinear === 'function') {
    material.color.convertSRGBToLinear();
  }

  const dashed = Boolean(style.dashed);
  material.dashed = dashed;

  if (dashed) {
    material.defines = material.defines || {};
    material.defines.USE_DASH = '';
    material.dashSize = typeof style.dashSize === 'number' ? style.dashSize : (material.dashSize || 1);
    material.gapSize = typeof style.gapSize === 'number' ? style.gapSize : (material.gapSize || 1);
  } else if (material.defines && material.defines.USE_DASH !== undefined) {
    delete material.defines.USE_DASH;
  }

  material.needsUpdate = true;
}

function determineCategory(feature) {
  const geometryType = feature?.geometry?.type || '';
  const props = feature?.properties || {};
  const title = (props.title || props.name || '').toString().toLowerCase();
  const category = (props.category || '').toString().toLowerCase();

  if (title.includes('sacred way')) {
    return 'sacred_way';
  }
  if (title.includes('long walls')) {
    return 'long_walls';
  }
  if (category === 'city_wall') {
    return 'city_wall';
  }
  if (category === 'district' || /polygon$/i.test(geometryType)) {
    return 'district';
  }
  return 'road';
}

function computePositions(coords, projector, worldCompressionFn) {
  const positions = [];

  if (!Array.isArray(coords)) {
    return positions;
  }

  coords.forEach((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return;
    }

    const [lon, lat] = point;
    let projected = null;
    try {
      projected = typeof projector === 'function' ? projector(lon, lat) : null;
    } catch (error) {
      projected = null;
    }

    const base = ensureVector3(projected);
    if (!base) {
      return;
    }

    let world = base;
    if (typeof worldCompressionFn === 'function') {
      const result = worldCompressionFn(base.clone ? base.clone() : base);
      if (result && result.isVector3) {
        world = result;
      } else if (result && typeof result.x === 'number' && typeof result.y === 'number' && typeof result.z === 'number') {
        world = new THREE.Vector3(result.x, result.y, result.z);
      }
    }

    positions.push(world.x || 0, world.y || 0, world.z || 0);
  });

  return positions;
}

function ensureClosedLoop(points) {
  if (points.length < 6) {
    return points;
  }

  const firstX = points[0];
  const firstY = points[1];
  const firstZ = points[2];
  const lastX = points[points.length - 3];
  const lastY = points[points.length - 2];
  const lastZ = points[points.length - 1];

  if (firstX !== lastX || firstY !== lastY || firstZ !== lastZ) {
    points.push(firstX, firstY, firstZ);
  }
  return points;
}

function patchCameraProjection(updateResolution) {
  const globalScope = typeof window !== 'undefined' ? window : undefined;
  const camera = globalScope?.camera;
  if (!camera || camera[PATCHED_CAMERA_FLAG] || typeof camera.updateProjectionMatrix !== 'function') {
    return;
  }

  const original = camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix = function patchedProjectionMatrix(...args) {
    const result = original(...args);
    updateResolution();
    return result;
  };
  camera[PATCHED_CAMERA_FLAG] = true;
}

export function toPoints(coords, projector, worldCompressionFn) {
  const positions = computePositions(coords, projector, worldCompressionFn);
  return new Float32Array(positions);
}

export function createFeatureLines({ features = [], projector, worldCompressionFn } = {}) {
  const root = new THREE.Group();
  root.name = 'FeatureLines';
  root.renderOrder = 2;

  const styleMap = Object.keys(DEFAULT_STYLE_MAP).reduce((acc, key) => {
    acc[key] = cloneStyle(DEFAULT_STYLE_MAP[key]);
    return acc;
  }, {});

  const materials = new Map();
  const meshesByCategory = new Map();

  let lastWidth = 0;
  let lastHeight = 0;
  const updateResolution = () => {
    const { width, height } = getRendererSize();
    if (width === lastWidth && height === lastHeight) {
      return;
    }
    lastWidth = width;
    lastHeight = height;
    materials.forEach((material) => {
      if (material?.resolution) {
        material.resolution.set(width, height);
      }
    });
  };

  const getMaterialForCategory = (category) => {
    if (materials.has(category)) {
      return materials.get(category);
    }

    const style = styleMap[category] || styleMap.road;
    const material = new LineMaterial({
      linewidth: style.width,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      opacity: style.opacity,
      dashed: Boolean(style.dashed)
    });

    material.resolution = new THREE.Vector2(1, 1);
    materials.set(category, material);
    updateMaterialStyle(material, style);
    updateResolution();

    return material;
  };

  const addMeshForCategory = (category, mesh) => {
    if (!meshesByCategory.has(category)) {
      meshesByCategory.set(category, new Set());
    }
    meshesByCategory.get(category).add(mesh);
  };

  const makeLineMesh = (positions, category, yOffset = 0.05) => {
    if (!positions || positions.length < 6) {
      return null;
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = getMaterialForCategory(category);
    const line = new Line2(geometry, material);
    if (typeof line.computeLineDistances === 'function') {
      line.computeLineDistances();
    }

    line.frustumCulled = true;
    line.position.y += yOffset;
    line.renderOrder = 2;

    root.add(line);
    addMeshForCategory(category, line);
    return line;
  };

  features.forEach((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) {
      return;
    }

    const category = determineCategory(feature);
    const props = feature?.properties || {};
    const name = props.title || props.name || 'Unnamed';
    const yOffset = /polygon$/i.test(geometry.type) ? 0.06 : 0.05;

    if (geometry.type === 'LineString') {
      const positions = computePositions(geometry.coordinates, projector, worldCompressionFn);
      const mesh = makeLineMesh(positions, category, yOffset);
      if (mesh) {
        mesh.userData = { feature, name, props };
      }
    } else if (geometry.type === 'MultiLineString') {
      geometry.coordinates.forEach((segment) => {
        const positions = computePositions(segment, projector, worldCompressionFn);
        const mesh = makeLineMesh(positions, category, yOffset);
        if (mesh) {
          mesh.userData = { feature, name, props };
        }
      });
    } else if (geometry.type === 'Polygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
        return;
      }
      const ring = geometry.coordinates[0];
      const positions = ensureClosedLoop(computePositions(ring, projector, worldCompressionFn));
      const mesh = makeLineMesh(positions, 'district', yOffset);
      if (mesh) {
        mesh.userData = { feature, name, props };
      }
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((poly) => {
        if (!Array.isArray(poly) || !poly.length) {
          return;
        }
        const ring = poly[0];
        const positions = ensureClosedLoop(computePositions(ring, projector, worldCompressionFn));
        const mesh = makeLineMesh(positions, 'district', yOffset);
        if (mesh) {
          mesh.userData = { feature, name, props };
        }
      });
    }
  });

  updateResolution();
  patchCameraProjection(updateResolution);

  if (typeof window !== 'undefined') {
    const resizeHandler = () => updateResolution();
    window.addEventListener('resize', resizeHandler);
    root.userData = root.userData || {};
    root.userData.onDisposeFeatureLines = () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }

  const setVisible = (visible) => {
    root.visible = Boolean(visible);
  };

  const setStyle = (partialMap = {}) => {
    Object.entries(partialMap).forEach(([category, patch]) => {
      if (!patch || typeof patch !== 'object') {
        return;
      }
      const current = styleMap[category] ? cloneStyle(styleMap[category]) : cloneStyle(styleMap.road);
      const nextStyle = { ...current, ...patch };
      styleMap[category] = nextStyle;

      const material = getMaterialForCategory(category);
      updateMaterialStyle(material, nextStyle);

      const meshes = meshesByCategory.get(category);
      if (meshes) {
        meshes.forEach((mesh) => {
          if (mesh && typeof mesh.computeLineDistances === 'function') {
            mesh.computeLineDistances();
          }
        });
      }
    });
  };

  return {
    root,
    setVisible,
    setStyle,
    updateResolution
  };
}

export const FEATURE_LINE_STYLES = DEFAULT_STYLE_MAP;
