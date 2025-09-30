// @ts-nocheck

import * as THREE from 'three';
import boot, { whenBootReady } from '../core/bootstrap.js';
import { startGameLoop, setLoopWatchdog } from '../engine/loop.js';
import { createSafeScene } from '../engine/safeEntry.js';
import { attachWatchdog } from '../ui/watchdog.js';
import { maybeRemoteInit } from '../services/remote.js';
import { runApp } from './runApp.ts';

export function createAthensApp() {
  /** @type {ReturnType<typeof runApp> | null} */
  let initializedContext = null;
  /** @type {Promise<ReturnType<typeof runApp>> | null} */
  let initializationTask = null;
  /** @type {Promise<unknown> | null} */
  let bootPromise = null;
  let bootLogEmitted = false;

  const watchdog = attachWatchdog();
  setLoopWatchdog(watchdog);

  let fallbackActive = false;
  let fallbackLoop = null;
  let fallbackScene = null;
  /** @type {HTMLElement | null} */
  let fallbackRoot = null;
  /** @type {Promise<void> | null} */
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
        console.warn('[Athens] Failed to initialize fallback scene.', error);
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
        console.warn('[Athens] Fallback initialization failed.', error);
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

  const waitForDomReady = async () => {
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
  };

  const ensureBootStarted = () => {
    if (typeof boot !== 'function') {
      return null;
    }

    let started = false;

    if (!bootPromise) {
      started = true;
      if (!bootLogEmitted) {
        console.log('[Athens] boot starting');
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
  };

  const resolveContainer = (options = {}) => {
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
  };

  const run = async (options = {}) => {
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

      const context = await runApp({ ...options, container });
      context.renderer?.setClearColor?.(0x202834, 1);
      if (context.scene) {
        try {
          context.scene.background = new THREE.Color(0x202834);
        } catch (error) {
          console.warn('[Athens] Unable to set scene background color.', error);
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
  };

  const getContext = async () => {
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

  return {
    run,
    getContext,
    ensureFallback,
    teardownFallback,
    watchdog
  };
}
