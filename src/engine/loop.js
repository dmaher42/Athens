import { logOnce } from '../utils/logOnce.js';

const MIN_DT = 1 / 300;
const MAX_DT = 0.25;

let activeLoop = null;

export function createGameLoop(update, render) {
  if (typeof update !== 'function') {
    throw new Error('createGameLoop requires an update function');
  }
  if (typeof render !== 'function') {
    throw new Error('createGameLoop requires a render function');
  }

  let frameId = null;
  let started = false;
  let paused = false;
  let disposed = false;
  let lastTimestamp = null;

  const step = (timestamp) => {
    if (disposed || paused) {
      return;
    }

    if (lastTimestamp == null) {
      lastTimestamp = timestamp;
      frameId = requestAnimationFrame(step);
      return;
    }

    let dt = (timestamp - lastTimestamp) / 1000;
    const originalDt = Number.isFinite(dt) ? dt : MIN_DT;
    lastTimestamp = timestamp;

    if (!Number.isFinite(dt)) {
      dt = MIN_DT;
    }

    let skippedLargeDt = false;
    if (dt <= 0) {
      dt = MIN_DT;
    } else if (dt > MAX_DT) {
      dt = MAX_DT;
      skippedLargeDt = true;
    }

    if (originalDt > 0.3) {
      logOnce('dt_huge', `[loop] clamped large dt ${originalDt.toFixed(3)}s`);
    }

    try {
      update(dt, { skippedLargeDt });
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[loop] update step failed', error);
      }
    }

    try {
      render();
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('[loop] render step failed', error);
      }
    }

    frameId = requestAnimationFrame(step);
  };

  const pause = () => {
    if (paused) return;
    paused = true;
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastTimestamp = null;
  };

  const resume = () => {
    if (!started || disposed || !paused) {
      return;
    }
    paused = false;
    frameId = requestAnimationFrame(step);
  };

  const handleVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      pause();
    } else {
      lastTimestamp = null;
      resume();
    }
  };

  const addVisibilityListener = () => {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', handleVisibility);
  };

  const removeVisibilityListener = () => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', handleVisibility);
  };

  const start = () => {
    if (disposed || started) {
      return;
    }
    if (activeLoop && activeLoop !== api && activeLoop.isRunning()) {
      logOnce('loop_multiple', '[loop] A game loop is already running; ignoring start request.');
      return;
    }

    activeLoop = api;
    started = true;
    paused = Boolean(typeof document !== 'undefined' && document.hidden);
    lastTimestamp = null;
    addVisibilityListener();

    if (!paused) {
      frameId = requestAnimationFrame(step);
    }
  };

  const stop = () => {
    if (!started) return;
    pause();
    removeVisibilityListener();
    started = false;
    if (activeLoop === api) {
      activeLoop = null;
    }
  };

  const dispose = () => {
    if (disposed) return;
    stop();
    disposed = true;
  };

  const api = {
    start,
    stop,
    dispose,
    pause,
    resume,
    isRunning() {
      return started && !paused && !disposed;
    }
  };

  return api;
}

export default createGameLoop;
