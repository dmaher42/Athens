import * as THREE from 'three';

const MIN_DT = 1 / 300;
const MAX_DT = 0.25;

let loopWatchdog = null;

export function setLoopWatchdog(handler) {
  loopWatchdog = handler || null;
}

export function startGameLoop({ update, render, onResume } = {}) {
  const clock = new THREE.Clock();
  let running = true;
  let frameId = null;

  const visibilityHandler = () => {
    if (typeof document === 'undefined' || document.hidden) return;
    // Reset clock so we don't get a huge dt after tab becomes visible
    clock.getDelta();
    if (typeof onResume === 'function') {
      try {
        onResume();
      } catch (error) {
        console.error('[loop] onResume error:', error);
      }
    }
  };

  const step = () => {
    if (!running) return;

    // Schedule next frame first (avoids missing frames if update throws)
    frameId = requestAnimationFrame(step);

    // Compute dt with clamping
    let dt = clock.getDelta();
    if (!Number.isFinite(dt) || dt <= 0) {
      dt = MIN_DT;
    }

    let skippedLargeDt = false;
    if (dt > MAX_DT) {
      dt = MAX_DT;
      skippedLargeDt = true;
    }

    // Update
    if (typeof update === 'function') {
      try {
        update(dt, { skippedLargeDt });
      } catch (error) {
        console.error('[loop] update error:', error);
        loopWatchdog?.error?.('update failure');
      }
    }

    // Render
    if (typeof render === 'function') {
      try {
        render();
      } catch (error) {
        console.error('[loop] render error:', error);
        loopWatchdog?.error?.('render failure');
      }
    }

    loopWatchdog?.tick?.();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', visibilityHandler, { passive: true });
  }

  frameId = requestAnimationFrame(step);

  return {
    stop() {
      if (!running) return;
      running = false;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    },
    resetClock() {
      // Flush the clock to avoid large next dt
      clock.getDelta();
    },
    isRunning() {
      return running;
    }
  };
}

export function createGameLoop(update, render) {
  if (typeof update !== 'function') {
    throw new Error('createGameLoop requires an update function');
  }
  if (typeof render !== 'function') {
    throw new Error('createGameLoop requires a render function');
  }

  let runner = null;
  let paused = false;
  let disposed = false;

  const handleUpdate = (dt, meta) => {
    if (paused || disposed) return;
    try {
      update(dt, meta || {});
    } catch (error) {
      console.error('[loop] update error:', error);
      loopWatchdog?.error?.('update failure');
    }
  };

  const handleRender = () => {
    if (paused || disposed) return;
    try {
      render();
    } catch (error) {
      console.error('[loop] render error:', error);
      loopWatchdog?.error?.('render failure');
    }
  };

  const handleResume = () => {
    if (disposed) return;
    runner?.resetClock?.();
  };

  const ensureRunner = () => {
    if (runner || disposed) return;
    runner = startGameLoop({ update: handleUpdate, render: handleRender, onResume: handleResume });
  };

  const api = {
    start() {
      if (disposed) return;
      paused = false;
      ensureRunner();
    },
    stop() {
      if (runner) {
        runner.stop();
        runner = null;
      }
    },
    pause() {
      paused = true;
    },
    resume() {
      if (disposed) return;
      paused = false;
      if (runner) {
        runner.resetClock?.();
      } else {
        ensureRunner();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      api.stop();
    },
    isRunning() {
      return !disposed && !paused && Boolean(runner?.isRunning?.());
    }
  };

  return api;
}

export default createGameLoop;
