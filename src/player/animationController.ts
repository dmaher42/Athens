import * as THREE from 'three';

export type AnimSet = { idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; run?: THREE.AnimationAction };

const ACTION_NAMES = ['idle', 'walk', 'run'] as const;

type ClipName = (typeof ACTION_NAMES)[number];

export class AnimationController {
  mixer: THREE.AnimationMixer;
  actions: AnimSet;
  autoUpdate = true;
  private currentState: ClipName | null = null;
  private pendingTime = 0;

  constructor(root: THREE.Object3D & { animations?: THREE.AnimationClip[] }) {
    const clips = root.animations ?? [];
    const find = (keys: string[]) => clips.find((clip) => keys.some((key) => (clip.name || '').toLowerCase().includes(key)));
    const idle = find(['idle']);
    const walk = find(['walk']);
    const run = find(['run']);

    this.mixer = new THREE.AnimationMixer(root);
    const prepare = (clip?: THREE.AnimationClip) => {
      if (!clip) return undefined;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      return action;
    };

    this.actions = {
      idle: prepare(idle),
      walk: prepare(walk),
      run: prepare(run)
    };

    this.set('idle');
  }

  get current(): ClipName | null {
    return this.currentState;
  }

  set(name: ClipName) {
    if (this.currentState === name) return;
    const target = this.actions[name];
    if (!target) return;
    ACTION_NAMES.forEach((key) => {
      const action = this.actions[key];
      if (!action) return;
      if (key === name) {
        action.reset();
        action.enabled = true;
        action.setEffectiveWeight(1);
      } else {
        action.setEffectiveWeight(0);
      }
    });
    target.play();
    this.currentState = name;
  }

  cross(from: keyof AnimSet, to: keyof AnimSet, dur = 0.4) {
    const a = this.actions[from];
    const b = this.actions[to];
    if (!a || !b) return;
    b.enabled = true;
    b.setEffectiveWeight(1);
    b.reset();
    a.crossFadeTo(b, dur, true);
    this.currentState = (to as ClipName) ?? this.currentState;
  }

  update(dt: number, options?: { immediate?: boolean }) {
    if (!Number.isFinite(dt) || dt <= 0) {
      if (options?.immediate && this.pendingTime > 0) {
        this.mixer.update(this.pendingTime);
        this.pendingTime = 0;
      }
      return;
    }

    if (options?.immediate) {
      const total = this.pendingTime > 0 ? this.pendingTime : dt;
      if (total > 0) {
        this.mixer.update(total);
      }
      this.pendingTime = 0;
      return;
    }

    if (this.autoUpdate) {
      this.mixer.update(dt);
    } else {
      this.pendingTime += dt;
    }
  }
}

export function scaleObjectToHeight(obj: THREE.Object3D, targetHeight = 1.8) {
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) return;
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 1e-4) return;
  const scale = targetHeight / height;
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);
}
