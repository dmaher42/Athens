import * as THREE from 'three';
if (typeof window !== 'undefined') {
  (window as any).THREE = THREE;
}
import { createStats } from '../debug/statsShim.js';
import { setupGround, updateTrees } from '../main.js';
import { setEnvironment } from '../scene/sky.js';
import { createTimeSky, setTimeOfDay, setSkyEnabled } from '../sky/timeSky.js';
import boot from '../core/bootstrap.js';
import createKeyboard from '../input/keyboard.js';
import { createPlayerController } from '../player/playerController.js';
import { createFollowCamera } from '../camera/followCamera.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { snapToGround } from '../physics/groundSnap.js';
import { createNpcManager } from '../npc/simpleNpcManager.js';
import { markColliders, collectColliders, buildAABBs } from '../physics/colliderRegistry.js';
import { AudioManager } from '../audio/AudioManager.js';
import { initAmbience, setAmbience } from '../audio/ambience.js';
import { createFootsteps } from '../audio/footsteps.js';
import { attachNpcAudio } from '../audio/npcAudio.js';
import { createHUD } from '../ui/hud.js';

type RunOptions = {
  containerId?: string;
  skyMode?: string;
  preset?: string;
  preserveBackground?: boolean;
};

type StatsHandle = {
  dom: HTMLElement | null;
  begin: () => void;
  end: () => void;
};

const DEFAULT_STATS_STYLE = 'position:fixed;left:0;top:0;z-index:9999';

let stats: StatsHandle | null = null;
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

  const globalWindow = window as typeof window & {
    getStats?: () => StatsHandle | null;
    toggleStatsVisibility?: (forceVisible?: boolean) => boolean;
  };

  globalWindow.getStats = () => stats;
  globalWindow.toggleStatsVisibility = (forceVisible?: boolean) => {
    if (typeof forceVisible === 'boolean') {
      statsVisible = forceVisible;
    } else {
      statsVisible = !statsVisible;
    }
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
  if (typeof document === 'undefined') {
    return;
  }
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
  if (!container) {
    throw new Error(`Athens boot: container #${id} not found.`);
  }
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
  renderer.setPixelRatio(Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 2));
  renderer.setClearColor(0x202834, 1);

  const { width: initialWidth, height: initialHeight } = computeSize(container);
  renderer.setSize(initialWidth, initialHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  statsReady
    .then((created) => {
      if (!created.dom) {
        return;
      }
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
    .catch(() => {
      // Ignore stats setup errors.
    });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202834);

  const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 2000);
  camera.position.set(90, 110, 180);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Optional debug hook for smoke tests / console
  if (typeof window !== 'undefined') {
    (window as any).__athensDebug = { scene, camera, renderer };
  }

  const audio = new AudioManager(camera, { masterVolume: 0.9 });

  const resumeAudioContext = () => {
    const listener = audio.getListener?.();
    const ctx = listener?.context || listener?.getContext?.();
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
    let target: 'low' | 'medium' | 'high';
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      target = normalized;
    } else {
      target = 'medium';
    }

    const shadow = directionalLight.shadow;

    switch (target) {
      case 'low': {
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.shadowMap.needsUpdate = true;
        if (directionalLight) {
          directionalLight.castShadow = false;
        }
        renderer.toneMappingExposure = 0.9;
        break;
      }
      case 'medium': {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.shadowMap.needsUpdate = true;
        if (directionalLight) {
          directionalLight.castShadow = true;
        }
        if (shadow?.mapSize?.set) {
          shadow.mapSize.set(512, 512);
        } else if (shadow) {
          shadow.mapSize.width = 512;
          shadow.mapSize.height = 512;
        }
        if (shadow) {
          shadow.needsUpdate = true;
        }
        renderer.toneMappingExposure = 1.0;
        break;
      }
      default: {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.needsUpdate = true;
        if (directionalLight) {
          directionalLight.castShadow = true;
        }
        if (shadow?.mapSize?.set) {
          shadow.mapSize.set(2048, 2048);
        } else if (shadow) {
          shadow.mapSize.width = 2048;
          shadow.mapSize.height = 2048;
        }
        if (shadow) {
          shadow.needsUpdate = true;
        }
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
        enablePhotoSky: false,   // skip JPG dome while debugging
        preserveBackground: true // keep blue/env visible, no white flash
      });
    } catch (error) {
      console.warn('[Athens][Boot] setEnvironment failed', error);
    }
  }

  try {
    await createTimeSky(renderer, scene, environmentMode);
  } catch (error) {
    console.warn('[Athens][Boot] createTimeSky failed', error);
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
    if (!audio) {
      return;
    }
    const targetMode = ['dawn', 'day', 'dusk', 'night'].includes(mode) ? mode : 'day';
    currentAmbienceMode = targetMode;
    setAmbience(audio, targetMode).catch(() => {});
  };

  const handleTimeOfDay = (mode: string) => {
    const fallback = typeof mode === 'string' ? mode : 'day';
    currentAmbienceMode = fallback;
    applyAmbienceForMode(fallback);
    const result = setTimeOfDay(fallback);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<string | null>)
        .then((resolved) => {
          const normalized = resolved && typeof resolved === 'string' ? resolved : fallback;
          applyAmbienceForMode(normalized);
          return normalized;
        })
        .catch((error) => {
          console.warn('[Athens][Boot] setTimeOfDay failed', error);
          applyAmbienceForMode(fallback);
        });
    }
    return result;
  };

  const handleVolume = (value: number) => {
    if (!audio || typeof value !== 'number' || Number.isNaN(value)) {
      return;
    }
    audio.setMasterVolume(value);
  };

  const handleSkyEnabled = (enabled: boolean) => {
    setSkyEnabled(Boolean(enabled));
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

  const playerObject = createPlaceholderPlayer();
  scene.add(playerObject);
  if (groundMeshes.length) {
    const initialState = { vy: 0, lastGoodY: playerObject.position.y };
    snapToGround(playerObject, groundMeshes, initialState, 0);
  }

  const keyboard = createKeyboard();
  const playerController = createPlayerController(playerObject, keyboard, {
    walkSpeed: 4.0,
    runMultiplier: 1.7,
    acceleration: 10,
    turnLerp: 0.18,
    colliders
  });
  playerController.setGroundMeshes(groundMeshes);
  playerController.setColliders(colliders);

  const footsteps = createFootsteps(audio);

  const followCamera = createFollowCamera(camera, playerObject, {
    offset: new THREE.Vector3(0, 2.2, -6),
    lerp: 0.12,
    lookAtOffset: new THREE.Vector3(0, 1.5, 0)
  });
  followCamera.syncImmediate();

  const npcManager = createNpcManager(scene, groundMeshes, { colliders });
  npcManager.setGroundMeshes(groundMeshes);
  npcManager.setColliders(colliders);
  const npcState = npcManager.spawn({
    waypoints: [
      new THREE.Vector3(6, 0, 6),
      new THREE.Vector3(10, 0, 6)
    ]
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
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }

  const animate = () => {
    const activeStats = stats;
    activeStats?.begin();
    try {
      const delta = clock.getDelta();
      if (typeof updateTrees === 'function') {
        try {
          updateTrees(delta);
        } catch (error) {
          console.warn('[Athens][Boot] updateTrees failed', error);
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
      npcManager.dispose();
      keyboard.dispose();
      footsteps.dispose();
      audio.stopAll();
      renderer.dispose();
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
