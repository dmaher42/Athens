import * as THREE from 'three';
import { createStats } from '../debug/statsShim.js';
import { setupGround, updateTrees } from '../main.js';
import { setEnvironment } from '../scene/sky.js';
import boot from '../core/bootstrap.js';
import createKeyboard from '../input/keyboard.js';
import { createPlayerController } from '../player/playerController.js';
import { createFollowCamera } from '../camera/followCamera.js';
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
import { createNpcManager } from '../npc/simpleNpcManager.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';
import { AudioManager } from '../audio/AudioManager.js';
import { initAmbience, setAmbience } from '../audio/ambience.js';
import { createFootsteps } from '../audio/footsteps.js';
import { attachNpcAudio } from '../audio/npcAudio.js';
import { createHUD } from '../ui/hud.js';

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
console.log('[Athens] boot starting');
bootFn?.();

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

  const canvas = renderer.domElement;
  const canvasWidth = finiteNumber(canvas?.clientWidth, initialWidth);
  const canvasHeight = finiteNumber(canvas?.clientHeight, initialHeight);
  const safeWidth = Math.max(1, canvasWidth);
  const safeHeight = Math.max(1, canvasHeight);
  const aspect = safeHeight > 0 ? safeWidth / safeHeight : 16 / 9;
  camera.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  camera.updateProjectionMatrix();

  if (typeof window !== 'undefined') {
    const globalWindow = window as typeof window & { __athensDebug?: unknown };
    globalWindow.THREE = THREE;
    globalWindow.__athensDebug = { scene, camera, renderer };

    const params = new URLSearchParams(globalWindow.location.search);
    if (params.get('headlessSmoke') === '1') {
      (globalWindow as any).__athensDebug = { renderer, scene, camera };
    }
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
  if (typeof setEnvironment === 'function') {
    try {
      await setEnvironment(renderer, scene, environmentMode, {
        enablePhotoSky: false,
        preserveBackground: true
      });
    } catch (error) {
      console.warn('[Athens][Boot] setEnvironment failed', error);
    }
  }

  if (typeof setupGround === 'function') {
    try {
      await setupGround(scene, renderer);
    } catch (error) {
      console.warn('[Athens][Boot] setupGround failed', error);
    }
  }

  const ambienceMode = ['dawn', 'day', 'dusk', 'night'].includes(environmentMode) ? environmentMode : 'day';
  try {
    await initAmbience(audio, ambienceMode);
  } catch (error) {
    console.warn('[Athens][Boot] initAmbience failed', error);
  }

  let currentAmbienceMode = ambienceMode;
  const applyAmbienceForMode = (mode: string) => {
    if (!audio) return;
    const targetMode = ['dawn', 'day', 'dusk', 'night'].includes(mode) ? mode : 'day';
    currentAmbienceMode = targetMode;
    setAmbience(audio, targetMode).catch(() => {});
  };

  const handleTimeOfDay = (mode: string) => {
    const fallback = typeof mode === 'string' && mode ? mode : 'day';
    currentAmbienceMode = fallback;
    applyAmbienceForMode(fallback);
    return fallback;
  };

  const handleVolume = (value: number) => {
    if (!audio || typeof value !== 'number' || Number.isNaN(value)) return;
    audio.setMasterVolume(value);
  };

  const handleSkyEnabled = (enabled: boolean) => {
    const normalized = Boolean(enabled);
    scene.background = new THREE.Color(DEFAULT_BACKGROUND_HEX);
    renderer.setClearColor(DEFAULT_BACKGROUND_HEX, 1);
    return normalized;
  };

  applyQualityPreset('high');

  createHUD({
    setTimeOfDay: (mode) => handleTimeOfDay(mode),
    setVolume: (value) => handleVolume(Number(value)),
    setQuality: (preset) => applyQualityPreset(String(preset)),
    setSkyEnabled: (value) => handleSkyEnabled(Boolean(value))
  });

  markGround(scene);
  const groundMeshes = collectGround(scene);
  markColliders(scene);
  const colliderMeshes = collectColliders(scene);
  const colliders = buildAABBs(colliderMeshes);

  const existingPlayer =
    scene.getObjectByName('MainCharacter') || scene.getObjectByName('Player');
  const playerObject = existingPlayer ?? createPlaceholderPlayer();
  playerObject.name = playerObject.name || 'MainCharacter';
  if (!scene.getObjectByName(playerObject.name)) {
    scene.add(playerObject);
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

  restoreCameraAndPlayer(resolveSavedState());

  if (groundMeshes.length) {
    const initialState = { vy: 0, lastGoodY: playerObject.position.y };
    snapToGround(playerObject, groundMeshes, initialState, 0);
  }

  sanitizeVec3(playerObject.position, DEFAULT_PLAYER);
  sanitizeVec3(camera.position, DEFAULT_CAMERA);
  camera.lookAt(playerObject.position);

  const keyboard = createKeyboard();
  const playerController = createPlayerController(playerObject, keyboard, {
    walkSpeed: 4.0,
    runMultiplier: 1.7,
    acceleration: 10,
    turnLerp: 0.18,
    colliders
  });
  playerController.setGroundMeshes?.(groundMeshes);
  playerController.setColliders?.(colliders);

  const footsteps = createFootsteps(audio);

  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });
  followCamera.syncImmediate?.();
  if ((followCamera as any)?.target) {
    sanitizeVec3((followCamera as any).target, DEFAULT_PLAYER);
  }

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

      previousPlayerPosition.copy(playerObject.position);
      try {
        playerController.update(delta, camera);
      } catch (error) {
        console.warn('[Athens][Boot] player update failed', error);
      }

      playerDelta.subVectors(playerObject.position, previousPlayerPosition);
      const moveDistance = playerDelta.length();
      const currentSpeed = delta > 1e-6 ? moveDistance / Math.max(delta, 1e-6) : 0;
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
    setAmbience(mode: string) {
      return setAmbience(audio, mode);
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
      const panel = stats?.dom;
      if (panel && panel.parentNode === container) {
        container.removeChild(panel);
      }
      npcManager.dispose?.();
      keyboard.dispose?.();
      footsteps.dispose?.();
      audio.stopAll?.();
      renderer.dispose?.();
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

  try {
    await (globalWindow as any).runAthens();
    console.log('[Athens] render loop running');
  } catch (error: unknown) {
    updateStatus('Failed to start Athens. See console for details.', 'error');
    console.error(error);
  }
}
