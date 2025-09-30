import * as THREE from 'three';
import boot, { whenBootReady } from '../core/bootstrap.js';
import { startGameLoop, setLoopWatchdog } from '../engine/loop.js';
import { createSafeScene } from '../engine/safeEntry.js';
import { attachWatchdog } from '../ui/watchdog.js';
import { maybeRemoteInit } from '../services/remote.js';
import { runApp, type RunAppOptions, type AthensContext } from './runApp.ts';

type SafeScene = Awaited<ReturnType<typeof createSafeScene>>;
type GameLoopHandle = ReturnType<typeof startGameLoop> | null;

export interface AthensApp {
  run: (options?: RunAppOptions) => Promise<AthensContext>;
  getContext: () => Promise<AthensContext | undefined>;
  ensureFallback: () => Promise<void> | null;
  teardownFallback: () => void;
  watchdog: ReturnType<typeof attachWatchdog>;
}

export function createAthensApp(): AthensApp {
  let initializedContext: AthensContext | null = null;
  let initializationTask: Promise<AthensContext> | null = null;
  let bootPromise: Promise<unknown> | null = null;
  let bootLogEmitted = false;

  const watchdog = attachWatchdog();
  setLoopWatchdog(watchdog);

  let fallbackActive = false;
  let fallbackLoop: GameLoopHandle = null;
  let fallbackScene: SafeScene | null = null;
  let fallbackRoot: HTMLElement | null = null;
  let fallbackInitTask: Promise<void> | null = null;

  const ensureFallback = (): Promise<void> | null => {
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

      const canvas = fallbackScene.renderer?.domElement ?? null;
      if (canvas) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        fallbackRoot.appendChild(canvas);
      }

      fallbackLoop = startGameLoop({
        update: (dt: number) => {
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

  const teardownFallback = (): void => {
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

  const waitForDomReady = async (): Promise<void> => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      return;
    }
    await new Promise<void>((resolve) => {
      const handleReady = () => {
        document.removeEventListener('DOMContentLoaded', handleReady);
        resolve();
      };
      document.addEventListener('DOMContentLoaded', handleReady, { once: true });
    });
  };

  const ensureBootStarted = () => {
    if (typeof boot !== 'function') {
      return null as const;
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

    return { promise: bootPromise, started } as const;
  };

  const resolveContainer = (options: RunAppOptions = {}): HTMLElement => {
    if (typeof document === 'undefined') {
      throw new Error('Missing document for Athens renderer.');
    }
    const containerOption = options.container;
    if (containerOption instanceof HTMLElement) {
      return containerOption;
    }
    if (typeof containerOption === 'string') {
      const fromSelector = document.querySelector<HTMLElement>(containerOption);
      if (fromSelector) {
        return fromSelector;
      }
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

  const run = async (options: RunAppOptions = {}): Promise<AthensContext> => {
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
      watchdog?.error?.((error as Error)?.message || 'boot failed');
      throw error;
    } finally {
      initializationTask = null;
    }
  };

  const getContext = async (): Promise<AthensContext | undefined> => {
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
