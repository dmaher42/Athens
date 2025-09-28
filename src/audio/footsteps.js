import * as THREE from 'three';

const DEFAULT_INTERVAL = 0.5;
const MIN_SPEED = 0.2;

function nowSeconds() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() * 0.001;
  }
  return Date.now() * 0.001;
}

export function createFootsteps(audio, clips = {}) {
  if (!audio) {
    return {
      onStep() {},
      setIntervalBySpeed() {
        return Infinity;
      },
      dispose() {}
    };
  }

  const clipMap = {
    stone: clips.stone || 'footstep_stone.mp3',
    dirt: clips.dirt || 'footstep_dirt.mp3'
  };

  const buffers = new Map();
  const loading = new Map();
  let disposed = false;
  let currentInterval = DEFAULT_INTERVAL;
  let lastStepTime = nowSeconds();

  const listener = typeof audio.getListener === 'function' ? audio.getListener() : null;

  const ensureClip = async (surface) => {
    const key = surface === 'stone' ? 'stone' : 'dirt';
    if (buffers.has(key)) {
      return buffers.get(key);
    }
    if (loading.has(key)) {
      return loading.get(key);
    }

    const rel = clipMap[key];
    const promise = (async () => {
      const audioName = `footstep:${key}`;
      const base = await audio.load(audioName, rel);
      if (base && base.buffer) {
        buffers.set(key, base.buffer);
        return base.buffer;
      }
      return null;
    })();

    loading.set(key, promise);
    const buffer = await promise;
    loading.delete(key);
    return buffer;
  };

  const playBuffer = (buffer) => {
    if (!buffer || !listener || disposed) {
      return;
    }

    const oneShot = new THREE.Audio(listener);
    oneShot.setBuffer(buffer);

    const baseVolume = 0.75;
    const randomVolume = baseVolume * (0.85 + Math.random() * 0.3);
    const master = typeof audio.getMasterVolume === 'function' ? audio.getMasterVolume() : 1;
    oneShot.setVolume(master * randomVolume);

    const playbackRate = 0.92 + Math.random() * 0.18;
    if (typeof oneShot.setPlaybackRate === 'function') {
      try {
        oneShot.setPlaybackRate(playbackRate);
      } catch (_) {
        // noop
      }
    }

    if (audio.isContextSuspended && audio.isContextSuspended()) {
      return;
    }

    try {
      oneShot.play();
    } catch (_) {
      return;
    }

    const source = oneShot.source;
    if (source && typeof source.addEventListener === 'function') {
      source.addEventListener('ended', () => {
        oneShot.disconnect();
      });
    }
  };

  const onStep = async (surface = 'dirt') => {
    if (disposed || currentInterval === Infinity) {
      return;
    }
    const now = nowSeconds();
    if (now - lastStepTime < currentInterval - 1e-3) {
      return;
    }
    lastStepTime = now;

    const buffer = await ensureClip(surface === 'stone' ? 'stone' : 'dirt');
    playBuffer(buffer);
  };

  const setIntervalBySpeed = (speedMps) => {
    const speed = Number.isFinite(speedMps) ? Math.max(0, speedMps) : 0;
    if (speed < MIN_SPEED) {
      currentInterval = Infinity;
      return currentInterval;
    }
    if (speed < 1.5) {
      currentInterval = 0.6;
    } else if (speed < 4) {
      currentInterval = DEFAULT_INTERVAL;
    } else {
      currentInterval = 0.33;
    }
    return currentInterval;
  };

  const dispose = () => {
    disposed = true;
    buffers.clear();
    loading.clear();
  };

  return { onStep, setIntervalBySpeed, dispose };
}

export default createFootsteps;
