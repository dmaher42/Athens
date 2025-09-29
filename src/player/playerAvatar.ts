import * as THREE from 'three';
import { logOnce } from '../utils/logOnce.js';

export type PlayerAnimationName = 'idle' | 'walk' | 'run' | 'jump';

export type PlayerAnimationClips = Partial<Record<PlayerAnimationName, THREE.AnimationClip | null | undefined>>;

export type PlayerAnimationFallbacks = Partial<Record<PlayerAnimationName, PlayerAnimationName>>;

type ActionRecord = Partial<Record<PlayerAnimationName, THREE.AnimationAction>>;

export type ConfigurePlayerAvatarOptions = {
  mixer: THREE.AnimationMixer | null | undefined;
  clips?: PlayerAnimationClips | null | undefined;
  fallbacks?: PlayerAnimationFallbacks | null | undefined;
  logLabel?: string;
};

export type PlayerAvatarSetupResult = {
  actions: ActionRecord;
  dispose(): void;
};

type ClipResolution = {
  clip: THREE.AnimationClip | null;
  ownClip: boolean;
  fallbackSource?: PlayerAnimationName;
};

const PLAYER_AVATAR_LOG_KEY = '[playerAvatar]';

function cloneClipForJump(baseClip: THREE.AnimationClip, fallbackSource: PlayerAnimationName): THREE.AnimationClip {
  const clone = baseClip.clone();
  const suffix = THREE.MathUtils.generateUUID();
  const baseName = baseClip.name && baseClip.name.trim().length > 0 ? baseClip.name : fallbackSource;
  clone.name = `${baseName}::jumpFallback::${suffix}`;
  return clone;
}

function resolveClip(
  name: PlayerAnimationName,
  clips: PlayerAnimationClips,
  fallbacks: PlayerAnimationFallbacks | null | undefined
): ClipResolution {
  const directClip = clips?.[name] ?? null;
  if (directClip) {
    return { clip: directClip, ownClip: true };
  }

  const fallbackName = fallbacks?.[name];
  if (!fallbackName) {
    return { clip: null, ownClip: false };
  }

  const fallbackClip = clips?.[fallbackName] ?? null;
  if (!fallbackClip) {
    return { clip: null, ownClip: false };
  }

  if (name === 'jump') {
    const cloned = cloneClipForJump(fallbackClip, fallbackName);
    return { clip: cloned, ownClip: false, fallbackSource: fallbackName };
  }

  return { clip: fallbackClip, ownClip: false, fallbackSource: fallbackName };
}

export function configurePlayerAvatarActions(options: ConfigurePlayerAvatarOptions): PlayerAvatarSetupResult {
  const mixer = options.mixer ?? null;
  if (!mixer) {
    return { actions: {}, dispose() {} };
  }

  const clips: PlayerAnimationClips = options.clips ?? {};
  const fallbacks: PlayerAnimationFallbacks = options.fallbacks ?? {};
  const logLabel = options.logLabel || PLAYER_AVATAR_LOG_KEY;

  const actions: ActionRecord = {};
  const disposableClips: THREE.AnimationClip[] = [];

  const animationNames: PlayerAnimationName[] = ['idle', 'walk', 'run', 'jump'];

  for (const name of animationNames) {
    const { clip, ownClip, fallbackSource } = resolveClip(name, clips, fallbacks);
    if (!clip) {
      continue;
    }

    if (!ownClip && fallbackSource) {
      const key = `player_avatar_fallback_${name}_${fallbackSource}`;
      logOnce(key, `${logLabel} Missing "${name}" animation; using "${fallbackSource}" as fallback.`);
    }

    if (!ownClip && name === 'jump') {
      disposableClips.push(clip);
    }

    const action = mixer.clipAction(clip);
    action.enabled = true;
    if (name === 'jump') {
      if (ownClip) {
        action.setLoop(THREE.LoopOnce, 0);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }
    }

    actions[name] = action;
  }

  const dispose = () => {
    for (const clip of disposableClips) {
      try {
        mixer.uncacheClip?.(clip);
      } catch {
        // ignore cleanup errors
      }
    }
    disposableClips.length = 0;
  };

  return { actions, dispose };
}

export default configurePlayerAvatarActions;
