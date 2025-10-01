// PLACER_START
import * as THREE from 'three';
import { KNOWN_LANDMARK_KEYS } from '../config/landmarkLayout.ts';

const DEFAULT_LANDMARKS = [...KNOWN_LANDMARK_KEYS];

const KEY_BINDINGS = {
  next: { key: ']', code: 'BracketRight' },
  prev: { key: '[', code: 'BracketLeft' },
  exit: { key: 'l', code: 'KeyL' },
  saveCode: 'F9'
};

function matchesKey(event, binding) {
  if (!event || !binding) return false;
  const key = typeof event.key === 'string' ? event.key : '';
  if (binding.key && key.toLowerCase() === String(binding.key).toLowerCase()) {
    return true;
  }
  const code = typeof event.code === 'string' ? event.code : '';
  if (binding.code && code === binding.code) {
    return true;
  }
  return false;
}

function shouldIgnoreKeyEvent(event) {
  const target = event?.target;
  if (!target || typeof target !== 'object') {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true;
    }
    if (typeof target.closest === 'function') {
      const editable = target.closest('input, textarea, select, [contenteditable="true"]');
      if (editable) {
        return true;
      }
    }
  }
  return false;
}

const POINTER_BUTTON_PRIMARY = 0;

function isGround(mesh) {
  if (!mesh) return false;
  if (mesh.userData?.isGround) return true;
  const name = mesh.name ? String(mesh.name) : '';
  return /ground|terrain|grass|soil|floor/i.test(name);
}

function createLabelSprite(text) {
  if (typeof document === 'undefined') {
    const fallback = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff }));
    fallback.scale.setScalar(0.01);
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(6, 3, 1);
  sprite.userData.__canvas = canvas;
  sprite.userData.__context = ctx;
  sprite.userData.__texture = texture;
  return sprite;
}

function updateLabelSprite(sprite, text) {
  const canvas = sprite?.userData?.__canvas;
  const ctx = sprite?.userData?.__context;
  const texture = sprite?.userData?.__texture;
  if (!canvas || !ctx || !texture) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

function createHud() {
  if (typeof document === 'undefined') {
    return null;
  }
  const hud = document.createElement('div');
  hud.style.position = 'fixed';
  hud.style.left = '16px';
  hud.style.bottom = '24px';
  hud.style.padding = '12px 16px';
  hud.style.background = 'rgba(15, 23, 42, 0.75)';
  hud.style.color = '#f8fafc';
  hud.style.fontFamily = 'system-ui, sans-serif';
  hud.style.fontSize = '14px';
  hud.style.lineHeight = '1.4';
  hud.style.borderRadius = '8px';
  hud.style.boxShadow = '0 6px 18px rgba(2, 6, 23, 0.4)';
  hud.style.pointerEvents = 'none';
  hud.style.zIndex = '9999';
  hud.style.display = 'none';
  document.body.appendChild(hud);
  return hud;
}

function normalizeVector3(input) {
  if (!input) return null;
  if (input.isVector3) {
    return { x: input.x, y: input.y, z: input.z };
  }
  const { x, y, z } = input;
  const toNumber = (value) => {
    if (Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const nx = toNumber(x);
  const ny = toNumber(y);
  const nz = toNumber(z);
  if (nx == null || ny == null || nz == null) {
    return null;
  }
  return { x: nx, y: ny, z: nz };
}

function clonePositions(map) {
  const result = {};
  for (const [key, value] of Object.entries(map)) {
    const normalized = normalizeVector3(value);
    if (normalized) {
      result[key] = { ...normalized };
    }
  }
  return result;
}

export function createLandmarkPlacer({
  scene,
  camera,
  renderer,
  groundSampler,
  onSave
} = {}) {
  if (!scene || !camera || !renderer) {
    throw new Error('createLandmarkPlacer requires scene, camera, and renderer.');
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hud = createHud();

  const ghost = new THREE.Group();
  ghost.name = 'LandmarkPlacerGhost';
  const ringGeometry = new THREE.RingGeometry(0.35, 0.6, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ghost.add(ring);
  const pointerLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1, 12),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.6 })
  );
  pointerLine.position.y = 0.5;
  ghost.add(pointerLine);
  const label = createLabelSprite('Landmark');
  label.position.set(0, 2.2, 0);
  ghost.add(label);
  ghost.visible = false;

  const state = {
    enabled: false,
    names: [...DEFAULT_LANDMARKS],
    index: 0,
    positions: {},
    lastHit: null
  };

  let groundMeshes = [];

  const listeners = {
    pointermove: null,
    pointerdown: null,
    keydown: null
  };

  function collectGroundMeshes() {
    const meshes = [];
    scene.traverse((child) => {
      if (child && child.isMesh && isGround(child)) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  function currentName() {
    return state.names[state.index] ?? null;
  }

  function updateHud() {
    if (!hud) return;
    if (!state.enabled) {
      hud.style.display = 'none';
      hud.textContent = '';
      return;
    }
    const name = currentName() || '—';
    const saved = state.positions[name] ? ' (set)' : '';
    hud.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px;">Landmark Placer</div>
      <div>Landmark: <span style="color:#facc15;">${name}</span>${saved}</div>
      <div style="margin-top:6px;opacity:0.8;">Hotkeys: Prev [ [ ] Next | Save Ctrl/Cmd+S or F9 | Exit L/Esc</div>
    `;
    hud.style.display = 'block';
  }

  function updateGhostFromHit(hit) {
    if (!hit) {
      ghost.visible = false;
      state.lastHit = null;
      return;
    }
    ghost.visible = true;
    ghost.position.copy(hit.point);
    ghost.position.y = hit.point.y;
    pointerLine.scale.set(1, 1, 1);
    pointerLine.position.y = 0.5;
    const name = currentName();
    if (name) {
      updateLabelSprite(label, name);
    }
    state.lastHit = hit;
  }

  function raycastGroundFromMouse(event) {
    if (!renderer?.domElement) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const candidates = groundMeshes.length ? groundMeshes : collectGroundMeshes();
    const intersections = raycaster.intersectObjects(candidates, true);
    if (intersections.length) {
      const hit = intersections[0];
      return { point: hit.point.clone(), object: hit.object, hit };
    }
    return null;
  }

  function handlePointerMove(event) {
    if (!state.enabled) return;
    const hit = raycastGroundFromMouse(event);
    updateGhostFromHit(hit);
  }

  function handlePointerDown(event) {
    if (!state.enabled) return;
    if (event.button !== POINTER_BUTTON_PRIMARY) return;
    const hit = state.lastHit || raycastGroundFromMouse(event);
    if (!hit || !hit.point) return;
    const name = currentName();
    if (!name) return;
    const y = typeof groundSampler === 'function'
      ? groundSampler(hit.point.x, hit.point.z)
      : hit.point.y;
    const finalY = typeof y === 'number' ? y : hit.point.y;
    state.positions[name] = { x: hit.point.x, y: finalY, z: hit.point.z };
    updateHud();
  }

  function clampIndex(index) {
    if (!state.names.length) return 0;
    if (index < 0) return (state.names.length + index % state.names.length) % state.names.length;
    return index % state.names.length;
  }

  function selectNext(step = 1) {
    if (!state.names.length) return;
    state.index = clampIndex(state.index + step);
    updateHud();
    if (state.lastHit) {
      updateGhostFromHit(state.lastHit);
    }
  }

  function selectPrev() {
    selectNext(-1);
  }

  function handleKeyDown(event) {
    if (!state.enabled) return;
    if (shouldIgnoreKeyEvent(event)) return;
    const keyLower = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const code = typeof event.code === 'string' ? event.code : '';

    if ((event.ctrlKey || event.metaKey) && keyLower === 's') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) {
        triggerSave();
      }
      return;
    }

    if (code === KEY_BINDINGS.saveCode || event.key === KEY_BINDINGS.saveCode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) {
        triggerSave();
      }
      return;
    }

    if (matchesKey(event, KEY_BINDINGS.next)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectNext(1);
      return;
    }

    if (matchesKey(event, KEY_BINDINGS.prev)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectPrev();
      return;
    }

    if (keyLower === 'escape' || matchesKey(event, KEY_BINDINGS.exit)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      api.disable();
    }
  }

  function triggerSave() {
    if (typeof onSave === 'function') {
      const payload = clonePositions(state.positions);
      onSave(payload);
    }
  }

  function bindListeners() {
    if (!renderer?.domElement) return;
    listeners.pointermove = handlePointerMove;
    listeners.pointerdown = handlePointerDown;
    listeners.keydown = handleKeyDown;
    renderer.domElement.addEventListener('pointermove', listeners.pointermove);
    renderer.domElement.addEventListener('pointerdown', listeners.pointerdown);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', listeners.keydown, true);
    }
  }

  function unbindListeners() {
    if (renderer?.domElement && listeners.pointermove) {
      renderer.domElement.removeEventListener('pointermove', listeners.pointermove);
    }
    if (renderer?.domElement && listeners.pointerdown) {
      renderer.domElement.removeEventListener('pointerdown', listeners.pointerdown);
    }
    if (listeners.keydown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', listeners.keydown, true);
    }
    listeners.pointermove = null;
    listeners.pointerdown = null;
    listeners.keydown = null;
  }

  const api = {
    enable() {
      if (state.enabled) return;
      state.enabled = true;
      groundMeshes = collectGroundMeshes();
      if (!scene.getObjectByName(ghost.name)) {
        scene.add(ghost);
      }
      ghost.visible = false;
      bindListeners();
      updateHud();
    },
    disable() {
      if (!state.enabled) return;
      state.enabled = false;
      ghost.visible = false;
      state.lastHit = null;
      unbindListeners();
      updateHud();
    },
    isEnabled() {
      return state.enabled;
    },
    getState() {
      return {
        enabled: state.enabled,
        current: currentName(),
        index: state.index,
        names: [...state.names],
        positions: clonePositions(state.positions)
      };
    },
    setList(list) {
      if (!Array.isArray(list) || list.length === 0) {
        return;
      }
      state.names = [...list];
      state.index = 0;
      updateHud();
    },
    next() {
      selectNext(1);
    },
    prev() {
      selectPrev();
    },
    save() {
      triggerSave();
    },
    set(name, position) {
      if (!name || !position) return;
      const normalized = normalizeVector3(position);
      if (!normalized) return;
      state.positions[name] = normalized;
      updateHud();
    },
    list() {
      return [...state.names];
    },
    export() {
      return clonePositions(state.positions);
    },
    refreshGround() {
      groundMeshes = collectGroundMeshes();
    }
  };

  return api;
}
// PLACER_END
