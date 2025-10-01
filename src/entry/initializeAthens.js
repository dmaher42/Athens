import * as THREE from 'three';
import { installRenderGuard } from '../safety/hardenPositions';
import { createStats } from '../debug/statsShim.js';
import { logger } from '../utils/logger.ts';
import { setupGround, updateTrees } from '../main.js';
import { disposeAll } from '../utils/disposable.ts';
import { loadLandmarks } from '../landmarks-loader.js';
import { createLandmarkOverlay } from '../map/landmarks.js';
// PLACER_START
import { createLandmarkPlacer } from '../dev/landmarkPlacer.js';
// PLACER_END
import { buildRoadNetwork } from '../roads/roadNetwork.js';
import { collectRoadPoints } from '../roads/collectRoadPoints.js';
import { createNpcSystem } from '../npc/npcSystem.js';
import { createMainCharacter } from '../npc/mainCharacter.js';
import { createKeyboard } from '../input/keyboard.js';
import { HOTKEY_IDS, getHotkeyDisplayEntries } from '../config/hotkeys.ts';
import { createFollowCamera } from '../camera/followCamera.js';
import { seedCameraBehindPlayer } from '../camera/seedCameraBehindPlayer.js';
import { createPlayerController } from '../player/playerController.js';
import { installFlyBypass } from '../dev/flyBypass.js';
import { bindHotkeyActions } from '../input/bindHotkeyActions.js';
import { registerScopedHotkeys } from '../input/hotkeyScopes.js';
import { createGameLoop } from '../engine/loop.js';
import { movementConfig } from '../config/movement.ts';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';
import { sampleGroundY, snapGroupToGround, snapObjectToGround, snapChildrenToGround } from '../physics/groundProject.js';
import { createCity } from '../buildings/createCity.js';
import { createOriginalUi } from '../ui/originalUi.js';
import { loadGrassMaterial } from '../materials/groundGrass.js';
import { buildNavMeshFromMeshes } from '../navmesh/buildNavMesh.js';
import { createNavMeshPathfinder } from '../navmesh/pathfinder.js';
import { loadWorldWithColliders } from '../physics/collisionWorld.ts';
import { CharacterController } from '../controls/CharacterController.ts';
import { getInput } from '../controls/input.ts';
import {
  LANDMARK_ALIASES,
  KNOWN_LANDMARK_KEYS,
  createLandmarkLayoutResolver,
  getLandmarkKeysForLayout
} from '../config/landmarkLayout.ts';
import {
  DEFAULT_CAMERA,
  DEFAULT_PLAYER,
  finiteNumber,
  isFiniteVec3,
  sanitizeEuler,
  sanitizeQuaternion,
  sanitizeVec3,
  safeSetVec3
} from '../utils/sanitize.ts';
import { CUSTOM_AMBIENT_TRACKS } from '../audio/customAmbientTracks.generated.ts';
import { initAmbient, AmbientAPI, AMBIENT_TRACKS, registerExternalAmbientTracks } from '../audio/ambient.ts';
import { createSanityGeometryController } from '../debug/sanityGeometry.js';
// SKYSYS_START
import { SKY_JPGS, GROUND_JPGS } from '../assets/skyGround.generated.ts';
import { installSkyDev } from '../dev/skyDebugHooks.js';
import { setExternalGroundTexture } from '../materials/groundGrass.js';
// SKYSYS_END
import { withTimeout as withBootTimeout } from '../boot/withTimeout.ts';

// CHAR_MAIN_HEIGHT_START
// Height scaling for the main character is no longer required.
// CHAR_MAIN_HEIGHT_END

// LANDMARK_SPREAD_START
const _TMP_WORLD = new THREE.Vector3();
const _TMP_LOCAL = new THREE.Vector3();
const _TMP_GROUND = new THREE.Vector3();

const WALKING_ENABLED = true;
const _WALK_LOOK_DIR = new THREE.Vector3();
const _WALK_LOOK_TARGET = new THREE.Vector3();

function getPhaseSetter() {
  if (typeof window !== 'undefined' && typeof window.__athensSetPhase === 'function') {
    return window.__athensSetPhase;
  }
  return () => {};
}

function _setWorldPosition(object, x, y, z) {
  if (!object?.isObject3D) return false;
  object.updateMatrixWorld(true);
  const parent = object.parent;
  if (parent?.isObject3D) {
    parent.updateMatrixWorld(true);
    _TMP_LOCAL.set(x, y, z);
    object.position.copy(parent.worldToLocal(_TMP_LOCAL));
  } else {
    object.position.set(x, y, z);
  }
  object.updateMatrixWorld(true);
  return true;
}

function _findLandmarkObject(scene, key) {
  if (!scene) return null;
  const aliases = LANDMARK_ALIASES[key] || [key];
  for (const name of aliases) {
    const exact = scene.getObjectByName(name);
    if (exact) return exact;
  }
  const lowered = aliases.map((name) => String(name).toLowerCase());
  let fallback = null;
  scene.traverse((obj) => {
    if (fallback || !obj?.name) return;
    const candidate = obj.name.toLowerCase();
    for (const needle of lowered) {
      if (candidate === needle || candidate.includes(needle)) {
        fallback = obj;
        break;
      }
    }
  });
  return fallback;
}

function _sampleSceneGround(x, z, fallbackY) {
  const baseY = Number.isFinite(fallbackY) ? fallbackY : 0;
  try {
    if (typeof raycastGroundY === 'function') {
      _TMP_GROUND.set(x, baseY, z);
      const gy = raycastGroundY(_TMP_GROUND);
      if (Number.isFinite(gy)) {
        return gy;
      }
    }
  } catch {}
  return fallbackY;
}

function _applyLandmarkLayout(scene, options, keys, { label = 'Landmarks' } = {}) {
  if (!scene || !Array.isArray(keys) || keys.length === 0) {
    return {};
  }

  const resolver = createLandmarkLayoutResolver({
    layout: options?.layout,
    layoutConfig: options?.layoutConfig,
    plateauHeight: options?.layoutConfig?.plateauHeight,
    sampleGround: _sampleSceneGround
  });

  const results = {};
  for (const key of keys) {
    const target = _findLandmarkObject(scene, key);
    if (!target) {
      results[key] = 'not-found';
      continue;
    }
    const fallback = target.getWorldPosition(_TMP_WORLD.set(0, 0, 0));
    const { position } = resolver(key, fallback);
    const ok = _setWorldPosition(target, position.x, position.y, position.z);
    results[key] = ok ? 'moved' : 'failed';
  }

  try { logger.info(`[${label}]`, results); } catch {}
  return results;
}

function _applyLandmarkSpread(scene, options, { force = false } = {}) {
  const shouldRun = force || options?.layout === 'athensPlan';
  if (!shouldRun) return;

  const keys = new Set();
  getLandmarkKeysForLayout(options?.layout).forEach((key) => keys.add(key));
  const overrides = options?.layoutConfig?.positions;
  if (overrides && typeof overrides === 'object') {
    Object.keys(overrides).forEach((key) => keys.add(key));
  }
  KNOWN_LANDMARK_KEYS.forEach((key) => keys.add(key));

  _applyLandmarkLayout(scene, options, [...keys], { label: 'LandmarkSpread' });
}

function _installLandmarkDev(scene, options) {
  if (typeof window === 'undefined') return;
  window.dev = window.dev || {};
  window.dev.landmarks = window.dev.landmarks || {};
  window.dev.landmarks.spread = (customPositions) => {
    const opts = customPositions ? { layoutConfig: { positions: customPositions } } : options;
    _applyLandmarkSpread(scene, opts, { force: true });
  };
  // convenience: show names containing a token
  window.dev.landmarks.find = (token='agora') => {
    token = String(token).toLowerCase();
    const hits = [];
    scene.traverse(o => { if (o?.name && o.name.toLowerCase().includes(token)) hits.push(o.name); });
    logger.info('[find]', token, hits);
    return hits;
  };
}
// LANDMARK_SPREAD_END

const DEFAULT_STATS_STYLE = 'position:fixed;left:0;top:0;z-index:9999';

const DEFAULT_BACKGROUND_HEX = 0x202834;

let stats = null;
let statsVisible = true;

const updateStatsVisibility = () => {
  const panel = stats?.dom;
  if (panel) {
    panel.style.display = statsVisible ? '' : 'none';
  }
};

const registerGlobalStatsHelpers = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.getStats !== 'function') {
    window.getStats = () => stats;
  }

  window.toggleStatsVisibility = (forceVisible) => {
    if (typeof forceVisible === 'boolean') {
      statsVisible = forceVisible;
    } else {
      statsVisible = !statsVisible;
    }
    updateStatsVisibility();
    return statsVisible;
  };
};

const toggleStatsPanel = () => {
  if (typeof window !== 'undefined' && typeof window.toggleStatsVisibility === 'function') {
    return window.toggleStatsVisibility();
  }
  statsVisible = !statsVisible;
  updateStatsVisibility();
  return statsVisible;
};

const statsReady = (async () => {
  stats = await createStats();
  if (stats.dom && typeof document !== 'undefined' && document.body) {
    stats.dom.style.cssText = DEFAULT_STATS_STYLE;
    document.body.appendChild(stats.dom);
  }
  registerGlobalStatsHelpers();
  updateStatsVisibility();
  return stats;
})();

const ENVIRONMENT_LABELS = {
  high_noon: 'High Noon',
  day: 'High Noon',
  golden_hour: 'Golden Hour',
  dawn: 'Golden Dawn',
  dusk: 'Dusk',
  midnight: 'Midnight',
  night: 'Midnight'
};

const formatEnvironmentLabel = (mode) => {
  if (!mode) return '';
  const normalized = String(mode).toLowerCase();
  return ENVIRONMENT_LABELS[normalized] || normalized.replace(/_/g, ' ');
};

const DEFAULT_CONTAINER_ID = 'app';
const DEFAULT_OVERLAY_ID = 'landmark-overlay';
const DEFAULT_GEOJSON_URL = 'data/athens_places.geojson';

const DEFAULT_PLAYER_START = new THREE.Vector3(6, 0, -12);
const PLAYER_SEARCH_STEP = 4;
const PLAYER_SEARCH_RINGS = 10;
const PLAYER_COLLIDER_MARGIN = 1.5;

function deriveScaleFactor(scaleConfig) {
  if (typeof scaleConfig === 'number' && Number.isFinite(scaleConfig) && scaleConfig > 0) {
    return scaleConfig;
  }
  if (scaleConfig && typeof scaleConfig === 'object') {
    const { y, x, z } = scaleConfig;
    if (Number.isFinite(y) && y > 0) {
      return y;
    }
    const candidates = [x, z].filter((value) => Number.isFinite(value) && value > 0);
    if (candidates.length) {
      return candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    }
  }
  return 1;
}

const characterConfig = movementConfig?.character ?? {};
const DEFAULT_CHARACTER_HEIGHT = 1.7;
const CHARACTER_SCALE = deriveScaleFactor(characterConfig?.scale);
const CHARACTER_HEIGHT = Number.isFinite(characterConfig?.height)
  ? Math.max(0.5, characterConfig.height)
  : Math.max(0.5, DEFAULT_CHARACTER_HEIGHT * CHARACTER_SCALE);
const CHARACTER_HOVER = Math.min(0.1, Math.max(0.03, CHARACTER_HEIGHT * 0.03));
const SAFE_PLAYER_FALLBACK = {
  x: Number.isFinite(movementConfig?.safePosition?.x) ? movementConfig.safePosition.x : DEFAULT_PLAYER.x,
  y: Number.isFinite(movementConfig?.safePosition?.y)
    ? movementConfig.safePosition.y
    : Math.max(DEFAULT_PLAYER.y, CHARACTER_HEIGHT * 0.55),
  z: Number.isFinite(movementConfig?.safePosition?.z) ? movementConfig.safePosition.z : DEFAULT_PLAYER.z
};
const SAFE_PLAYER_VECTOR = new THREE.Vector3(
  SAFE_PLAYER_FALLBACK.x,
  SAFE_PLAYER_FALLBACK.y,
  SAFE_PLAYER_FALLBACK.z
);

const _spawnCandidate = new THREE.Vector3();

function toVector3(input, fallback = DEFAULT_PLAYER_START) {
  const base = fallback?.isVector3 ? fallback : DEFAULT_PLAYER_START;
  const result = base.clone();
  if (!input) {
    return sanitizeVec3(result, DEFAULT_PLAYER_START);
  }
  if (input.isVector3) {
    result.copy(input);
    return sanitizeVec3(result, DEFAULT_PLAYER_START);
  }
  const { x, y, z } = input;
  result.set(
    finiteNumber(Number(x), result.x),
    finiteNumber(Number(y), result.y),
    finiteNumber(Number(z), result.z)
  );
  return sanitizeVec3(result, DEFAULT_PLAYER_START);
}

function pointIntersectsColliders(x, y, z, colliders, margin = PLAYER_COLLIDER_MARGIN) {
  if (!Array.isArray(colliders) || colliders.length === 0) return false;
  for (let i = 0; i < colliders.length; i += 1) {
    const entry = colliders[i];
    const box = entry?.box;
    if (!box) continue;
    const minX = box.min.x - margin;
    const maxX = box.max.x + margin;
    if (x < minX || x > maxX) continue;
    const minZ = box.min.z - margin;
    const maxZ = box.max.z + margin;
    if (z < minZ || z > maxZ) continue;
    const minY = box.min.y - 2;
    const maxY = box.max.y + 3;
    if (y >= minY && y <= maxY) {
      return true;
    }
  }
  return false;
}

function findSafePlayerSpawn({
  hint,
  groundMeshes,
  colliders,
  hover = CHARACTER_HOVER,
  fromY = 400
} = {}) {
  const base = toVector3(hint, DEFAULT_PLAYER_START);
  if (!groundMeshes?.length) {
    return base.clone();
  }

  const attemptPosition = (x, z) => {
    const groundY = sampleGroundY(x, z, groundMeshes, { fromY });
    if (groundY == null) {
      return null;
    }
    const finalY = groundY + hover;
    if (pointIntersectsColliders(x, finalY, z, colliders)) {
      return null;
    }
    return new THREE.Vector3(x, finalY, z);
  };

  const baseAttempt = attemptPosition(base.x, base.z);
  if (baseAttempt) {
    return baseAttempt;
  }

  for (let ring = 1; ring <= PLAYER_SEARCH_RINGS; ring += 1) {
    const radius = PLAYER_SEARCH_STEP * ring;
    const steps = Math.max(6, ring * 8);
    for (let step = 0; step < steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      const attempt = attemptPosition(x, z);
      if (attempt) {
        return attempt;
      }
    }
  }

  const fallbackY = sampleGroundY(base.x, base.z, groundMeshes, { fromY });
  const resolvedY = fallbackY == null ? base.y : fallbackY + hover;
  _spawnCandidate.set(base.x, resolvedY, base.z);
  return _spawnCandidate.clone();
}

function ensureContainerElement(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('initializeAthens requires a browser document.');
  }
  if (options.container instanceof HTMLElement) return options.container;
  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const element = document.getElementById(containerId);
  if (!element) throw new Error(`Athens container #${containerId} not found.`);
  return element;
}

function computeContainerSize(element) {
  const rect = element.getBoundingClientRect?.();
  const width = rect && rect.width ? rect.width : element.clientWidth || window.innerWidth || 1;
  const height = rect && rect.height ? rect.height : element.clientHeight || window.innerHeight || 1;
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}

function ensureOverlayCanvas(container, overlayCanvasId) {
  const existing = typeof document !== 'undefined' ? document.getElementById(overlayCanvasId) : null;
  if (existing instanceof HTMLCanvasElement) return existing;

  const canvas = document.createElement('canvas');
  canvas.id = overlayCanvasId;
  canvas.style.position = 'absolute';
  canvas.style.top = '16px';
  canvas.style.right = '16px';
  canvas.style.width = 'min(420px, 32vw)';
  canvas.style.height = 'min(420px, 32vh)';
  canvas.style.maxWidth = '95vw';
  canvas.style.maxHeight = '60vh';
  canvas.style.border = '1px solid rgba(30, 41, 59, 0.35)';
  canvas.style.background = 'rgba(15, 23, 42, 0.25)';
  canvas.style.backdropFilter = 'blur(4px)';
  canvas.style.borderRadius = '12px';
  canvas.style.zIndex = '4';
  canvas.style.touchAction = 'none';
  canvas.style.pointerEvents = 'auto';
  container.appendChild(canvas);
  return canvas;
}

function ensureLights(scene) {
  if (!scene) return;
  if (!scene.children.some((child) => child.isAmbientLight)) {
    scene.add(new THREE.AmbientLight(0xfef7e5, 0.55));
  }
  if (!scene.children.some((child) => child.isDirectionalLight)) {
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(160, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -240;
    sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 240;
    sun.shadow.camera.bottom = -240;
    scene.add(sun);
  }
}

// Sun presets per mode (position, intensity, color). Tweak freely later.
const SUN_PRESETS = {
  dawn:        { pos: [-80, 120,  80], intensity: 0.9,  color: 0xfff2cf },
  day:         { pos: [160, 260, 120], intensity: 1.05, color: 0xffffff },
  high_noon:   { pos: [160, 260, 120], intensity: 1.05, color: 0xffffff },
  golden_hour: { pos: [-120,140,  40], intensity: 0.95, color: 0xffd6a3 },
  dusk:        { pos: [120, 110, -60], intensity: 0.8,  color: 0xffc7a1 },
  night:       { pos: [ 20,  40, -20], intensity: 0.2,  color: 0xbfd4ff },
  midnight:    { pos: [  0,  30,   0], intensity: 0.12, color: 0xcfe3ff },
};

function _findSun(scene) {
  let sun = null;
  scene.traverse((o) => {
    if (!sun && o && (o.isDirectionalLight || o.type === 'DirectionalLight')) {
      sun = o;
    }
  });
  return sun;
}

/** Set first DirectionalLight to a preset that matches the mode (no-op if none). */
function applySunForMode(scene, mode) {
  const sun = _findSun(scene);
  if (!sun) return;
  const key = String(mode || 'day').toLowerCase();
  const preset = SUN_PRESETS[key] || SUN_PRESETS.day;
  const [x, y, z] = preset.pos;
  sun.position.set(x, y, z);
  if (typeof sun.intensity === 'number') sun.intensity = preset.intensity;
  try { sun.color?.setHex?.(preset.color); } catch {}
  sun.updateMatrixWorld?.(true);
}

function createPlaceholderPlayer() {
  const group = new THREE.Group();
  group.name = 'Player';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65, metalness: 0.15 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.1 });

  if (typeof THREE.CapsuleGeometry === 'function') {
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.6, 12, 24), bodyMaterial);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    group.add(capsule);
  } else {
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 16), bodyMaterial);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    group.add(cylinder);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), accentMaterial);
  head.position.y = 1.1;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  const placeholderScale = Math.max(0.1, CHARACTER_HEIGHT / DEFAULT_CHARACTER_HEIGHT);
  group.scale.setScalar(placeholderScale);

  sanitizeVec3(group.position, SAFE_PLAYER_FALLBACK);

  return group;
}

export async function initializeAthens(options = {}) {
  const setPhase = getPhaseSetter();
  const container = ensureContainerElement(options);
  container.style.position = container.style.position || 'relative';

  const { width: initialWidth, height: initialHeight } = computeContainerSize(container);

  // CITYPLAN_START
  const layout = options?.layout === 'athensPlan' ? 'athensPlan' : 'classic';
  const layoutConfig = options?.layoutConfig ?? {};
  // CITYPLAN_END

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(DEFAULT_BACKGROUND_HEX, 1);
  // Ensure opaque clear so the canvas never shows the page background
  renderer.setClearAlpha(1.0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.zIndex = '0';

  if (!container.contains(renderer.domElement)) {
    container.appendChild(renderer.domElement);
  }

  try {
    setPhase('renderer-ready');
  } catch {}

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DEFAULT_BACKGROUND_HEX);
  const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 2000);
  camera.position.set(90, 110, 180);
  sanitizeVec3(camera.position, DEFAULT_CAMERA);
  const el = renderer.domElement;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  camera.aspect = (w > 0 && h > 0) ? (w / h) : (16 / 9);
  camera.updateProjectionMatrix();

  const initialLookTarget = new THREE.Vector3(0, 0, 0);
  sanitizeVec3(initialLookTarget, DEFAULT_PLAYER);
  camera.lookAt(initialLookTarget);
  scene.add(camera);

  const sanityGeometry = createSanityGeometryController(scene);

// Ensure we can actually see distant background
  if (camera.far < 50000) { camera.far = 50000; camera.updateProjectionMatrix(); }

  renderer.setClearAlpha(1);

  const environmentModule = await withBootTimeout(
    import('../environment/envCore.ts'),
    1500,
    'environment-module',
    async () => ({
      createEnvironment: () => {
        const stub = {
          async applySkyMode() {},
          async applySkyImage() {},
          setMode() {},
          dispose() {}
        };
        return stub;
      }
    })
  );
  const { createEnvironment } = environmentModule;

  const environmentManager = createEnvironment({ scene, renderer });

  const sanitizeSkyToken = (value) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : '';

  const SKY_MODE_ALIASES = new Map([
    ['dawn', 'dawn'],
    ['sunrise', 'dawn'],
    ['day', 'day'],
    ['high-noon', 'day'],
    ['high_noon', 'day'],
    ['highnoon', 'day'],
    ['noon', 'day'],
    ['midday', 'day'],
    ['dusk', 'dusk'],
    ['sunset', 'dusk'],
    ['evening', 'dusk'],
    ['golden-hour', 'dusk'],
    ['goldenhour', 'dusk'],
    ['blue-hour', 'dusk'],
    ['night', 'night'],
    ['midnight', 'night'],
    ['night-sky', 'night'],
    ['starlit-night', 'night'],
    ['night-4k', 'night'],
    ['night4k', 'night'],
    ['procedural', 'day'],
    ['image', 'day']
  ]);

  const resolveSkyMode = (mode) => SKY_MODE_ALIASES.get(sanitizeSkyToken(mode)) || 'day';

  let lastAppliedSkyMode = 'day';
  let environmentMode = 'day';
  let skySuppressed = false;

  // Register discovered assets (safe no-ops if arrays are empty)
  try {
    if (Array.isArray(GROUND_JPGS) && GROUND_JPGS.length > 0) {
      // Use the first ground jpg as default override (non-breaking: only affects grass when feature is used)
      setExternalGroundTexture(GROUND_JPGS[0].url);
    }
  } catch {}

  const trackedDisposables = new Set();
  const registerDisposables = (...items) => {
    for (const item of items) {
      if (!item) continue;
      if (typeof item.dispose === 'function') {
        trackedDisposables.add(item);
        continue;
      }
      if (
        item instanceof THREE.Object3D ||
        item instanceof THREE.Material ||
        item instanceof THREE.Texture ||
        item instanceof THREE.BufferGeometry
      ) {
        trackedDisposables.add(item);
      }
    }
  };
  const disposeTracked = () => {
    if (!trackedDisposables.size) return;
    disposeAll(...trackedDisposables);
  };
  let beforeUnloadCleanup = null;

  registerDisposables(renderer, environmentManager, sanityGeometry);

  if (typeof window !== 'undefined') {
    window.scene = window.scene || scene;
    window.renderer = window.renderer || renderer;
    window.camera = window.camera || camera;
    installSkyDev({ scene, renderer, camera });

    window.dev = window.dev || {};
    window.dev.sky = window.dev.sky || {};
    window.dev.sky.on = (mode = 'day') => {
      const skyMode = resolveSkyMode(mode);
      lastAppliedSkyMode = skyMode;
      environmentManager.setMode('procedural');
      return environmentManager.applySkyMode(skyMode);
    };
    window.dev.sky.off = () => { scene.background = null; scene.environment = null; };
    window.dev.sky.color = (hex = 0x87ceeb) => {
      renderer.setClearAlpha(1);
      renderer.setClearColor(hex, 1);
    };
  }

  let globalWindow = null;
  let searchParams = null;
  let collisionWorld = { colliderMesh: null, bvh: null };
  if (typeof window !== 'undefined') {
    globalWindow = window;
    searchParams = new URLSearchParams(globalWindow.location.search);
  }

  try {
    const ambientTask = initAmbient(camera);
    if (ambientTask && typeof ambientTask.catch === 'function') {
      ambientTask.catch((error) => {
        logger.warn('[Athens] Ambient initialization failed.', error);
      });
    }
  } catch (error) {
    logger.warn('[Athens] Ambient initialization threw synchronously.', error);
  }

  try {
    // Register all discovered mp3 tracks before the environment mode picks a track.
    if (Array.isArray(CUSTOM_AMBIENT_TRACKS)) {
      registerExternalAmbientTracks(CUSTOM_AMBIENT_TRACKS);
    }
  } catch {}

  if (globalWindow) {
    const existingDebug =
      globalWindow.__athensDebug && typeof globalWindow.__athensDebug === 'object'
        ? globalWindow.__athensDebug
        : {};

    const headlessSmoke = searchParams?.get('headlessSmoke') === '1';
    globalWindow.THREE = THREE;

    if (headlessSmoke) {
      globalWindow.__athensDebug = { ...existingDebug, scene, camera, renderer, controller: null };
    } else {
      globalWindow.__athensDebug = {
        ...existingDebug,
        scene,
        camera,
        renderer,
        controller: null,
        audioAPI: AmbientAPI,
        customAmbientTracks: Array.isArray(CUSTOM_AMBIENT_TRACKS)
          ? CUSTOM_AMBIENT_TRACKS.map((track) => track.id)
          : []
      };
    }

    if (typeof globalWindow.__athensDebug === 'object' && globalWindow.__athensDebug) {
      globalWindow.__athensDebug.collision = collisionWorld;
      globalWindow.__athensDebug.skyJpgs = (SKY_JPGS || []).map((x) => ({
        id: x.id,
        url: x.url,
        tags: x.tags
      }));
      globalWindow.__athensDebug.setSkyImage = async (idOrUrl) => {
        const item = (SKY_JPGS || []).find((x) => x.id === idOrUrl || x.url === idOrUrl);
        if (item) {
          await environmentManager.applySkyImage(item.url);
          environmentManager.setMode('image');
        }
      };
    }
  }

  const withTimeout = async (p, ms, fb) => {
    let t;
    const to = new Promise((_, r) => {
      t = setTimeout(() => r(new Error('timeout')), ms);
    });
    try {
      return await Promise.race([p, to]);
    } catch {
      return typeof fb === 'function' ? fb() : fb;
    } finally {
      if (t) {
        clearTimeout(t);
      }
    }
  };

  const applyInitialEnvironment = async () => {
    await withTimeout(environmentManager.applySkyMode('day'), 2000, () => {
      try {
        logger.warn('[Athens] applySkyMode("day") timed out; using clear color fallback.');
      } catch {}
      renderer.setClearColor(DEFAULT_BACKGROUND_HEX, 1);
    });

    lastAppliedSkyMode = 'day';
    environmentManager.setMode('procedural');
    try {
      const currentMode = environmentMode || lastAppliedSkyMode || 'day';
      const match = (SKY_JPGS || []).find((i) =>
        (i.tags || []).some((t) => t.toLowerCase() === String(currentMode).toLowerCase())
      );
      if (match) {
        await environmentManager.applySkyImage(match.url);
        environmentManager.setMode('image');
      }
    } catch {}
  };

  try {
    setPhase('env-start');
  } catch {}

  await withBootTimeout(
    applyInitialEnvironment(),
    2000,
    'environment',
    async () => {
      try {
        environmentManager?.setMode?.('day');
      } catch {}
      renderer.setClearColor(DEFAULT_BACKGROUND_HEX, 1);
      try {
        scene.background = new THREE.Color(DEFAULT_BACKGROUND_HEX);
      } catch {}
    }
  );

  try {
    setPhase('env-ready');
  } catch {}

  let ambientMuted = searchParams ? searchParams.get('mute') === '1' : false;
  const ambientOverrideSelected = searchParams ? searchParams.has('amb') : false;
  const ambientTrackIds = new Set(AMBIENT_TRACKS.map((track) => track.id));
  const defaultAmbientTrack = AMBIENT_TRACKS.length > 0 ? AMBIENT_TRACKS[0].id : null;
  const MODE_TO_AMBIENT = {
    dawn: ['dawn', 'forest', 'coast', 'night_crickets'],
    day: ['day', 'forest', 'coast', 'market'],
    high_noon: ['day', 'forest', 'coast', 'market'],
    dusk: ['dusk', 'forest', 'coast', 'night_crickets'],
    golden_hour: ['dusk', 'forest', 'coast', 'market'],
    night: ['night', 'night_crickets', 'coast', 'forest'],
    midnight: ['night', 'night_crickets', 'coast', 'forest']
  };

  const selectAmbientTrack = (mode) => {
    const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
    const candidates = MODE_TO_AMBIENT[normalized] || [];
    for (const candidate of candidates) {
      if (ambientTrackIds.has(candidate)) {
        return candidate;
      }
    }
    for (const trackId of ambientTrackIds) {
      return trackId;
    }
    return defaultAmbientTrack;
  };

  const applyAmbientForMode = (mode, allowPlayback = true) => {
    if (ambientMuted || ambientTrackIds.size === 0) {
      return null;
    }
    const trackId = selectAmbientTrack(mode);
    if (trackId && allowPlayback) {
      AmbientAPI.play(trackId).catch(() => {});
    }
    return trackId;
  };

  const setAmbientMuted = (muted) => {
    const next = Boolean(muted);
    if (ambientMuted === next) {
      return ambientMuted;
    }
    ambientMuted = next;
    if (ambientMuted) {
      try {
        AmbientAPI.stop?.();
      } catch (error) {
        logger.warn('[Athens] Failed to stop ambient audio.', error);
      }
    } else {
      applyAmbientForMode(environmentMode, true);
    }
    return ambientMuted;
  };

  const toggleAmbientMuted = () => {
    setAmbientMuted(!ambientMuted);
    return ambientMuted;
  };

  ensureLights(scene);

  statsReady
    .then((created) => {
      if (!created?.dom) {
        return;
      }
      created.dom.style.position = 'absolute';
      created.dom.style.left = '16px';
      created.dom.style.top = '16px';
      created.dom.style.zIndex = '5';
      created.dom.style.pointerEvents = 'none';
      if (!container.contains(created.dom)) {
        container.appendChild(created.dom);
      }
      updateStatsVisibility();
    })
    .catch(() => {
      // Ignore stats setup errors.
    });

  const setEnvironmentMode = (mode, { allowAmbient = true } = {}) => {
    const normalized = typeof mode === 'string' && mode ? mode : 'day';
    environmentMode = normalized;
    if (allowAmbient) {
      applyAmbientForMode(normalized, true);
    }
    return environmentMode;
  };

  const environmentController = {
    get mode() {
      return environmentMode;
    },
    async setMode(mode, envOptions = {}) {
      const allowAmbient = envOptions?.playAmbient !== false;
      const next = setEnvironmentMode(mode, { allowAmbient });
      const skyMode = resolveSkyMode(next);
      try {
        await environmentManager.applySkyMode(skyMode);
        lastAppliedSkyMode = skyMode;
        environmentManager.setMode('procedural');
      } catch {
        // keep running if sky load fails
      }

      // OPTIONAL SUN TWEAK (only if you add Part C below)
      try {
        if (typeof applySunForMode === 'function') {
          applySunForMode(scene, next);
        }
      } catch {}

      return next;
    },
    applySky(mode) {
      const skyMode = resolveSkyMode(mode);
      lastAppliedSkyMode = skyMode;
      environmentManager.setMode('procedural');
      return environmentManager.applySkyMode(skyMode);
    },
    dispose() {
      environmentManager.dispose();
    }
  };

  const setSkySuppressedState = (hidden) => {
    const next = Boolean(hidden);
    if (skySuppressed === next) {
      return skySuppressed;
    }
    skySuppressed = next;
    if (skySuppressed) {
      scene.background = null;
      scene.environment = null;
    } else {
      const target = lastAppliedSkyMode || resolveSkyMode(environmentMode);
      environmentManager.setMode('procedural');
      environmentManager.applySkyMode(target).catch(() => {});
    }
    return skySuppressed;
  };

  const toggleSkySuppressed = () => {
    setSkySuppressedState(!skySuppressed);
    return skySuppressed;
  };
  registerDisposables(environmentController);

  if (!ambientOverrideSelected) {
    setEnvironmentMode(environmentController.mode, { allowAmbient: true });
  }


  // CITYPLAN_START
  const ground = await setupGround(scene, renderer, { layout, layoutConfig });
  registerDisposables(ground);
  const layeredGroundRoot = ground?.root ?? null;
  const hasLayeredGround = Boolean(layeredGroundRoot?.userData?.layeredGround);
  // CITYPLAN_END

  // CITYPLAN_START
  const cityVariant = options?.city?.variant ?? options?.cityVariant;

  const city = await createCity({
    renderer,
    scene,
    layout,
    layoutConfig,
    variant: cityVariant,
    ground: hasLayeredGround ? { existing: ground } : undefined,
  });

  const cityRoot = city?.root ?? null;
  registerDisposables(cityRoot);
  const cityMaterials = city?.materials ?? null;
  // CITYPLAN_END


  // LANDMARK_SPREAD_START
  _applyLandmarkSpread(scene, options);
  _installLandmarkDev(scene, options);
  // LANDMARK_SPREAD_END

  // Grass material application for main ground
  if (!hasLayeredGround) {
    const mainGround = city?.root?.getObjectByName?.('Ground:MainGrass');
    if (mainGround?.isMesh) {
      try {
        const grassMaterial = await loadGrassMaterial(renderer, { repeat: 80 });
        if (grassMaterial) {
          const previous = mainGround.material;
          mainGround.material = grassMaterial;
          if (previous && previous !== grassMaterial && typeof previous.dispose === 'function') {
            previous.dispose();
          }
        }
      } catch (error) {
        logger.warn('[Athens] Unable to apply grass material to main ground plane.', error);
      }
    }
  }

  // LANDMARK_OVERRIDE_START
  // Apply runtime landmark overrides (world-space), if provided
  _applyLandmarkOverrides(scene, options);

  // Dev convenience: allow re-applying from console
  if (typeof window !== 'undefined') {
    window.dev = window.dev || {};
    window.dev.landmarks = window.dev.landmarks || {};
    window.dev.landmarks.applyPositions = (positions) => {
      const opts = { layoutConfig: { positions } };
      _applyLandmarkOverrides(scene, opts);
    };
    logger.info('[LandmarkOverride] dev.landmarks.applyPositions({ Agora:{x,y,z} }) is available');
  }
  // LANDMARK_OVERRIDE_END

  // Ground registry + snapping
  markGround(scene);
  const groundMeshes = collectGround(scene);
  if (!groundMeshes.length) {
    logger.warn('[npc] no ground meshes');
  }
  // PLACER_START
  const landmarkSequence = [...KNOWN_LANDMARK_KEYS];
  const devLandmarkOptions = options?.dev?.landmarkPlacer;
  const shouldAttachLandmarkPlacer = devLandmarkOptions !== false;
  let landmarkPlacer = null;
  if (typeof window !== 'undefined' && shouldAttachLandmarkPlacer) {
    const activeList = Array.isArray(devLandmarkOptions?.landmarks) && devLandmarkOptions.landmarks.length
      ? [...devLandmarkOptions.landmarks]
      : landmarkSequence;
    const groundSampler = (x, z) => sampleGroundY(x, z, groundMeshes, { fromY: 400 });
    const ensureDevNamespace = () => {
      window.dev = window.dev || {};
      window.dev.landmarks = window.dev.landmarks || {};
      return window.dev.landmarks;
    };
    const handleSave = (positions = {}) => {
      const devApi = ensureDevNamespace();
      const payload = {
        layout: 'athensPlan',
        layoutConfig: { positions: {} }
      };
      const parseNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const names = typeof landmarkPlacer?.list === 'function' ? landmarkPlacer.list() : activeList;
      names.forEach((name) => {
        const entry = positions?.[name];
        if (entry && typeof entry === 'object') {
          const x = parseNumber(entry.x);
          const y = parseNumber(entry.y);
          const z = parseNumber(entry.z);
          if (x != null && y != null && z != null) {
            payload.layoutConfig.positions[name] = { x, y, z };
          }
        }
      });
      const exportString = JSON.stringify(payload, null, 2);
      devApi.lastExport = exportString;
      devApi.lastPayload = payload;
      // eslint-disable-next-line no-console
      logger.info('[Athens][Landmarks] Exported landmark positions:', exportString);
      if (typeof devApi.onSave === 'function') {
        try {
          devApi.onSave(payload);
        } catch (error) {
          logger.warn('[Athens][Landmarks] onSave handler error.', error);
        }
      }
    };

    landmarkPlacer = createLandmarkPlacer({
      scene,
      camera,
      renderer,
      groundSampler,
      onSave: handleSave
    });
    registerDisposables(landmarkPlacer);
    if (typeof landmarkPlacer?.setList === 'function') {
      landmarkPlacer.setList(activeList);
    }
    scene.userData.landmarkPlacer = landmarkPlacer;

    const devApi = ensureDevNamespace();
    devApi.enable = () => {
      landmarkPlacer.enable?.();
      return landmarkPlacer.isEnabled?.() ?? false;
    };
    devApi.disable = () => {
      landmarkPlacer.disable?.();
      return landmarkPlacer.isEnabled?.() ?? false;
    };
    devApi.toggle = () => {
      if (landmarkPlacer.isEnabled?.()) {
        landmarkPlacer.disable?.();
      } else {
        landmarkPlacer.enable?.();
      }
      return landmarkPlacer.isEnabled?.() ?? false;
    };
    devApi.next = () => landmarkPlacer.next?.();
    devApi.prev = () => landmarkPlacer.prev?.();
    devApi.save = () => {
      landmarkPlacer.save?.();
      return devApi.lastExport ?? null;
    };
    devApi.set = (name, position) => landmarkPlacer.set?.(name, position);
    devApi.setList = (list) => landmarkPlacer.setList?.(list);
    devApi.list = () => (typeof landmarkPlacer.list === 'function' ? landmarkPlacer.list() : [...activeList]);
    devApi.export = () => {
      const positions = landmarkPlacer.export?.() || {};
      const payload = {
        layout: 'athensPlan',
        layoutConfig: { positions: {} }
      };
      devApi.list().forEach((name) => {
        const entry = positions?.[name];
        if (entry && typeof entry === 'object') {
          payload.layoutConfig.positions[name] = { ...entry };
        }
      });
      return payload;
    };
    devApi.positions = () => landmarkPlacer.export?.() || {};
    devApi.getState = () => landmarkPlacer.getState?.();
    devApi.refreshGround = () => landmarkPlacer.refreshGround?.();
    devApi.lastExport = devApi.lastExport ?? null;
    devApi.lastPayload = devApi.lastPayload ?? null;
    if (typeof devApi.saveToFile !== 'function') {
      devApi.saveToFile = () => {
        logger.info('[Athens][Landmarks] saveToFile hook not implemented.');
      };
    }

    const toggleKey = typeof devLandmarkOptions?.toggleKey === 'string'
      ? devLandmarkOptions.toggleKey.toLowerCase()
      : 'l';
    const shouldIgnoreEvent = (event) => {
      const target = event?.target;
      if (!target || typeof target !== 'object') {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }
      const element = typeof HTMLElement !== 'undefined' && target instanceof HTMLElement ? target : null;
      if (!element) {
        return false;
      }
      const tag = element.tagName;
      if (!tag) return false;
      const normalized = tag.toLowerCase();
      if (normalized === 'input' || normalized === 'textarea' || normalized === 'select') {
        return true;
      }
      return Boolean(element.closest?.('input, textarea, select, [contenteditable="true"]'));
    };
    const toggleHandler = (event) => {
      if (!landmarkPlacer) return;
      if (typeof event?.key !== 'string') return;
      if (shouldIgnoreEvent(event)) return;
      const keyLower = event.key.toLowerCase();
      if (keyLower !== toggleKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      devApi.toggle();
    };
    if (window.__athensLandmarkToggleHandler) {
      window.removeEventListener('keydown', window.__athensLandmarkToggleHandler, true);
      window.removeEventListener('keydown', window.__athensLandmarkToggleHandler);
    }
    window.__athensLandmarkToggleHandler = toggleHandler;
    window.addEventListener('keydown', toggleHandler, { capture: true });
  }
  if (!scene.userData.landmarkPlacer) {
    scene.userData.landmarkPlacer = landmarkPlacer;
  }
  // PLACER_END
  if (cityRoot && groundMeshes.length) {
    const snapOpts = { hover: 0.03, fromY: 300 };
    snapChildrenToGround(cityRoot, groundMeshes, snapOpts);
    snapGroupToGround(cityRoot, groundMeshes, snapOpts);
  }

  markColliders(scene);
  const colliderMeshes = collectColliders(scene);
  const colliders = buildAABBs(colliderMeshes);

  if (WALKING_ENABLED) {
    const collisionWorldUrl =
      options?.collisionWorldUrl ??
      options?.collision?.url ??
      options?.worldUrl ??
      null;

    if (collisionWorldUrl) {
      try {
        collisionWorld = await loadWorldWithColliders(collisionWorldUrl, scene);
      } catch (error) {
        logger.warn('[Athens][CollisionWorld] Failed to load collision world.', error);
      }
    }
  }

  const mainCharacterOptions = options.mainCharacter ?? options.mainCharacterConfig ?? null;
  const spawnHint = mainCharacterOptions?.initialPosition ?? DEFAULT_PLAYER_START;
  const playerSpawn = findSafePlayerSpawn({
    hint: spawnHint,
    groundMeshes,
    colliders,
    hover: CHARACTER_HOVER,
    fromY: 400
  });
  sanitizeVec3(playerSpawn, SAFE_PLAYER_FALLBACK);

  // Landmarks & overlay
  const landmarks = await loadLandmarks({
    scene,
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL,
    groundMeshes,
    // CITYPLAN_START
    layout,
    layoutConfig
    // CITYPLAN_END
  });
  registerDisposables(landmarks);

  const overlayCanvasId = options.overlayCanvasId ?? DEFAULT_OVERLAY_ID;
  const overlayCanvas = ensureOverlayCanvas(container, overlayCanvasId);
  const overlay = await createLandmarkOverlay(overlayCanvas, {
    geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL
  });
  landmarks.featureLines?.updateResolution?.();

  const ui = createOriginalUi({ container, overlayCanvas, environmentController });
  ui?.setTimeLabel?.(formatEnvironmentLabel(environmentController?.mode) || 'High Noon');
  const applyHudInstructions = (manifest) => {
    const entries = getHotkeyDisplayEntries('hud', manifest);
    const mapped = entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.description
    }));
    ui?.setHotkeyInstructions?.(mapped);
  };
  applyHudInstructions();
  const hudHotkeys = registerScopedHotkeys('gameplay', {
    onActivate(manifest) {
      applyHudInstructions(manifest);
    },
    onDeactivate() {
      ui?.setHotkeyInstructions?.([]);
    }
  });
  registerDisposables(hudHotkeys);
  registerDisposables(ui);

  // Roads built from collected points (use extended/shared materials if available)
  let roadNetwork = null;
  if (options.enableRoads !== false) {
    // CITYPLAN_START
    const roadPoints = collectRoadPoints(scene, { layout, layoutConfig });
    // CITYPLAN_END
    if (roadPoints.length >= 2) {
      const roadGroup = buildRoadNetwork({
        scene,
        points: roadPoints,
        materials: cityMaterials || city?.materials || {},
        options: { width: 3.0, tileScale: 6.0 }
      });
      roadGroup.name = 'RoadNetwork';
      scene.add(roadGroup);
      roadNetwork = roadGroup;
      registerDisposables(roadNetwork);
    }
  }

  // Navmesh
  let navMesh = null;
  let navPathfinder = null;
  if (groundMeshes.length) {
    const navSources = [...groundMeshes];
    if (roadNetwork?.traverse) {
      roadNetwork.traverse((child) => {
        if (child && (child.isMesh || child instanceof THREE.Mesh)) {
          navSources.push(child);
        }
      });
    }
    try {
      navMesh = buildNavMeshFromMeshes(navSources);
      if (navMesh) {
        navPathfinder = createNavMeshPathfinder(navMesh);
        registerDisposables(navMesh, navPathfinder);
      }
    } catch (error) {
      logger.warn('[Athens][NavMesh] Failed to build navmesh.', error);
      navMesh = null;
      navPathfinder = null;
    }
  }

  // NPCs
  let npcSystem = null;
  if (options.enableNpcs !== false) {
    npcSystem = createNpcSystem({
      groundMeshes,
      timeSource: () => environmentController.mode,
      npcModelUrls: options.npcModelUrls,
      npcConfigs: options.npcConfigs
    });
    npcSystem.initializeNpcs(scene, { navMesh, pathfinder: navPathfinder });
    registerDisposables(npcSystem);
  }

  // Main character
  const mainCharacter = options.enableMainCharacter === false
    ? null
    : createMainCharacter(scene, {
        ...(mainCharacterOptions || {}),
        initialPosition: playerSpawn
      });
  registerDisposables(mainCharacter);

  const findPlayerObject = () => scene.getObjectByName('Player') || scene.getObjectByName('Hero');

  const placeAtSpawn = (object) => {
    if (!object) return;
    object.position.copy(playerSpawn);
    sanitizeVec3(object.position, SAFE_PLAYER_FALLBACK);
    if (groundMeshes?.length) {
      const snapped = snapObjectToGround(object, groundMeshes, { hover: CHARACTER_HOVER, fromY: 400 });
      if (snapped) {
        playerSpawn.y = object.position.y;
      }
    }
    sanitizeVec3(object.position, SAFE_PLAYER_FALLBACK);
  };

  let playerObject = findPlayerObject() || mainCharacter?.object3d || null;
  let placeholderPlayer = null;

  if (!playerObject) {
    placeholderPlayer = createPlaceholderPlayer();
    placeAtSpawn(placeholderPlayer);
    scene.add(placeholderPlayer);
    playerObject = placeholderPlayer;
  } else {
    placeAtSpawn(playerObject);
  }

  if (playerObject?.position) {
    sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
  }

  const controllerHeight = Number.isFinite(movementConfig?.character?.height)
    ? Math.max(1, movementConfig.character.height)
    : 1.7;
  let walkingController = null;
  if (WALKING_ENABLED) {
    const controllerStart = playerSpawn.clone();
    controllerStart.y += controllerHeight * 0.5;
    walkingController = new CharacterController(camera, controllerStart, controllerHeight);
    if (playerObject?.position) {
      playerObject.position.copy(walkingController.position);
    }
  }

// CHAR_MAIN_HEIGHT_START
const enforceMainCharacterHeight = () => __enforceMainCharacterHeight(scene, options);
const readyPromise = mainCharacter?.ready;

if (readyPromise && typeof readyPromise.then === 'function') {
  readyPromise
    .then(() => {
      enforceMainCharacterHeight();
    })
    .catch((error) => {
      logger.warn('[Athens][MainCharacter] Failed to load character before enforcing height.', error);
      enforceMainCharacterHeight();
    });
} else {
  enforceMainCharacterHeight();
}

  // CHAR_MAIN_HEIGHT_END

  const flyBypassFallbackPosition = new THREE.Vector3();
  const flyBypassVelocity = { y: 0 };
  const flyBypassState = {
    position: playerObject?.position || flyBypassFallbackPosition,
    velocity: flyBypassVelocity
  };

  // Controls & camera
  const cameraSettings = movementConfig?.camera ?? {};
  const cameraFollowConfig = cameraSettings?.follow ?? {};
  const cameraSeedConfig = cameraSettings?.seed ?? {};
  const keyboard = createKeyboard();
  registerDisposables(keyboard);

  const actionBindings = bindHotkeyActions({
    [HOTKEY_IDS.debug.toggleStats]: () => toggleStatsPanel(),
    [HOTKEY_IDS.debug.toggleSound]: () => toggleAmbientMuted(),
    [HOTKEY_IDS.debug.toggleSky]: () => toggleSkySuppressed(),
    [HOTKEY_IDS.debug.toggleSanityGeometry]: () => sanityGeometry?.toggle?.()
  });
  registerDisposables(actionBindings);
  const controller = createPlayerController(playerObject, keyboard, {
    walkSpeed: Number.isFinite(movementConfig?.walkSpeed) ? movementConfig.walkSpeed : 4,
    runMultiplier: Number.isFinite(movementConfig?.runMultiplier) ? movementConfig.runMultiplier : 1.7,
    acceleration: Number.isFinite(movementConfig?.acceleration) ? movementConfig.acceleration : 10,
    turnLerp: 0.18,
    colliders
  });
  controller.setGroundMeshes(groundMeshes);
  controller.setColliders?.(colliders);

  if (globalWindow && typeof globalWindow.__athensDebug === 'object' && globalWindow.__athensDebug) {
    globalWindow.__athensDebug.controller = WALKING_ENABLED && walkingController
      ? walkingController
      : controller;
  }

  const followOffset = cameraFollowConfig?.offset ?? { x: 0, y: 2.2, z: -6 };
  const followLookOffset = cameraFollowConfig?.lookAtOffset ?? { x: 0, y: 1.5, z: 0 };
  const followLerp = Number.isFinite(cameraFollowConfig?.lerp) ? cameraFollowConfig.lerp : 0.12;
  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(
      Number.isFinite(followOffset?.x) ? followOffset.x : 0,
      Number.isFinite(followOffset?.y) ? followOffset.y : 2.2,
      Number.isFinite(followOffset?.z) ? followOffset.z : -6
    ),
    lerp: followLerp,
    lookAtOffset: new THREE.Vector3(
      Number.isFinite(followLookOffset?.x) ? followLookOffset.x : 0,
      Number.isFinite(followLookOffset?.y) ? followLookOffset.y : 1.5,
      Number.isFinite(followLookOffset?.z) ? followLookOffset.z : 0
    )
  });
  followCamera.setPointerLockElement?.(renderer.domElement);

  followCamera.syncImmediate?.();
  const initialFollowTarget = followCamera && followCamera.target;
  if (initialFollowTarget) {
    sanitizeVec3(initialFollowTarget, SAFE_PLAYER_FALLBACK);
  }

  // Install per-frame guard so NaNs cannot poison the renderer between frames
  installRenderGuard({
    scene,
    camera,
    renderer,
    controls: followCamera,
    defaults: { player: { ...SAFE_PLAYER_FALLBACK }, camera: { x:20, y:12, z:20 } },
    playerNameCandidates: ['MainCharacter', 'Player']
  });

  try {
    setPhase('scene-ready');
  } catch {}

  const resolveSavedState = () => {
    if (options?.savedState) {
      return options.savedState;
    }
    if (options?.initialState) {
      return options.initialState;
    }
    if (typeof window !== 'undefined') {
      const globalWindow = window;
      if (globalWindow.__ATHENS_SAVED_STATE && typeof globalWindow.__ATHENS_SAVED_STATE === 'object') {
        return globalWindow.__ATHENS_SAVED_STATE;
      }
      try {
        const raw = globalWindow.localStorage?.getItem?.('athens:lastState');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    return null;
  };

  const restoreCameraAndPlayer = (saved) => {
    const playerState = saved?.player || null;
    const cameraState = saved?.camera || null;

    if (playerObject?.position) {
      if (playerState?.pos) {
        safeSetVec3(playerObject.position, playerState.pos, SAFE_PLAYER_FALLBACK);
      } else {
        sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
      }
    }

    if (playerState?.rotEuler && playerObject?.rotation) {
      playerObject.rotation.set(
        finiteNumber(playerState.rotEuler.x, playerObject.rotation.x),
        finiteNumber(playerState.rotEuler.y, playerObject.rotation.y),
        finiteNumber(playerState.rotEuler.z, playerObject.rotation.z)
      );
    }
    if (playerObject?.rotation) {
      sanitizeEuler(playerObject.rotation);
    }

    if (playerState?.rotQuat && playerObject?.quaternion) {
      playerObject.quaternion.set(
        finiteNumber(playerState.rotQuat.x, playerObject.quaternion.x),
        finiteNumber(playerState.rotQuat.y, playerObject.quaternion.y),
        finiteNumber(playerState.rotQuat.z, playerObject.quaternion.z),
        finiteNumber(playerState.rotQuat.w, playerObject.quaternion.w)
      );
    }
    if (playerObject?.quaternion) {
      sanitizeQuaternion(playerObject.quaternion);
    }

    if (cameraState?.pos) {
      safeSetVec3(camera.position, cameraState.pos, DEFAULT_CAMERA);
    } else {
      sanitizeVec3(camera.position, DEFAULT_CAMERA);
    }

    if (cameraState?.rotEuler) {
      camera.rotation.set(
        finiteNumber(cameraState.rotEuler.x, camera.rotation.x),
        finiteNumber(cameraState.rotEuler.y, camera.rotation.y),
        finiteNumber(cameraState.rotEuler.z, camera.rotation.z)
      );
    }
    sanitizeEuler(camera.rotation);

    if (cameraState?.rotQuat) {
      camera.quaternion.set(
        finiteNumber(cameraState.rotQuat.x, camera.quaternion.x),
        finiteNumber(cameraState.rotQuat.y, camera.quaternion.y),
        finiteNumber(cameraState.rotQuat.z, camera.quaternion.z),
        finiteNumber(cameraState.rotQuat.w, camera.quaternion.w)
      );
    }
    sanitizeQuaternion(camera.quaternion);

    if (playerObject) {
      followCamera?.setTarget?.(playerObject);
    }
    const followTarget = followCamera?.target;
    if (followTarget) {
      if (!isFiniteVec3(followTarget)) {
        followTarget.copy(playerObject?.position || SAFE_PLAYER_VECTOR);
      } else {
        sanitizeVec3(followTarget, SAFE_PLAYER_FALLBACK);
      }
    }

    const lookTarget = playerObject?.position
      ? playerObject.position
      : SAFE_PLAYER_VECTOR.clone();
    sanitizeVec3(lookTarget, SAFE_PLAYER_FALLBACK);
    camera.lookAt(lookTarget);
  };

  const savedState = resolveSavedState();
  restoreCameraAndPlayer(savedState);

  if (!savedState?.camera?.pos) {
    seedCameraBehindPlayer(playerObject, camera, {
      followDistance: Number.isFinite(cameraSeedConfig?.followDistance)
        ? cameraSeedConfig.followDistance
        : 6,
      shoulderHeight: Number.isFinite(cameraSeedConfig?.shoulderHeight)
        ? cameraSeedConfig.shoulderHeight
        : 1.6,
      pitchDeg: Number.isFinite(cameraSeedConfig?.pitchDeg) ? cameraSeedConfig.pitchDeg : -15
    });
    followCamera.syncImmediate?.();
  }

  if (mainCharacter?.ready?.then) {
    mainCharacter.ready.then(() => {
      const resolvedPlayer = mainCharacter.object3d || findPlayerObject() || scene.getObjectByName('MainCharacter');
      if (resolvedPlayer) {
        placeAtSpawn(resolvedPlayer);
        sanitizeVec3(resolvedPlayer.position, SAFE_PLAYER_FALLBACK);
        sanitizeEuler(resolvedPlayer.rotation);
        sanitizeQuaternion(resolvedPlayer.quaternion);
        controller.setObject?.(resolvedPlayer);
        followCamera.setTarget?.(resolvedPlayer);
        playerObject = resolvedPlayer;
        flyBypassState.position = playerObject?.position || flyBypassFallbackPosition;
        if (savedState) {
          restoreCameraAndPlayer(savedState);
        } else {
          sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
          seedCameraBehindPlayer(playerObject, camera, {
            followDistance: Number.isFinite(cameraSeedConfig?.followDistance)
              ? cameraSeedConfig.followDistance
              : 6,
            shoulderHeight: Number.isFinite(cameraSeedConfig?.shoulderHeight)
              ? cameraSeedConfig.shoulderHeight
              : 1.6,
            pitchDeg: Number.isFinite(cameraSeedConfig?.pitchDeg) ? cameraSeedConfig.pitchDeg : -15
          });
        }
        followCamera.syncImmediate?.();
        if (placeholderPlayer && placeholderPlayer.parent) {
          placeholderPlayer.parent.remove(placeholderPlayer);
        }
      }
    });
  }

  followCamera.update(keyboard, 0);

  // Resize
  const resizeHandler = () => {
    const { width, height } = computeContainerSize(container);
    const safeWidth = Math.max(1, finiteNumber(width, 1));
    const safeHeight = Math.max(1, finiteNumber(height, 1));
    renderer.setSize(safeWidth, safeHeight, false);
    const aspect = safeHeight > 0 ? safeWidth / safeHeight : camera.aspect;
    if (Number.isFinite(aspect) && aspect > 0) {
      camera.aspect = aspect;
    }
    camera.updateProjectionMatrix();
    overlay.requestRender();
    landmarks.featureLines?.updateResolution?.();
  };
  window.addEventListener('resize', resizeHandler);

  // Main loop
  let disposed = false;
  let statsForFrame = null;

  const updateFrame = (delta, { skippedLargeDt }) => {
    if (disposed) {
      statsForFrame = stats;
      statsForFrame?.begin?.();
      statsForFrame?.end?.();
      statsForFrame = null;
      return;
    }

    statsForFrame = stats;
    statsForFrame?.begin?.();

    try {
      try {
        updateTrees?.(delta);
      } catch (error) {
        logger.warn('[Athens] Tree animation update failed.', error);
      }

      if (playerObject?.position && !isFiniteVec3(playerObject.position)) {
        sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
      }
      if (!isFiniteVec3(camera.position)) {
        sanitizeVec3(camera.position, DEFAULT_CAMERA);
      }
      const followTarget = followCamera?.target;
      if (followTarget) {
        if (!isFiniteVec3(followTarget)) {
          followTarget.copy(playerObject?.position || SAFE_PLAYER_VECTOR);
        } else {
          sanitizeVec3(followTarget, SAFE_PLAYER_FALLBACK);
        }
      }

      keyboard?.update?.();

      flyBypassState.position = playerObject?.position || flyBypassFallbackPosition;
      flyBypass?.tick?.(delta);

      const npcContext = { groundMeshes, skippedLargeDt: Boolean(skippedLargeDt) };
      mainCharacter?.update?.(delta, npcContext);
      npcSystem?.update?.(delta, { skippedLargeDt: Boolean(skippedLargeDt) });
      landmarks.update?.(camera);

      if (!skippedLargeDt) {
        if (WALKING_ENABLED && walkingController) {
          walkingController.update(delta, getInput(), collisionWorld);
          if (playerObject?.position) {
            playerObject.position.copy(walkingController.position);
          }
        } else {
          controller?.update?.(delta, camera);
        }
      }

      ui?.update?.(delta, {
        position: playerObject?.position,
        isFlying: WALKING_ENABLED ? false : controller?.isFlying?.() ?? false,
        isRunning: WALKING_ENABLED && walkingController
          ? walkingController.velocity.length() > walkingController.walkSpeed + 0.1
          : controller?.isRunning?.(),
        skippedLargeDt: Boolean(skippedLargeDt)
      });

      if (!WALKING_ENABLED || !walkingController) {
        followCamera?.update?.(keyboard, delta);
      }

      const activePlayer = findPlayerObject() || playerObject;
      if (activePlayer?.position && !isFiniteVec3(activePlayer.position)) {
        sanitizeVec3(activePlayer.position, SAFE_PLAYER_FALLBACK);
      }
      if (playerObject?.position && !isFiniteVec3(playerObject.position)) {
        sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
      }
      if (!isFiniteVec3(camera.position)) {
        sanitizeVec3(camera.position, DEFAULT_CAMERA);
      }

      const guardTarget = followCamera?.target;
      if (guardTarget) {
        if (!isFiniteVec3(guardTarget)) {
          guardTarget.copy(activePlayer?.position || playerObject?.position || SAFE_PLAYER_VECTOR);
        } else {
          sanitizeVec3(guardTarget, SAFE_PLAYER_FALLBACK);
        }
      }

      if (WALKING_ENABLED && walkingController) {
        camera.getWorldDirection(_WALK_LOOK_DIR);
        if (_WALK_LOOK_DIR.lengthSq() < 1e-6) {
          _WALK_LOOK_DIR.set(0, 0, -1);
        }
        _WALK_LOOK_TARGET.copy(camera.position).addScaledVector(_WALK_LOOK_DIR, 10);
        sanitizeVec3(_WALK_LOOK_TARGET, SAFE_PLAYER_FALLBACK);
        camera.lookAt(_WALK_LOOK_TARGET);
      } else {
        const lookTarget = activePlayer?.position
          ? activePlayer.position
          : playerObject?.position
            ? playerObject.position
            : SAFE_PLAYER_VECTOR.clone();
        sanitizeVec3(lookTarget, SAFE_PLAYER_FALLBACK);
        camera.lookAt(lookTarget);
      }
    } catch (error) {
      logger.warn('[Athens] Frame update failed.', error);
    }
  };

  const renderFrame = () => {
    try {
      if (!disposed) {
        const activePlayer = findPlayerObject() || playerObject;
        if (activePlayer?.position && !isFiniteVec3(activePlayer.position)) {
          sanitizeVec3(activePlayer.position, SAFE_PLAYER_FALLBACK);
        }
        if (playerObject?.position && !isFiniteVec3(playerObject.position)) {
          sanitizeVec3(playerObject.position, SAFE_PLAYER_FALLBACK);
        }
        if (!isFiniteVec3(camera.position)) {
          sanitizeVec3(camera.position, DEFAULT_CAMERA);
        }
        const renderTarget = activePlayer?.position
          ? activePlayer.position
          : playerObject?.position
            ? playerObject.position
            : SAFE_PLAYER_VECTOR.clone();
        sanitizeVec3(renderTarget, SAFE_PLAYER_FALLBACK);
        camera.lookAt(renderTarget);
        renderer.render(scene, camera);
      }
    } finally {
      statsForFrame?.end?.();
      statsForFrame = null;
    }
  };

  const gameLoop = createGameLoop(updateFrame, renderFrame);
  registerDisposables(gameLoop);

  const flyBypassAscendAliases = new Set([
    HOTKEY_IDS.flight.ascend,
    'flyUp',
    'Space',
    'KeyE'
  ]);
  const flyBypassDescendAliases = new Set([
    HOTKEY_IDS.flight.descend,
    'flyDown',
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'KeyQ',
    'KeyC'
  ]);

  const flyBypassInput = {
    held(identifier) {
      if (!keyboard) {
        return false;
      }

      if (flyBypassAscendAliases.has(identifier)) {
        if (typeof keyboard.isActionDown === 'function' && keyboard.isActionDown(HOTKEY_IDS.flight.ascend)) {
          return true;
        }
        return typeof keyboard.isDown === 'function'
          ? keyboard.isDown('Space') || keyboard.isDown('KeyE')
          : false;
      }

      if (flyBypassDescendAliases.has(identifier)) {
        if (typeof keyboard.isActionDown === 'function' && keyboard.isActionDown(HOTKEY_IDS.flight.descend)) {
          return true;
        }
        return typeof keyboard.isDown === 'function'
          ? (
              keyboard.isDown('ShiftLeft') ||
              keyboard.isDown('ShiftRight') ||
              keyboard.isDown('ControlLeft') ||
              keyboard.isDown('ControlRight') ||
              keyboard.isDown('KeyQ') ||
              keyboard.isDown('KeyC')
            )
          : false;
      }

      if (typeof identifier === 'string' && identifier.includes('.') && typeof keyboard.isActionDown === 'function') {
        return keyboard.isActionDown(identifier);
      }

      return typeof keyboard.isDown === 'function' ? keyboard.isDown(identifier) : false;
    }
  };

  const flyBypass = installFlyBypass({ state: flyBypassState, input: flyBypassInput });

  try {
    setPhase('first-frame');
  } catch {}
  gameLoop.start();

  function startTimeOfDayCycle({ minutesPerDay = 10 } = {}) {
    const order = ['dawn', 'day', 'golden_hour', 'dusk', 'night', 'midnight'];
    let i = Math.max(0, order.indexOf(String(environmentController.mode).toLowerCase()));
    const stepMs = Math.max(5000, (minutesPerDay * 60_000) / order.length);

    let timer = null;
    async function tick() {
      i = (i + 1) % order.length;
      await environmentController.setMode(order[i], { playAmbient: true });
    }
    timer = setInterval(tick, stepMs);
    return () => clearInterval(timer);
  }

  // Context / teardown
  const context = {
    renderer,
    scene,
    camera,
    stats,
    overlay,
    overlayCanvas,
    landmarks,
    roadNetwork,
    navMesh,
    navPathfinder,
    npcSystem,
    mainCharacter,
    environmentController,
    city,
    container,
    ui,
    collisionWorld,
    walkingController,
    sanityGeometry,
    toggleSound(muted) {
      if (typeof muted === 'boolean') {
        return setAmbientMuted(muted);
      }
      return toggleAmbientMuted();
    },
    toggleSky(hidden) {
      if (typeof hidden === 'boolean') {
        return setSkySuppressedState(hidden);
      }
      return toggleSkySuppressed();
    },
    toggleStats: () => toggleStatsPanel(),
    async setEnvironmentMode(mode, envOptions = {}) {
      const result = await environmentController?.setMode?.(mode, envOptions);
      const label = formatEnvironmentLabel(result || mode);
      if (label) ui?.setTimeLabel?.(label);
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('resize', resizeHandler);
      beforeUnloadCleanup?.();
      overlay?.destroy?.();
      if (overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
      }
      disposeTracked();
      trackedDisposables.clear();
      if (stats?.dom && stats.dom.parentNode === container) {
        container.removeChild(stats.dom);
      }
      followCamera.setPointerLockElement?.(null);
    }
  };

  if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
    const beforeUnloadHandler = () => {
      disposeTracked();
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadCleanup = () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }

  if (typeof window !== 'undefined') {
    window.__athens = window.__athens || {};
    window.__athens.environment = context.environmentController;
    window.__athens.mainCharacter = context.mainCharacter;
    window.__athens.startTimeOfDayCycle = (opts) => startTimeOfDayCycle(opts);
    window.__athens.setSkyMode = (mode, envOptions) => context.setEnvironmentMode(mode, envOptions);
    window.__athens.city = context.city;
    window.__athens.ui = context.ui;
    window.__athens.controller = WALKING_ENABLED && walkingController ? walkingController : controller;
    window.__athens.collisionWorld = collisionWorld;
    window.__athens.toggleSound = context.toggleSound;
    window.__athens.toggleSky = context.toggleSky;
    window.__athens.toggleStats = context.toggleStats;
    window.__athens.sanityGeometry = sanityGeometry;
  }

  return context;
}

// LANDMARK_OVERRIDE_START
function _applyLandmarkOverrides(scene, options){
  const overrides = options?.layoutConfig?.positions;
  if (!overrides || typeof overrides !== 'object') return;

  const keys = Object.keys(overrides);
  if (!keys.length) return;

  _applyLandmarkLayout(scene, options, keys, { label: 'LandmarkOverride' });
}
// LANDMARK_OVERRIDE_END
