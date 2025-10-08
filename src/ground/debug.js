import * as THREE from 'three';

const COLOR_LOW = new THREE.Color(0x2c7be5);
const COLOR_HIGH = new THREE.Color(0xff5f57);
const SKIRT_COLOR = new THREE.Color(0xffc53d);
const LABEL_PADDING = 12;
const LABEL_FONT = '24px "Fira Sans", "Helvetica Neue", Arial, sans-serif';

let activeDebugGroup = null;
let activeScene = null;
let overlayEl = null;

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  try {
    material.map?.dispose?.();
  } catch {}
  try {
    material.dispose?.();
  } catch {}
}

function disposeGeometry(geometry) {
  if (!geometry) return;
  try {
    geometry.dispose?.();
  } catch {}
}

function disposeDebugGroup() {
  if (!activeDebugGroup) return;
  activeDebugGroup.traverse((child) => {
    if (child.isLine || child.isLineSegments) {
      disposeMaterial(child.material);
      disposeGeometry(child.geometry);
    }
    if (child.isSprite) {
      const material = child.material;
      disposeMaterial(material);
    }
  });
  activeScene?.remove(activeDebugGroup);
  activeDebugGroup = null;
  activeScene = null;
}

function ensureOverlayElement() {
  if (typeof document === 'undefined') return null;
  if (overlayEl) return overlayEl;

  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.left = '12px';
  el.style.top = '12px';
  el.style.padding = '8px 12px';
  el.style.background = 'rgba(12, 18, 35, 0.85)';
  el.style.color = '#e2f0ff';
  el.style.font = '12px/16px monospace';
  el.style.whiteSpace = 'pre';
  el.style.borderRadius = '6px';
  el.style.zIndex = '99999';
  el.style.pointerEvents = 'none';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';

  document.body?.appendChild(el);
  overlayEl = el;
  return el;
}

function removeOverlayElement() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
}

function updateOverlayText({
  tileCount,
  minHeight,
  maxHeight,
  preventTileSeams,
  stabilizeTileOverlap,
  addElevationSkirts,
  skirtCount,
}) {
  const el = ensureOverlayElement();
  if (!el) return;
  const minText = Number.isFinite(minHeight) ? minHeight.toFixed(3) : 'n/a';
  const maxText = Number.isFinite(maxHeight) ? maxHeight.toFixed(3) : 'n/a';

  el.textContent = [
    `Ground Debug`,
    `Tiles: ${tileCount} | Skirts: ${skirtCount}`,
    `Height: ${minText} – ${maxText}`,
    `Flags: seams=${preventTileSeams ? 'on' : 'off'}, overlap=${stabilizeTileOverlap ? 'on' : 'off'}, skirts=${addElevationSkirts ? 'on' : 'off'}`,
  ].join('\n');
}

function heightToColor(height, minHeight, maxHeight) {
  const color = new THREE.Color();
  if (!Number.isFinite(height) || !Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
    return color.copy(COLOR_LOW);
  }
  if (maxHeight - minHeight < 1e-6) {
    return color.copy(COLOR_LOW);
  }
  const t = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  return color.copy(COLOR_LOW).lerp(COLOR_HIGH, t);
}

function createTileWireframe(tile, minHeight, maxHeight) {
  const size = tile.coverageSize ?? tile.dirtSize ?? tile.definition?.size ?? 1;
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.01, size));
  const height = typeof tile.surfaceY === 'number' ? tile.surfaceY : tile.position?.y ?? 0;
  const material = new THREE.LineBasicMaterial({
    color: heightToColor(height, minHeight, maxHeight),
    transparent: true,
    opacity: 0.9,
    depthTest: true,
  });
  const wire = new THREE.LineSegments(geometry, material);
  wire.position.copy(tile.position);
  wire.position.y = height + 0.02;
  wire.name = `ground:debug:tile:${tile.index}`;
  return wire;
}

function createLabelSprite(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(12, 18, 35, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#ffd66b';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, LABEL_PADDING, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.6, 0.3, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function createSkirtMarker(tile, skirt) {
  if (!tile?.dirtGroup || !skirt) return null;
  const group = new THREE.Group();
  group.name = `ground:debug:skirt:${tile.index}:${skirt.direction}`;

  tile.dirtGroup.updateWorldMatrix?.(true, true);
  const topWorld = tile.dirtGroup.localToWorld(skirt.topLocal.clone());
  const bottomWorld = tile.dirtGroup.localToWorld(skirt.bottomLocal.clone());

  const positions = new Float32Array([
    bottomWorld.x, bottomWorld.y, bottomWorld.z,
    topWorld.x, topWorld.y, topWorld.z,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: SKIRT_COLOR,
    linewidth: 2,
    transparent: true,
    opacity: 0.95,
  });

  const line = new THREE.Line(geometry, material);
  group.add(line);

  const label = createLabelSprite(`Δ=${skirt.height.toFixed(3)}`);
  if (label) {
    label.position.copy(topWorld.clone().add(new THREE.Vector3(0, 0.1, 0)));
    group.add(label);
  }

  return group;
}

function buildDebugGroup(scene, ground, stats) {
  const group = new THREE.Group();
  group.name = 'ground:debug';

  const tiles = ground?.tiles ?? ground?.root?.userData?.tileInstances ?? [];
  ground?.root?.updateWorldMatrix?.(true, true);
  const minHeight = stats.minHeight;
  const maxHeight = stats.maxHeight;

  tiles.forEach((tile) => {
    const wire = createTileWireframe(tile, minHeight, maxHeight);
    if (wire) group.add(wire);
  });

  tiles.forEach((tile) => {
    if (!Array.isArray(tile.skirts)) return;
    tile.skirts.forEach((skirt) => {
      const marker = createSkirtMarker(tile, skirt);
      if (marker) group.add(marker);
    });
  });

  scene.add(group);
  return group;
}

function computeStats(ground) {
  const tiles = ground?.tiles ?? ground?.root?.userData?.tileInstances ?? [];
  const heights = tiles.map((tile) => (typeof tile.surfaceY === 'number' ? tile.surfaceY : tile.position?.y ?? 0));
  const minHeight = heights.length ? Math.min(...heights) : 0;
  const maxHeight = heights.length ? Math.max(...heights) : 0;
  const skirtCount = tiles.reduce((total, tile) => total + (tile.skirts?.length ?? 0), 0);
  return { tiles, minHeight, maxHeight, skirtCount };
}

export function updateGroundDebugOverlay(scene, ground, {
  enabled = false,
  preventTileSeams = true,
  stabilizeTileOverlap = true,
  addElevationSkirts = false,
} = {}) {
  if (!enabled || !scene || !ground) {
    disposeDebugGroup();
    removeOverlayElement();
    return;
  }

  if (activeDebugGroup) {
    disposeDebugGroup();
  }

  const stats = computeStats(ground);
  const group = buildDebugGroup(scene, ground, stats);

  activeDebugGroup = group;
  activeScene = scene;

  updateOverlayText({
    tileCount: stats.tiles.length,
    minHeight: stats.minHeight,
    maxHeight: stats.maxHeight,
    preventTileSeams,
    stabilizeTileOverlap,
    addElevationSkirts,
    skirtCount: stats.skirtCount,
  });
}

export function clearGroundDebugOverlay() {
  disposeDebugGroup();
  removeOverlayElement();
}
