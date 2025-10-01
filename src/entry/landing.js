import './block-remote-guard.js';
import * as THREE from 'three';
import { registerSW } from '../registerServiceWorker.ts';
import { initializeAthens } from './initializeAthens.js';
import boot, { whenBootReady } from '../core/bootstrap.js';
import { startGameLoop, setLoopWatchdog } from '../engine/loop.js';
import { createSafeScene } from '../engine/safeEntry.js';
import { attachWatchdog } from '../ui/watchdog.js';
import { maybeRemoteInit } from '../services/remote.js';
import { logger } from '../utils/logger.ts';

/**
 * @typedef {ReturnType<typeof initializeAthens> extends Promise<infer T> ? T : never} AthensContext
 */

let initializationTask = null;
let initializedContext = null;
let bootPromise = null;
let bootLogEmitted = false;

const watchdog = attachWatchdog();
registerSW();
setLoopWatchdog(watchdog);

let fallbackActive = false;
let fallbackLoop = null;
let fallbackScene = null;
let fallbackRoot = null;
let fallbackInitTask = null;

const ensureFallback = () => {
  if (fallbackActive || fallbackInitTask || typeof document === 'undefined') {
    return fallbackInitTask;
  }
  if (!document.body) {
    const handleReady = () => {
      document.removeEventListener('DOMContentLoaded', handleReady);
      ensureFallback();
    };
    document.addEventListener('DOMContentLoaded', handleReady, { once: true });
    return null;
  }

  fallbackInitTask = (async () => {
    fallbackActive = true;
    fallbackRoot = document.createElement('div');
    fallbackRoot.id = 'athens-fallback-root';
    fallbackRoot.style.cssText =
      'position:fixed;inset:0;z-index:9998;pointer-events:none;display:flex;align-items:center;justify-content:center;background:#202834;';
    document.body.appendChild(fallbackRoot);

    try {
      fallbackScene = await createSafeScene();
    } catch (error) {
      logger.warn('[Athens] Failed to initialize fallback scene.', error);
      fallbackActive = false;
      if (fallbackRoot?.parentNode) {
        fallbackRoot.parentNode.removeChild(fallbackRoot);
      }
      fallbackRoot = null;
      return;
    }

    const canvas = fallbackScene.renderer?.domElement;
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      fallbackRoot.appendChild(canvas);
    }

    fallbackLoop = startGameLoop({
      update: (dt) => {
        fallbackScene?.update?.(dt);
      },
      render: () => {
        fallbackScene?.render?.();
      }
    });
  })()
    .catch((error) => {
      logger.warn('[Athens] Fallback initialization failed.', error);
    })
    .finally(() => {
      fallbackInitTask = null;
    });

  return fallbackInitTask;
};

const teardownFallback = () => {
  if (fallbackInitTask) {
    fallbackInitTask
      .catch(() => {})
      .finally(() => {
        teardownFallback();
      });
    return;
  }
  if (!fallbackActive) {
    return;
  }
  fallbackActive = false;
  fallbackLoop?.stop?.();
  fallbackLoop = null;
  fallbackScene?.dispose?.();
  fallbackScene = null;
  if (fallbackRoot?.parentNode) {
    fallbackRoot.parentNode.removeChild(fallbackRoot);
  }
  fallbackRoot = null;
};

const initialFallbackTask = ensureFallback();
if (initialFallbackTask) {
  initialFallbackTask.catch(() => {});
}

async function waitForDomReady() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    return;
  }
  await new Promise((resolve) => {
    const handleReady = () => {
      document.removeEventListener('DOMContentLoaded', handleReady);
      resolve();
    };
    document.addEventListener('DOMContentLoaded', handleReady, { once: true });
  });
}

function ensureBootStarted() {
  if (typeof boot !== 'function') {
    return null;
  }

  let started = false;

  if (!bootPromise) {
    started = true;
    if (!bootLogEmitted) {
      logger.info('[Athens] boot starting');
      bootLogEmitted = true;
    }
    bootPromise = Promise.resolve()
      .then(() => boot())
      .catch((error) => {
        console.error('[Athens] Boot invocation failed.', error);
        throw error instanceof Error ? error : new Error(String(error));
      });
  }

  return { promise: bootPromise, started };
}

function resolveContainer(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Missing document for Athens renderer.');
  }
  if (options.container instanceof HTMLElement) {
    return options.container;
  }
  if (typeof options.containerId === 'string') {
    const byId = document.getElementById(options.containerId);
    if (byId) {
      return byId;
    }
  }
  const fallback = document.getElementById('app');
  if (!fallback) {
    throw new Error('Missing #app container for Athens renderer.');
  }
  return fallback;
}

async function runAthens(options = {}) {
  if (initializedContext) {
    return initializedContext;
  }
  if (initializationTask) {
    return initializationTask;
  }

  initializationTask = (async () => {
    const bootState = ensureBootStarted();
    const bootTask = bootState?.promise ?? null;
    const bootStartedHere = bootState?.started ?? false;

    if (bootTask && !bootStartedHere) {
      await bootTask;
      await whenBootReady();
    } else if (bootTask) {
      whenBootReady().catch(() => {});
    }

    await waitForDomReady();

    const container = resolveContainer(options);
    container.style.position = container.style.position || 'relative';
    container.style.backgroundColor = container.style.backgroundColor || '#202834';

    let bootTimer = null;
    const bootTimeoutMarker = Symbol('athens.boot-timeout');
    const bootTimeout = new Promise((resolve) => {
      bootTimer = setTimeout(() => resolve(bootTimeoutMarker), 8000);
    });

    const initializationTask = initializeAthens({ ...options, container });
    let context;
    try {
      const firstResult = await Promise.race([initializationTask, bootTimeout]).catch((error) => {
        watchdog?.error?.(error?.message || 'boot failed');
        console.error('[Athens] Boot failed:', error);
        throw error;
      });

      if (firstResult === bootTimeoutMarker) {
        watchdog?.warn?.('boot timeout');
        logger.warn('[Athens] Boot is taking longer than expected. Waiting for initialization to complete.');
        context = await initializationTask.catch((error) => {
          watchdog?.error?.(error?.message || 'boot failed');
          console.error('[Athens] Boot failed:', error);
          throw error;
        });
      } else {
        context = firstResult;
      }
    } finally {
      if (bootTimer) {
        clearTimeout(bootTimer);
      }
    }
    context.renderer?.setClearColor?.(0x202834, 1);
    if (context.scene) {
      try {
        context.scene.background = new THREE.Color(0x202834);
      } catch (error) {
        logger.warn('[Athens] Unable to set scene background color.', error);
      }
    }

    teardownFallback();
    maybeRemoteInit(context);
    initializedContext = context;
    return context;
  })();

  try {
    return await initializationTask;
  } catch (error) {
    watchdog?.error?.(error?.message || 'boot failed');
    throw error;
  } finally {
    initializationTask = null;
  }
}

const globalWindow = /** @type {Window & { runAthens?: typeof runAthens; getAthensContext?: () => Promise<AthensContext | undefined>; }} */ (window);

globalWindow.runAthens = runAthens;
globalWindow.getAthensContext = async () => {
  if (initializedContext) {
    return initializedContext;
  }
  if (initializationTask) {
    try {
      return await initializationTask;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

window.dispatchEvent(
  new CustomEvent('athens:initializer-ready', {
    detail: { initializer: runAthens, source: 'landing.js' }
  })
);
logger.info('[Athens] initializer ready');

try {
  await runAthens();
} catch (error) {
  console.error('[Athens] Failed to initialize.', error);
}
