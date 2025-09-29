import * as THREE from 'three';
import { logOnce } from '../utils/logOnce.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

type PlayerAnimationState = 'idle' | 'walk' | 'run' | 'jump';

type AnimationClipMap = Partial<Record<PlayerAnimationState, THREE.AnimationClip>> & {
  fallbacks: Partial<Record<PlayerAnimationState, PlayerAnimationState>>;
};

type AnimationActionMap = Partial<Record<PlayerAnimationState, THREE.AnimationAction>>;

type PlayerAvatarUpdateContext = {
  speed?: number;
  isRunning?: boolean;
  jumpRequested?: boolean;
  isFlying?: boolean;
};

export type PlayerAvatar = {
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: AnimationClipMap;
  actions: AnimationActionMap;
  update(deltaSeconds: number, context?: PlayerAvatarUpdateContext): void;
  currentState(): PlayerAnimationState | null;
  isJumping(): boolean;
  dispose(): void;
};

export type LoadPlayerAvatarOptions = {
  url?: string;
  scaleToHeight?: number;
};

const DEFAULT_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/models/gltf/Soldier.glb';
const DEFAULT_HEIGHT = 1.75;
const FADE_DURATION = 0.25;
const RUN_SPEED_THRESHOLD = 3.6;
const WALK_SPEED_THRESHOLD = 0.2;

const CLIP_NAME_PREFERENCES: Record<PlayerAnimationState, string[]> = {
  idle: ['idle', 'Idle', 'IDLE', 'BaseLayer.Idle'],
  walk: ['walk', 'Walk', 'WALK'],
  run: ['run', 'Run', 'RUN'],
  jump: ['jump', 'Jump', 'JUMP', 'jump_loop']
};

const CONSOLE_TAG = '[player/avatar]';

function findClip(preferredNames: string[], clips: THREE.AnimationClip[]): THREE.AnimationClip | undefined {
  const lowerMap = new Map<string, THREE.AnimationClip>();
  for (const c of clips) lowerMap.set(c.name.toLowerCase(), c);
  for (const name of preferredNames) {
    const hit = lowerMap.get(name.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

function cloneClipForJump(base: THREE.AnimationClip, fallbackSource: PlayerAnimationState) {
  const clone = base.clone();
  const baseName = base.name?.trim().length ? base.name : fallbackSource;
  clone.name = `${baseName}::jumpFallback::${THREE.MathUtils.generateUUID()}`;
  return clone;
}

function prepareClipMap(clips: THREE.AnimationClip[]): AnimationClipMap {
  const resolved: Partial<Record<PlayerAnimationState, THREE.AnimationClip>> = {};
  const fallbacks: Partial<Record<PlayerAnimationState, PlayerAnimationState>> = {};

  (['idle', 'walk', 'run', 'jump'] as PlayerAnimationState[]).forEach((state) => {
    const hit = findClip(CLIP_NAME_PREFERENCES[state], clips);
    if (hit) resolved[state] = hit;
  });

  // Fill gaps with sensible fallbacks and log once
  const ensureFallback = (state: PlayerAnimationState, order: PlayerAnimationState[]) => {
    if (!resolved[state]) {
      for (const candidate of order) {
        if (resolved[candidate]) {
          resolved[state] = resolved[candidate]!;
          fallbacks[state] = candidate;
          logOnce(
            `player_avatar_fallback_${state}_${candidate}`,
            `${CONSOLE_TAG} Missing "${state}" animation; using "${candidate}" as fallback.`
          );
          break;
        }
      }
    }
  };

  ensureFallback('idle', ['walk', 'run']);
  ensureFallback('walk', ['idle', 'run']);
  ensureFallback('run', ['walk', 'idle']);
  ensureFallback('jump', ['run', 'walk', 'idle']);

  // If jump is a fallback, clone it so we can configure looping independently
  if (resolved.jump && fallbacks.jump) {
    resolved.jump = cloneClipForJump(resolved.jump, fallbacks.jump);
  }

  return { ...resolved, fallbacks };
}

function scaleObjectToHeight(object: THREE.Object3D, targetHeight: number) {
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;
  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) {
    const h = box.max.y - box.min.y;
    if (Number.isFinite(h) && h > 1e-3) {
      const s = targetHeight / h;
      object.scale.setScalar(s);
      object.updateMatrixWorld(true);
    }
  }
}

function enableShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    if ((child as any).isSkinnedMesh) {
      (child as THREE.SkinnedMesh).frustumCulled = false;
    }
  });
}

function summarizeClips(map: AnimationClipMap) {
  return (['idle', 'walk', 'run', 'jump'] as PlayerAnimationState[])
    .map((key) => {
      const clip = map[key];
      return clip ? `${key}:${clip.name}${map.fallbacks[key] ? ` (fallback:${map.fallbacks[key]})` : ''}` : `${key}:none`;
    })
    .join(', ');
}

export async function loadPlayerAvatar(options: LoadPlayerAvatarOptions = {}): Promise<PlayerAvatar> {
  const url = options.url || DEFAULT_MODEL_URL;
  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');
  const gltf = await loader.loadAsync(url);
  const root = (gltf.scene || (Array.isArray(gltf.scenes) && gltf.scenes[0])) as THREE.Object3D | null;
  if (!root) throw new Error('GLTF did not include a scene graph.');

  // Clone properly for skinned meshes
  const object = (SkeletonUtils.clone(root) as THREE.Object3D) || root.clone(true);
  object.name = 'MainCharacter';
  object.position.set(0, 0, 0);
  object.rotation.set(0, Math.PI, 0);
  object.updateMatrixWorld(true);

  scaleObjectToHeight(object, options.scaleToHeight ?? DEFAULT_HEIGHT);
  enableShadows(object);

  const mixer = new THREE.AnimationMixer(object);
  const clipMap = prepareClipMap(Array.isArray(gltf.animations) ? gltf.animations : []);
  const actions: AnimationActionMap = {};

  (['idle', 'walk', 'run', 'jump'] as PlayerAnimationState[]).forEach((state) => {
    const clip = clipMap[state];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (state === 'jump') {
      const usesFallback = Boolean(clipMap.fallbacks.jump);
      if (!usesFallback) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    action.enabled = true;
    action.weight = 0;
    actions[state] = action;
  });

  let currentState: PlayerAnimationState | null = null;
  let jumpActive = false;
  let queuedBaseState: PlayerAnimationState | null = 'idle';

  const setBaseState = (next: PlayerAnimationState | null) => {
    if (!next || currentState === next) return;
    const nextAction = actions[next];
    if (!nextAction) return;

    if (currentState && currentState !== 'jump') {
      actions[currentState]?.fadeOut(FADE_DURATION);
    }
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.fadeIn(FADE_DURATION);
    nextAction.play();
    currentState = next;
  };

  const resolveDesiredState = (speed: number, running: boolean, flying: boolean): PlayerAnimationState => {
    if (flying) return clipMap.idle ? 'idle' : clipMap.walk ? 'walk' : 'run';
    if (running && clipMap.run && speed >= WALK_SPEED_THRESHOLD) return 'run';
    if (speed >= RUN_SPEED_THRESHOLD && clipMap.run) return 'run';
    if (speed >= WALK_SPEED_THRESHOLD && clipMap.walk) return 'walk';
    return clipMap.idle ? 'idle' : clipMap.walk ? 'walk' : 'run';
  };

  const jumpAction = actions.jump ?? null;
  const finishedListener = (event: THREE.Event & { action: THREE.AnimationAction }) => {
    if (jumpAction && event.action === jumpAction) {
      jumpAction.fadeOut(FADE_DURATION * 0.5);
      jumpAction.stop();
      jumpActive = false;
      if (queuedBaseState) setBaseState(queuedBaseState);
    }
  };
  mixer.addEventListener('finished', finishedListener);

  if (actions.idle) setBaseState('idle');
  else if (actions.walk) setBaseState('walk');
  else if (actions.run) setBaseState('run');

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(`${CONSOLE_TAG} Loaded model`, { url, clips: summarizeClips(clipMap) });
  }

  const update = (deltaSeconds: number, context: PlayerAvatarUpdateContext = {}) => {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    mixer.update(dt);

    const speed = Number.isFinite(context.speed ?? NaN) ? Math.max(0, context.speed ?? 0) : 0;
    const running = Boolean(context.isRunning);
    const flying = Boolean(context.isFlying);
    const jumpRequested = Boolean(context.jumpRequested);

    const desiredBase = resolveDesiredState(speed, running, flying);

    if (jumpRequested && jumpAction && !jumpActive && !flying) {
      jumpActive = true;
      queuedBaseState = desiredBase;
      if (currentState && currentState !== 'jump') {
        actions[currentState]?.fadeOut(FADE_DURATION * 0.75);
      }
      currentState = 'jump';
      jumpAction.reset();
      jumpAction.enabled = true;
      jumpAction.fadeIn(FADE_DURATION * 0.75);
      jumpAction.play();
      return;
    }

    if (jumpActive) {
      queuedBaseState = desiredBase;
      return;
    }

    if (desiredBase !== currentState) {
      setBaseState(desiredBase);
    }
  };

  const dispose = () => {
    mixer.removeEventListener('finished', finishedListener as any);
    mixer.stopAllAction();
  };

  return {
    object,
    mixer,
    clips: clipMap,
    actions,
    update,
    currentState: () => currentState,
    isJumping: () => jumpActive,
    dispose
  };
}

export default loadPlayerAvatar;
