import * as THREE from 'three';
import { createStats } from '../debug/statsShim.js';
import { setupGround, updateTrees } from '../main.js';
import { initSky, setSky, reapplySky } from '../sky/SkyManager.ts';
import boot from '../core/bootstrap.js';
import createKeyboard from '../input/keyboard.js';
import { createPlayerController } from '../player/playerController.js';
import { loadPlayerAvatar, PlayerAvatar } from '../player/playerAvatar.ts';
import { AnimationController, scaleObjectToHeight } from '../player/animationController';
import { createFollowCamera } from '../camera/followCamera.js';
import { seedCameraBehindPlayer } from '../camera/seedCameraBehindPlayer.js';
import { installRenderGuard } from '../safety/hardenPositions';
import {
  DEFAULT_CAMERA,
  DEFAULT_PLAYER,
  finiteNumber,
  isFiniteVec3,
  sanitizeEuler,
  sanitizeQuaternion,
  sanitizeVec3,
  safeSetVec3
} from '../utils/sanitize';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapToGround } from '../physics/groundSnap.js';
import { ensureFeetAtLocalZero, groundYAt } from '../utils/spawn.ts';
import { createNpcManager } from '../npc/simpleNpcManager.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';
import { AudioManager } from '../audio/AudioManager.js';
import { AmbientAPI, AMBIENT_TRACKS, initAmbient } from '../audio/ambient';
import { createFootsteps } from '../audio/footsteps.js';
import { attachNpcAudio } from '../audio/npcAudio.js';
import { createHUD } from '../ui/hud.js';
import { createTimeSky, setSkyEnabled, isSkyEnabled } from '../sky/timeSky.js';
import { createMountainRim as createHorizonMountainRim } from '../horizon/mountainRim.js';
import { movementConfig } from '../config/movement.ts';
import { spawnPlayerOutsideWalls } from '../player/spawnPlayerOutsideWalls.ts';
import {
  initializeTimeMode,
  setTimeMode as applyTimeMode,
  shiftTimeForward,
  shiftTimeBackward,
  getTimeMode as getCurrentTimeMode
} from '../time/timeController.ts';

type TransformState = {
  pos?: Partial<THREE.Vector3> | { x?: number | null; y?: number | null; z?: number | null } | null;
  rotEuler?: { x?: number | null; y?: number | null; z?: number | null } | null;
  rotQuat?: { x?: number | null; y?: number | null; z?: number | null; w?: number | null } | null;
};

type SavedState = {
  player?: TransformState | null;
  camera?: TransformState | null;
};

type RunOptions = {
  containerId?: string;
  skyMode?: string;
  preset?: string;
  preserveBackground?: boolean;
  savedState?: SavedState | null;
  initialState?: SavedState | null;
};

type StatsHandle = {
  dom: HTMLElement | null;
  begin: () => void;
  end: () => void;
};

const DEFAULT_STATS_STYLE = 'position:fixed;left:0;top:0;z-index:9999';
const DEFAULT_BACKGROUND_HEX = 0x202834;
const HORIZON_QUERY_PARAM = 'horizon';
const HORIZON_DEFAULT_ENABLED = true;
const HORIZON_DEFAULT_OPTIONS = Object.freeze({
  radius: 1100,
  height: 75,
  radialSegments: 192,
  noise: 0.32,
  seed: 7331,
  color: 0x0f1d2d
});

let stats: StatsHandle | null = null;
let statsVisible = true;

const updateStatsVisibility = () => {
  const panel = stats?.dom;
  if (panel) {
    panel.style.display = statsVisible ? '' : 'none';
  }
};

const registerGlobalStatsHelpers = () => {
  if (typeof window === 'undefined') return;

  const globalWindow = window as typeof window & {
    getStats?: () => StatsHandle | null;
    toggleStatsVisibility?: (forceVisible?: boolean) => boolean;
  };

  globalWindow.getStats = () => stats;
  globalWindow.toggleStatsVisibility = (forceVisible?: boolean) => {
    statsVisible = typeof forceVisible === 'boolean' ? forceVisible : !statsVisible;
    updateStatsVisibility();
    return statsVisible;
  };
};

const statsReady: Promise<StatsHandle> = (async () => {
  const created = (await createStats()) as StatsHandle;
  stats = created;
  if (created.dom && typeof document !== 'undefined' && document.body) {
    created.dom.style.cssText = DEFAULT_STATS_STYLE;
    document.body.appendChild(created.dom);
  }
  registerGlobalStatsHelpers();
  updateStatsVisibility();
  return created;
})();

const bootFn = (boot as unknown as (() => void) | null | undefined);
let bootstrapInvoked = false;

if (typeof bootFn === 'function') {
  bootstrapInvoked = true;
  console.log('[Athens] boot starting');
  try {
    const maybePromise = bootFn();
    if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
      (maybePromise as Promise<unknown>).catch((error) => {
        console.error('[Athens] boot failed', error);
      });
    }
  } catch (error) {
    console.error('[Athens] boot failed', error);
    bootstrapInvoked = false;
  }
}

const DEFAULT_CONTAINER_ID = 'app';
const STATUS_SELECTOR = '[data-status-line]';

function updateStatus(message: string, level: 'info' | 'error' = 'info') {
  if (typeof document === 'undefined') return;
  const statusEl = document.querySelector<HTMLElement>(STATUS_SELECTOR);
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.dataset.statusLevel = level;
  }
}

function ensureContainer(id: string) {
  if (typeof document === 'undefined') {
    throw new Error('Document is not available in the current environment.');
  }
  const container = document.getElementById(id);
  if (!container) throw new Error(`Athens boot: container #${id} not found.`);
  return container;
}

function computeSize(element: HTMLElement) {
  const { width, height } = element.getBoundingClientRect();
  const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 1;
  const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 1;
  return {
    width: Math.max(1, Math.floor(width || fallbackWidth || 1)),
    height: Math.max(1, Math.floor(height || fallbackHeight || 1))
  };
}

function createPlaceholderPlayer() {
  const group = new THREE.Group();
  group.name = 'Player';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65, metalness: 0.15 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.1 });

  if (typeof (THREE as any).CapsuleGeometry === 'function') {
    const capsule = new THREE.Mesh(new (THREE as any).CapsuleGeometry(0.45, 1.6, 12, 24), bodyMaterial);
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

  sanitizeVec3(group.position, DEFAULT_PLAYER);

  return group;
}

export async function runAthens(options: RunOptions = {}) {
  updateStatus('Starting Athens renderer…');

  const containerId = options.containerId ?? DEFAULT_CONTAINER_ID;
  const container = ensureContainer(containerId);

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(DEFAULT_BACKGROUND_HEX, 1);
  // Ensure opaque clear so the canvas never shows the page background
  renderer.setClearAlpha(1.0);
  renderer.setPixelRatio(Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2));

  const { width: initialWidth, height: initialHeight } = computeSize(container);
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  statsReady
    .then((created) => {
      if (!created.dom) return;
      created.dom.style.position = 'absolute';
      created.dom.style.left = '0';
      created.dom.style.top = '0';
      created.dom.style.pointerEvents = 'none';
      created.dom.style.zIndex = '5';
      if (!container.contains(created.dom)) {
        container.appendChild(created.dom);
      }
      updateStatsVisibility();
    })
    .catch(() => { /* ignore */ });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DEFAULT_BACKGROUND_HEX);

  const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 2000);
  camera.position.set(DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z);
  sanitizeVec3(camera.position, DEFAULT_CAMERA);
  const el = renderer.domElement;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  camera.aspect = (w > 0 && h > 0) ? (w / h) : (16 / 9);
  camera.updateProjectionMatrix();

  let globalWindow: (typeof window & { __athensDebug?: Record<string, unknown> }) | null = null;
  let searchParams: URLSearchParams | null = null;
  if (typeof window !== 'undefined') {
    globalWindow = window as typeof window & { __athensDebug?: Record<string, unknown> };
    globalWindow.THREE = THREE;
    const existingDebug =
      globalWindow.__athensDebug && typeof globalWindow.__athensDebug === 'object'
        ? globalWindow.__athensDebug
        : {};
    globalWindow.__athensDebug = { ...existingDebug, scene, camera, renderer };

    searchParams = new URLSearchParams(globalWindow.location.search);
    if (searchParams.get('headlessSmoke') === '1') {
      globalWindow.__athensDebug = { renderer, scene, camera };
    }
  }

  const resolveHorizonEnabled = () => {
    const override = searchParams?.get(HORIZON_QUERY_PARAM);
    if (override == null) {
      return HORIZON_DEFAULT_ENABLED;
    }
    const normalized = override.trim().toLowerCase();
    if (!normalized) {
      return HORIZON_DEFAULT_ENABLED;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
      return false;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
      return true;
    }
    return HORIZON_DEFAULT_ENABLED;
  };

  let horizonRim: THREE.Mesh | null = null;
  const applyHorizonVisibility = (enabled: boolean) => {
    if (horizonRim) {
      horizonRim.visible = enabled;
    }
    return enabled;
  };

  if (resolveHorizonEnabled()) {
    try {
      horizonRim = createHorizonMountainRim(HORIZON_DEFAULT_OPTIONS);
      scene.add(horizonRim);
      applyHorizonVisibility(true);
    } catch (error) {
      console.warn('[Athens][Boot] Failed to create horizon rim.', error);
      horizonRim = null;
    }
  }

  await initAmbient(camera);

  if (globalWindow) {
    globalWindow.__athensDebug = {
      ...(globalWindow.__athensDebug || {}),
      audioAPI: AmbientAPI,
      horizonRim
    };
  }

  const audio = new AudioManager(camera, { masterVolume: 0.9 });

  const resumeAudioContext = () => {
    const listener = audio.getListener?.();
    const ctx = (listener as any)?.context || (listener as any)?.getContext?.();
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', resumeAudioContext);
      window.removeEventListener('keydown', resumeAudioContext);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('click', resumeAudioContext);
    window.addEventListener('keydown', resumeAudioContext);
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(120, 220, 150);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 600;

  scene.add(ambientLight);
  scene.add(directionalLight);

  const lightingContext = { renderer, sun: directionalLight, ambient: ambientLight };

  const applyQualityPreset = (preset: string) => {
    const normalized = typeof preset === 'string' ? preset.toLowerCase() : '';
    const target: 'low' | 'medium' | 'high' =
      normalized === 'low' || normalized === 'medium' || normalized === 'high' ? (normalized as any) : 'medium';

    const shadow = directionalLight.shadow;

    switch (target) {
      case 'low': {
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.shadowMap.needsUpdate = true;
        directionalLight.castShadow = false;
        renderer.toneMappingExposure = 0.9;
        break;
      }
      case 'medium': {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.shadowMap.needsUpdate = true;
        directionalLight.castShadow = true;
        shadow.mapSize.set(512, 512);
        shadow.needsUpdate = true;
        renderer.toneMappingExposure = 1.0;
        break;
      }
      default: {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.needsUpdate = true;
        directionalLight.castShadow = true;
        shadow.mapSize.set(2048, 2048);
        shadow.needsUpdate = true;
        renderer.toneMappingExposure = 1.1;
        break;
      }
    }

    return target;
  };

  const environmentMode = options.skyMode ?? options.preset ?? 'day';
  const initialSkyMode =
    typeof environmentMode === 'string' && environmentMode ? environmentMode : 'day';

  initSky(renderer);
  let bootSkyApplied = false;
  try {
    const result = await setSky(scene, 'assets/sky/day.jpg');
    bootSkyApplied = Boolean(result);
  } catch (error) {
    console.warn('[Athens][Boot] setSky failed for initial load.', error);
  }
  if (!bootSkyApplied) {
    reapplySky(scene);
  }

  await createTimeSky(renderer, scene, initialSkyMode);
  const initialTimeMode = await initializeTimeMode(initialSkyMode, lightingContext);
  applyHorizonVisibility(isSkyEnabled() || resolveHorizonEnabled());

  if (typeof setupGround === 'function') {
    try {
      await setupGround(scene, renderer);
    } catch (error) {
      console.warn('[Athens][Boot] setupGround failed', error);
    }
  }

  const ambientMuted = searchParams?.get('mute') === '1';
  const ambientOverrideSelected = searchParams?.has('amb') ?? false;
  const ambientTrackIds = new Set(AMBIENT_TRACKS.map((track) => track.id));
  const defaultAmbientTrack = AMBIENT_TRACKS[0]?.id ?? null;
  const MODE_TO_AMBIENT: Record<string, string[]> = {
    dawn: ['dawn', 'forest', 'coast', 'night_crickets'],
    day: ['day', 'forest', 'coast', 'market'],
    high_noon: ['day', 'forest', 'coast', 'market'],
    dusk: ['dusk', 'forest', 'coast', 'night_crickets'],
    golden_hour: ['dusk', 'forest', 'coast', 'market'],
    night: ['night', 'night_crickets', 'coast', 'forest'],
    midnight: ['night', 'night_crickets', 'coast', 'forest']
  };

  const selectAmbientTrack = (mode: string) => {
    const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
    const candidates = MODE_TO_AMBIENT[normalized] ?? [];
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

  const applyAmbientForMode = (mode: string, allowPlayback = true) => {
    if (ambientMuted || ambientTrackIds.size === 0) {
      return null;
    }
    const trackId = selectAmbientTrack(mode);
    if (trackId && allowPlayback) {
      AmbientAPI.play(trackId).catch(() => {});
    }
    return trackId;
  };

  let activeTimeMode = initialTimeMode ?? initialSkyMode;

  if (!ambientOverrideSelected) {
    applyAmbientForMode(activeTimeMode, true);
  }

  const handleTimeOfDay = async (mode: string) => {
    const appliedMode = await applyTimeMode(mode, lightingContext);
    activeTimeMode = appliedMode ?? getCurrentTimeMode() ?? activeTimeMode;
    applyAmbientForMode(activeTimeMode, true);
    return activeTimeMode;
  };

  const handleVolume = (value: number) => {
    if (!audio || typeof value !== 'number' || Number.isNaN(value)) return;
    audio.setMasterVolume(value);
  };

  const handleSkyEnabled = (enabled: boolean) => {
    const result = setSkyEnabled(enabled);
    applyHorizonVisibility(result || resolveHorizonEnabled());
    return result;
  };

  applyQualityPreset('high');

  createHUD({
    setTimeOfDay: (mode) => handleTimeOfDay(mode),
    setVolume: (value) => handleVolume(Number(value)),
    setQuality: (preset) => applyQualityPreset(String(preset)),
    setSkyEnabled: (value) => handleSkyEnabled(Boolean(value))
  });

  let removeSkyHotkey: (() => void) | null = null;
  let removeSkyEnabledListener: (() => void) | null = null;
  if (typeof window !== 'undefined' && window.addEventListener) {
    const handleSkyToggleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) {
          return;
        }
      }
      const code = typeof event.code === 'string' ? event.code : '';
      if (code === 'KeyK') {
        handleSkyEnabled(!isSkyEnabled());
      }
    };
    window.addEventListener('keydown', handleSkyToggleKey);
    removeSkyHotkey = () => window.removeEventListener('keydown', handleSkyToggleKey);

    const handleSkyStateChanged = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const enabled = typeof detail?.enabled === 'boolean' ? detail.enabled : isSkyEnabled();
      applyHorizonVisibility(enabled || resolveHorizonEnabled());
    };
    window.addEventListener('athens:sky-enabled-changed', handleSkyStateChanged as EventListener);
    removeSkyEnabledListener = () =>
      window.removeEventListener('athens:sky-enabled-changed', handleSkyStateChanged as EventListener);
  }

  markGround(scene);
  const groundMeshes = collectGround(scene);
  markColliders(scene);
  const colliderMeshes = collectColliders(scene);
  const colliders = buildAABBs(colliderMeshes);

  let playerAvatar: PlayerAvatar | null = null;
  let animController: AnimationController | null = null;
  const existingPlayer =
    scene.getObjectByName('MainCharacter') || scene.getObjectByName('Player');

  let playerObject = existingPlayer ?? null;

  if (!playerObject) {
    try {
      playerAvatar = await loadPlayerAvatar();
      playerObject = playerAvatar.object;
    } catch (error) {
      console.warn('[Athens][Boot] Failed to load hoplite avatar, using placeholder.', error);
      playerObject = createPlaceholderPlayer();
      playerAvatar = null;
    }
  }

  playerObject.name = playerObject.name || 'MainCharacter';
  if (!scene.getObjectByName(playerObject.name)) {
    scene.add(playerObject);
  }
  scaleObjectToHeight(playerObject, 1.8);
  ensureFeetAtLocalZero(playerObject);

  if (playerAvatar) {
    const clips = Object.values(playerAvatar.clips).filter(
      (clip): clip is THREE.AnimationClip => clip instanceof THREE.AnimationClip
    );
    (playerObject as THREE.Object3D & { animations?: THREE.AnimationClip[] }).animations = clips;
  }

  if (!animController) {
    const playerWithAnimations = playerObject as THREE.Object3D & { animations?: THREE.AnimationClip[] };
    const animations = playerWithAnimations.animations;
    if (Array.isArray(animations) && animations.length > 0) {
      animController = new AnimationController(playerWithAnimations);
      animController.autoUpdate = false;
      animController.update(0, { immediate: true });
    }
  }

  const resolveSavedState = (): SavedState | null => {
    if (options?.savedState) {
      return options.savedState;
    }
    if (options?.initialState) {
      return options.initialState;
    }
    if (typeof window !== 'undefined') {
      const globalWindow = window as typeof window & {
        __ATHENS_SAVED_STATE?: SavedState | null;
      };
      if (globalWindow.__ATHENS_SAVED_STATE && typeof globalWindow.__ATHENS_SAVED_STATE === 'object') {
        return globalWindow.__ATHENS_SAVED_STATE;
      }
      try {
        const raw = globalWindow.localStorage?.getItem?.('athens:lastState');
        if (raw) {
          const parsed = JSON.parse(raw) as SavedState;
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

  const restoreCameraAndPlayer = (saved: SavedState | null | undefined) => {
    if (saved?.player?.pos) {
      safeSetVec3(playerObject.position, saved.player.pos, DEFAULT_PLAYER);
    } else {
      sanitizeVec3(playerObject.position, DEFAULT_PLAYER);
    }

    if (saved?.player?.rotEuler) {
      playerObject.rotation.set(
        finiteNumber(saved.player.rotEuler.x, playerObject.rotation.x),
        finiteNumber(saved.player.rotEuler.y, playerObject.rotation.y),
        finiteNumber(saved.player.rotEuler.z, playerObject.rotation.z)
      );
    }
    sanitizeEuler(playerObject.rotation);

    if (saved?.player?.rotQuat) {
      playerObject.quaternion.set(
        finiteNumber(saved.player.rotQuat.x, playerObject.quaternion.x),
        finiteNumber(saved.player.rotQuat.y, playerObject.quaternion.y),
        finiteNumber(saved.player.rotQuat.z, playerObject.quaternion.z),
        finiteNumber(saved.player.rotQuat.w, playerObject.quaternion.w)
      );
    }
    sanitizeQuaternion(playerObject.quaternion);

    if (saved?.camera?.pos) {
      safeSetVec3(camera.position, saved.camera.pos, DEFAULT_CAMERA);
    } else {
      sanitizeVec3(camera.position, DEFAULT_CAMERA);
    }

    if (saved?.camera?.rotEuler) {
      camera.rotation.set(
        finiteNumber(saved.camera.rotEuler.x, camera.rotation.x),
        finiteNumber(saved.camera.rotEuler.y, camera.rotation.y),
        finiteNumber(saved.camera.rotEuler.z, camera.rotation.z)
      );
    }
    sanitizeEuler(camera.rotation);

    if (saved?.camera?.rotQuat) {
      camera.quaternion.set(
        finiteNumber(saved.camera.rotQuat.x, camera.quaternion.x),
        finiteNumber(saved.camera.rotQuat.y, camera.quaternion.y),
        finiteNumber(saved.camera.rotQuat.z, camera.quaternion.z),
        finiteNumber(saved.camera.rotQuat.w, camera.quaternion.w)
      );
    }
    sanitizeQuaternion(camera.quaternion);

    const lookTarget = playerObject.position;
    sanitizeVec3(lookTarget, DEFAULT_PLAYER);
    camera.lookAt(lookTarget);
  };

  const savedState = resolveSavedState();
  const hasSavedPlayerPos = Boolean(savedState?.player?.pos);
  const hasSavedCameraPos = Boolean(savedState?.camera?.pos);

  restoreCameraAndPlayer(savedState);

  const groundSnapSkip = { value: 0 };

  if (!hasSavedPlayerPos) {
    await spawnPlayerOutsideWalls({
      scene,
      player: playerObject,
      groundObjects: groundMeshes.length ? groundMeshes : null,
      margin: 6,
      skipSnapFramesFlag: groundSnapSkip
    });
  }

  if (groundMeshes.length) {
    const initialState = { vy: 0, lastGoodY: playerObject.position.y };
    if (!(groundSnapSkip.value > 0)) {
      snapToGround(playerObject, groundMeshes, initialState, 0);
    }
  }

  const cameraSettings = movementConfig?.camera ?? {};
  const cameraFollowConfig = cameraSettings?.follow ?? {};
  const cameraSeedConfig = cameraSettings?.seed ?? {};

  if (!hasSavedCameraPos) {
    seedCameraBehindPlayer(playerObject, camera, {
      followDistance: Number.isFinite(cameraSeedConfig?.followDistance)
        ? cameraSeedConfig.followDistance
        : 6,
      shoulderHeight: Number.isFinite(cameraSeedConfig?.shoulderHeight)
        ? cameraSeedConfig.shoulderHeight
        : 1.6,
      pitchDeg: Number.isFinite(cameraSeedConfig?.pitchDeg)
        ? cameraSeedConfig.pitchDeg
        : -15
    });
  }

  sanitizeVec3(playerObject.position, DEFAULT_PLAYER);
  sanitizeVec3(camera.position, DEFAULT_CAMERA);
  camera.lookAt(playerObject.position);

  const keyboard = createKeyboard();
  const playerController = createPlayerController(playerObject, keyboard, {
    walkSpeed: Number.isFinite(movementConfig?.walkSpeed) ? movementConfig.walkSpeed : 4.0,
    runMultiplier: Number.isFinite(movementConfig?.runMultiplier) ? movementConfig.runMultiplier : 1.7,
    acceleration: Number.isFinite(movementConfig?.acceleration) ? movementConfig.acceleration : 10,
    turnLerp: 0.18,
    colliders,
    groundSnapSkipRef: groundSnapSkip
  });
  playerController.setGroundMeshes?.(groundMeshes);
  playerController.setColliders?.(colliders);

  const state = (
    playerController as { state?: { anim?: AnimationController | null; velocity?: THREE.Vector3 | null } }
  ).state;
  if (state && animController) {
    state.anim = animController;
  }

  const footsteps = createFootsteps(audio);

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
  if ((followCamera as any)?.target) {
    sanitizeVec3((followCamera as any).target, DEFAULT_PLAYER);
  }

  // Install per-frame hardening so late/async NaNs cannot break render
  installRenderGuard({
    scene,
    camera,
    renderer,
    controls: (followCamera as unknown) as { target?: THREE.Vector3; addEventListener?: (t: string, cb: () => void) => void },
    defaults: { player: { x:0, y:1, z:0 }, camera: { x:20, y:12, z:20 } },
    playerNameCandidates: ['MainCharacter', 'Player']
  });

  const npcManager = createNpcManager(scene, groundMeshes, { colliders });
  npcManager.setGroundMeshes?.(groundMeshes);
  npcManager.setColliders?.(colliders);
  const npcState = npcManager.spawn({
    waypoints: [new THREE.Vector3(6, 0, 6), new THREE.Vector3(10, 0, 6)]
  });
  if (npcState?.object3d) {
    attachNpcAudio(audio, npcState.object3d, { clip: 'market_chatter.mp3', volume: 0.3, distance: 20 }).catch(() => {});
  }

  const clock = new THREE.Clock();
  let frameId: number | null = null;
  const previousPlayerPosition = playerObject.position.clone();
  const playerDelta = new THREE.Vector3();
  let footstepTimer = 0;
  let footstepInterval = Infinity;
  let previousJumpDown = false;

  const handleResize = () => {
    const { width, height } = computeSize(container);
    const safeWidth = Math.max(1, finiteNumber(width, 1));
    const safeHeight = Math.max(1, finiteNumber(height, 1));
    renderer.setSize(safeWidth, safeHeight, false);
    const aspect = safeHeight > 0 ? safeWidth / safeHeight : camera.aspect;
    if (Number.isFinite(aspect) && aspect > 0) {
      camera.aspect = aspect;
    }
    camera.updateProjectionMatrix();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }

  const animate = () => {
    const activeStats = stats;
    activeStats?.begin();
    try {
      let delta = clock.getDelta();
      if (!Number.isFinite(delta) || delta <= 0 || delta > 0.25) delta = 1 / 60;
      if (typeof updateTrees === 'function') {
        try {
          updateTrees(delta);
        } catch (error) {
          console.warn('[Athens][Boot] updateTrees failed', error);
        }
      }

      if (!isFiniteVec3(playerObject.position)) {
        sanitizeVec3(playerObject.position, DEFAULT_PLAYER);
      }
      if (!isFiniteVec3(camera.position)) {
        sanitizeVec3(camera.position, DEFAULT_CAMERA);
      }
      const followTarget = (followCamera as any)?.target;
      if (followTarget) {
        if (!isFiniteVec3(followTarget)) {
          followTarget.copy(playerObject.position);
        } else {
          sanitizeVec3(followTarget, DEFAULT_PLAYER);
        }
      }

      keyboard.update?.();

      if (keyboard.wasPressed?.('KeyT')) {
        shiftTimeForward(lightingContext)
          .then((mode) => {
            activeTimeMode = mode ?? activeTimeMode;
            applyAmbientForMode(activeTimeMode, true);
          })
          .catch(() => {});
      }
      if (keyboard.wasPressed?.('KeyY')) {
        shiftTimeBackward(lightingContext)
          .then((mode) => {
            activeTimeMode = mode ?? activeTimeMode;
            applyAmbientForMode(activeTimeMode, true);
          })
          .catch(() => {});
      }

      previousPlayerPosition.copy(playerObject.position);
      try {
        playerController.update(delta, camera);
      } catch (error) {
        console.warn('[Athens][Boot] player update failed', error);
      }

      const flying = typeof playerController.isFlying === 'function' ? playerController.isFlying() : false;
      if (!flying) {
        const groundTargets = groundMeshes.length ? groundMeshes : scene;
        const gy = groundYAt(playerObject.position.x, playerObject.position.z, groundTargets);
        if (gy != null) {
          const targetY = gy + 0.02;
          const dy = targetY - playerObject.position.y;
          const maxUp = 1.0;
          const maxDown = 4.0;
          const clamped = Math.max(-maxDown, Math.min(maxUp, dy));
          playerObject.position.y += clamped;
        }
      }

      playerDelta.subVectors(playerObject.position, previousPlayerPosition);
      const moveDistance = playerDelta.length();
      const currentSpeed = delta > 1e-6 ? moveDistance / Math.max(delta, 1e-6) : 0;

      const jumpDown = !flying && Boolean(keyboard.isDown?.('Space'));
      const jumpRequested = jumpDown && !previousJumpDown;
      previousJumpDown = jumpDown;

      if (playerAvatar) {
        try {
          const isRunning = typeof playerController.isRunning === 'function'
            ? playerController.isRunning()
            : currentSpeed > 3.5;
          playerAvatar.update(delta, {
            speed: currentSpeed,
            isRunning,
            jumpRequested,
            isFlying: flying
          });
        } catch (error) {
          console.warn('[Athens][Boot] player avatar update failed', error);
        }
      }

      if (animController) {
        const usesControllerState = Boolean(state && state.anim === animController);
        const velocityVec = (state?.velocity ?? null) as THREE.Vector3 | null;
        let planarSpeed = Number.NaN;
        if (velocityVec && Number.isFinite(velocityVec.x) && Number.isFinite(velocityVec.z)) {
          planarSpeed = Math.hypot(velocityVec.x, velocityVec.z);
        }
        if (!Number.isFinite(planarSpeed)) {
          const safeDelta = delta > 1e-6 ? delta : 1 / 60;
          const denom = Math.max(safeDelta, 1e-6);
          planarSpeed = denom > 0 ? Math.hypot(playerDelta.x, playerDelta.z) / denom : 0;
        }
        if (!usesControllerState) {
          let desired: 'idle' | 'walk' | 'run' = 'idle';
          if (planarSpeed >= 2.5) desired = 'run';
          else if (planarSpeed >= 0.1) desired = 'walk';
          if (animController.current !== desired) {
            animController.set(desired);
          }
        }
        animController.update(usesControllerState ? 0 : delta, { immediate: true });
      }

      footstepInterval = footsteps.setIntervalBySpeed(currentSpeed);
      if (Number.isFinite(footstepInterval)) {
        if (currentSpeed < 0.3) {
          footstepTimer = Math.min(footstepTimer, footstepInterval);
        } else {
          footstepTimer += delta;
          if (footstepTimer >= footstepInterval) {
            footstepTimer = 0;
            const { x, z } = playerObject.position;
            const surface = Math.abs(x) < 55 && Math.abs(z) < 55 ? 'stone' : 'dirt';
            footsteps.onStep(surface);
          }
        }
      } else {
        footstepTimer = 0;
      }

      try {
        npcManager.update(delta);
      } catch (error) {
        console.warn('[Athens][Boot] npc update failed', error);
      }

      followCamera.update(keyboard, delta);

      // --- NaN guards (player & camera) ---
      {
        const player =
          scene.getObjectByName('MainCharacter') ||
          scene.getObjectByName('Player') ||
          playerObject;
        if (player?.position && !isFiniteVec3(player.position)) {
          sanitizeVec3(player.position, DEFAULT_PLAYER);
        }
        if (!isFiniteVec3(playerObject.position)) {
          sanitizeVec3(playerObject.position, DEFAULT_PLAYER);
        }
        if (!isFiniteVec3(camera.position)) {
          sanitizeVec3(camera.position, DEFAULT_CAMERA);
        }

        const guardTarget = (followCamera as any)?.target;
        if (guardTarget) {
          if (!isFiniteVec3(guardTarget)) {
            guardTarget.copy(playerObject.position);
          } else {
            sanitizeVec3(guardTarget, DEFAULT_PLAYER);
          }
        }

        const lookTarget = player?.position ?? playerObject.position;
        sanitizeVec3(lookTarget, DEFAULT_PLAYER);
        camera.lookAt(lookTarget);
      }

      renderer.render(scene, camera);
    } finally {
      activeStats?.end();
    }
    frameId = requestAnimationFrame(animate);
  };

  animate();

  updateStatus('Athens is running.');

  const context = {
    scene,
    camera,
    renderer,
    stats,
    keyboard,
    playerController,
    followCamera,
    npcManager,
    audio,
    footsteps,
    horizonRim,
    setHorizonVisible: (visible: boolean) => applyHorizonVisibility(Boolean(visible)),
    setAmbience(mode: string) {
      return applyAmbientForMode(mode, true);
    },
    dispose() {
      if (frameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('click', resumeAudioContext);
        window.removeEventListener('keydown', resumeAudioContext);
      }
      removeSkyHotkey?.();
      removeSkyEnabledListener?.();
      const panel = stats?.dom;
      if (panel && panel.parentNode === container) {
        container.removeChild(panel);
      }
      npcManager.dispose?.();
      keyboard.dispose?.();
      footsteps.dispose?.();
      audio.stopAll?.();
      renderer.dispose?.();
      followCamera.setPointerLockElement?.(null);
    }
  };

  if (typeof window !== 'undefined') {
    (window as any).__athensContext = context;
  }

  return context;
}

const globalWindow = typeof window !== 'undefined' ? window : undefined;

if (globalWindow) {
  (globalWindow as any).runAthens = runAthens;
  console.log('[Athens] initializer ready');

  if (typeof globalWindow.dispatchEvent === 'function') {
    globalWindow.dispatchEvent(
      new CustomEvent('athens:initializer-ready', {
        detail: { initializer: (globalWindow as any).runAthens, source: 'boot.html' }
      })
    );
  }

  if (!bootstrapInvoked) {
    try {
      await (globalWindow as any).runAthens();
      console.log('[Athens] render loop running');
    } catch (error: unknown) {
      updateStatus('Failed to start Athens. See console for details.', 'error');
      console.error(error);
    }
  }
}
