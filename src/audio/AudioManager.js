import * as THREE from 'three';

export function assetUrl(rel) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string')
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedRel = String(rel || '').replace(/^\/+/, '');
  return `${normalizedBase}${normalizedRel}`;
}

export class AudioManager {
  constructor(camera, { masterVolume = 0.9 } = {}) {
    this._camera = camera || null;
    this._listener = new THREE.AudioListener();
    if (this._camera?.add) {
      this._camera.add(this._listener);
    }

    this._audioLoader = new THREE.AudioLoader();
    this._masterVolume = typeof masterVolume === 'number' ? THREE.MathUtils.clamp(masterVolume, 0, 1) : 0.9;
    this._audios = new Map();
    this._sources = new Map();
    this._loading = new Map();
    this._missing = new Set();
  }

  getListener() {
    return this._listener;
  }

  getMasterVolume() {
    return this._masterVolume;
  }

  isContextSuspended() {
    return this._isContextSuspended();
  }

  _isContextSuspended() {
    const ctx = this._listener?.context || this._listener?.getContext?.();
    return ctx ? ctx.state === 'suspended' : false;
  }

  async load(name, relUrl) {
    const key = String(name);
    if (this._audios.has(key)) {
      return this._audios.get(key);
    }
    if (this._loading.has(key)) {
      return this._loading.get(key);
    }

    const relativePath = typeof relUrl === 'string' ? relUrl : '';
    const url = assetUrl(`assets/audio/${relativePath}`);
    this._sources.set(key, relativePath);

    const audio = new THREE.Audio(this._listener);
    audio.userData = audio.userData || {};
    audio.userData.baseVolume = typeof audio.userData.baseVolume === 'number' ? audio.userData.baseVolume : 1;

    const loadPromise = new Promise((resolve) => {
      this._audioLoader.load(
        url,
        (buffer) => {
          audio.setBuffer(buffer);
          this._audios.set(key, audio);
          this._loading.delete(key);
          resolve(audio);
        },
        undefined,
        () => {
          this._loading.delete(key);
          if (!this._missing.has(relativePath)) {
            console.warn(`[audio] missing ${relativePath}, skipping`);
            this._missing.add(relativePath);
          }
          resolve(null);
        }
      );
    });

    this._loading.set(key, loadPromise);
    return loadPromise;
  }

  createPositional({ distance = 25 } = {}) {
    const positional = new THREE.PositionalAudio(this._listener);
    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 25;
    positional.setRefDistance(safeDistance);
    positional.setRolloffFactor(0.8);
    positional.setDistanceModel('linear');
    positional.userData = positional.userData || {};
    positional.userData.baseVolume = typeof positional.userData.baseVolume === 'number' ? positional.userData.baseVolume : 1;
    return positional;
  }

  setMasterVolume(value) {
    const volume = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : this._masterVolume;
    this._masterVolume = volume;
    for (const audio of this._audios.values()) {
      if (!audio) continue;
      const baseVolume = typeof audio.userData?.baseVolume === 'number' ? audio.userData.baseVolume : 1;
      audio.setVolume(baseVolume * this._masterVolume);
    }
  }

  async playLoop(name, options = {}) {
    const key = String(name);
    const baseVolume = Number.isFinite(options.volume) ? THREE.MathUtils.clamp(options.volume, 0, 1) : 1;
    const startVolume = Number.isFinite(options.startVolume) ? THREE.MathUtils.clamp(options.startVolume, 0, 1) : baseVolume;

    let audio = this._audios.get(key);
    const sourceRel = this._sources.get(key);
    if (!audio && sourceRel) {
      audio = await this.load(key, sourceRel);
    }
    if (!audio) {
      return null;
    }

    audio.userData = audio.userData || {};
    audio.userData.baseVolume = baseVolume;
    audio.setLoop(true);

    const effectiveStart = this._masterVolume * startVolume;
    const effectiveTarget = this._masterVolume * baseVolume;

    if (Number.isFinite(effectiveStart)) {
      audio.setVolume(effectiveStart);
    }

    if (!audio.isPlaying) {
      try {
        audio.play();
      } catch (_) {
        // ignored
      }
    }

    if (Number.isFinite(effectiveTarget) && Math.abs(effectiveTarget - effectiveStart) < 1e-4) {
      audio.setVolume(effectiveTarget);
    }

    return audio;
  }

  stop(name) {
    const audio = this._audios.get(String(name));
    if (audio?.isPlaying) {
      try {
        audio.stop();
      } catch (_) {
        // noop
      }
    }
  }

  stopAll() {
    for (const audio of this._audios.values()) {
      if (!audio) continue;
      if (audio.isPlaying) {
        try {
          audio.stop();
        } catch (_) {
          // noop
        }
      }
    }
  }
}
