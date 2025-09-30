import * as THREE from 'three';

export type AnimSet = { idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; run?: THREE.AnimationAction; };

export class AnimationController {
  mixer: THREE.AnimationMixer;
  actions: AnimSet;

  constructor(root: THREE.Object3D & { animations?: THREE.AnimationClip[] }) {
    const clips = root.animations ?? [];
    const find = (keys: string[]) => clips.find(c => keys.some(k => (c.name||'').toLowerCase().includes(k)));
    const idle = find(['idle']);
    const walk = find(['walk']);
    const run  = find(['run']);

    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {
      idle: idle ? this.mixer.clipAction(idle) : undefined,
      walk: walk ? this.mixer.clipAction(walk) : undefined,
      run:  run  ? this.mixer.clipAction(run)  : undefined,
    };
    Object.values(this.actions).forEach(a => a && a.play());
    this.set('idle');
  }

  set(name: 'idle'|'walk'|'run') {
    (['idle','walk','run'] as const).forEach(k => {
      if (this.actions[k]) this.actions[k]!.setEffectiveWeight(k===name ? 1 : 0);
    });
    if (this.actions[name]) this.actions[name]!.time = 0;
  }

  cross(from: keyof AnimSet, to: keyof AnimSet, dur: number = 0.4) {
    const a = this.actions[from], b = this.actions[to];
    if (!a || !b) return;
    b.enabled = true; b.setEffectiveWeight(1); b.time = 0;
    a.crossFadeTo(b, dur, true);
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
