import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

type PlayerAnimationState = 'idle' | 'walk' | 'run' | 'jump';

type AnimationClipMap = Partial<Record<PlayerAnimationState, THREE.AnimationClip>> & {
  fallbacks: Partial<Record<PlayerAnimationState, string>>;
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

const consoleTag = '[player/avatar]';

function findClip(preferredNames: string[], clips: THREE.AnimationClip[]): THREE.AnimationClip | undefined {
  const lowerCaseMap = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    lowerCaseMap.set(clip.name.toLowerCase(), clip);
  }
  for (const candidate of preferredNames) {
    const found = lowerCaseMap.get(candidate.toLowerCase());
    if (found) {
      return found;
    }
  }
  return undefined;
}

function prepareClipMap(clips: THREE.AnimationClip[]): AnimationClipMap {
  const resolved: Partial<Record<PlayerAnimationState, THREE.AnimationClip>> = {};
  const fallbacks: Partial<Record<PlayerAnimationState, string>> = {};

  const clipEntries: [PlayerAnimationState, string[]][] = [
    ['idle', CLIP_NAME_PREFERENCES.idle],
    ['walk', CLIP_NAME_PREFERENCES.walk],
    ['run', CLIP_NAME_PREFERENCES.run],
    ['jump', CLIP_NAME_PREFERENCES.jump]
  ];

  for (const [state, names] of clipEntries) {
    const resolvedClip = findClip(names, clips);
    if (resolvedClip) {
      resolved[state] = resolvedClip;
    }
  }

  const ensureFallback = (state: PlayerAnimationState, fallbackOrder: PlayerAnimationState[]) => {
    if (!resolved[state]) {
      for (const fallbackState of fallbackOrder) {
        if (resolved[fallbackState]) {
          resolved[state] = resolved[fallbackState];
          fallbacks[state] = fallbackState;
          break;
        }
      }
    }
  };

  ensureFallback('idle', ['walk', 'run']);
  ensureFallback('walk', ['idle', 'run']);
  ensureFallback('run', ['walk', 'idle']);
  ensureFallback('jump', ['run', 'walk', 'idle']);

  return {
    ...resolved,
    fallbacks
  };
}

function scaleObjectToHeight(object: THREE.Object3D, targetHeight: number) {
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return;
  }
  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) {
    const height = box.max.y - box.min.y;
    if (Number.isFinite(height) && height > 1e-3) {
      const scale = targetHeight / height;
      object.scale.setScalar(scale);
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
  const summary: string[] = [];
  (['idle', 'walk', 'run', 'jump'] as PlayerAnimationState[]).forEach((key) => {
    const clip = map[key];
    if (clip) {
      const fallback = map.fallbacks[key];
      summary.push(`${key}:${clip.name}${fallback ? ` (fallback:${fallback})` : ''}`);
    } else {
      summary.push(`${key}:none`);
    }
  });
  return summary.join(', ');
}

export async function loadPlayerAvatar(options: LoadPlayerAvatarOptions = {}): Promise<PlayerAvatar> {
  const url = options.url || DEFAULT_MODEL_URL;
  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');
  const gltf = await loader.loadAsync(url);
  const root = (gltf.scene || (Array.isArray(gltf.scenes) && gltf.scenes[0])) as THREE.Object3D | null;

  if (!root) {
    throw new Error('GLTF did not include a scene graph.');
  }

  const object = (SkeletonUtils.clone(root) as THREE.Object3D) || root.clone(true);
  object.name = 'MainCharacter';
  object.position.set(0, 0, 0);
  object.rotation.set(0, Math.PI, 0);
  object.updateMatrixWorld(true);

  scaleObjectToHeight(object, options.scaleToHeight ?? DEFAULT_HEIGHT);
  enableShadows(object);

  const mixer = new THREE.AnimationMixer(object);
  const clipMap = prepareClipMap(Array.isArray(gltf.animations) ? gltf.animations : []);

  if (clipMap.jump && clipMap.fallbacks.jump) {
    const baseName = clipMap.jump.name || 'clip';
    const cloned = clipMap.jump.clone();
    cloned.name = `${baseName}__jumpFallback`;
    clipMap.jump = cloned;
  }
  const actions: AnimationActionMap = {};

  for (const state of ['idle', 'walk', 'run', 'jump'] as PlayerAnimationState[]) {
    const clip = clipMap[state];
    if (clip) {
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
        action.enabled = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.enabled = true;
      }
      action.weight = 0;
      actions[state] = action;
    }
  }

  let currentState: PlayerAnimationState | null = null;
  let jumpActive = false;
  let queuedBaseState: PlayerAnimationState | null = 'idle';

  const setBaseState = (next: PlayerAnimationState | null) => {
    if (!next || currentState === next) {
      return;
    }
    const nextAction = actions[next];
    if (!nextAction) {
      return;
    }

    if (currentState && currentState !== 'jump') {
      const currentAction = actions[currentState];
      currentAction?.fadeOut(FADE_DURATION);
    }

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.fadeIn(FADE_DURATION);
    nextAction.play();
    currentState = next;
  };

  const resolveDesiredState = (speed: number, running: boolean, flying: boolean): PlayerAnimationState => {
    if (flying) {
      return clipMap.idle ? 'idle' : clipMap.walk ? 'walk' : 'run';
    }
    if (running && clipMap.run && speed >= WALK_SPEED_THRESHOLD) {
      return 'run';
    }
    if (speed >= RUN_SPEED_THRESHOLD && clipMap.run) {
      return 'run';
    }
    if (speed >= WALK_SPEED_THRESHOLD && clipMap.walk) {
      return 'walk';
    }
    return clipMap.idle ? 'idle' : clipMap.walk ? 'walk' : 'run';
  };

  const jumpAction = actions.jump ?? null;
  const finishedListener = (event: THREE.Event & { action: THREE.AnimationAction }) => {
    if (jumpAction && event.action === jumpAction) {
      jumpAction.fadeOut(FADE_DURATION * 0.5);
      jumpAction.stop();
      jumpActive = false;
      if (queuedBaseState) {
        setBaseState(queuedBaseState);
      }
    }
  };
  mixer.addEventListener('finished', finishedListener);

  if (actions.idle) {
    setBaseState('idle');
  } else if (actions.walk) {
    setBaseState('walk');
  } else if (actions.run) {
    setBaseState('run');
  }

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(`${consoleTag} Loaded model`, {
      url,
      clips: summarizeClips(clipMap)
    });
    if (Object.keys(clipMap.fallbacks).length > 0 && typeof console.debug === 'function') {
      console.debug(`${consoleTag} Applied animation fallbacks`, clipMap.fallbacks);
    }
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
