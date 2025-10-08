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
import { startAmbience } from '../audio/startAmbience.ts';

(function () {
  const S = (window.__athensBoot ||= { phase: 'html', t0: performance.now(), log: [] });
  function set(p) {
    S.phase = p;
    S.log.push([performance.now(), p]);
    console.info('[Athens][Boot]', p);
  }
  window.__athensSetPhase = set;
  set('bundle-loaded');
})();

/**
 * @typedef {ReturnType<typeof initializeAthens> extends Promise<infer T> ? T : never} AthensContext
 */

let initializationTask = null;
let initializedContext = null;
let bootPromise = null;
let bootLogEmitted = false;

const DEFAULT_BOOT_DEADLINE_MS = 10000;

const watchdog = attachWatchdog();
registerSW();
setLoopWatchdog(watchdog);

let fallbackActive = false;
let fallbackLoop = null;
let fallbackScene = null;
let fallbackRoot = null;
let fallbackInitTask = null;

function renderBootFailureOverlay(error) {
  if (typeof document === 'undefined') {
    return;
  }
  const existing = document.getElementById('athens-boot-overlay');
  if (existing) {
    existing.textContent = error?.message || 'Boot failed';
    return;
  }

  if (!document.body) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'athens-boot-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(16,18,24,0.92);color:#fff;font-family:system-ui,sans-serif;padding:24px;text-align:center;gap:12px;';

  const title = document.createElement('div');
  title.textContent = 'Athens could not start.';
  title.style.fontSize = '20px';
  title.style.fontWeight = '600';
  overlay.appendChild(title);

  const details = document.createElement('div');
  details.textContent = error?.message || 'An unknown error occurred.';
  details.style.fontSize = '14px';
  details.style.opacity = '0.85';
  overlay.appendChild(details);

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.flexDirection = 'row';
  buttonRow.style.gap = '12px';
  overlay.appendChild(buttonRow);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Cache';
  resetButton.style.cssText =
    'padding:8px 16px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:#1f2937;color:#fff;cursor:pointer;font-size:14px;';
  resetButton.addEventListener('click', () => {
    try {
      if ('caches' in window && typeof caches.keys === 'function') {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
    } catch {}
  });
  buttonRow.appendChild(resetButton);

  const swButton = document.createElement('button');
  swButton.textContent = 'Unregister SW';
  swButton.style.cssText = resetButton.style.cssText;
  swButton.addEventListener('click', () => {
    try {
      const nav = window.navigator;
      if (nav?.serviceWorker?.getRegistrations) {
        nav.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
          .catch(() => {});
      }
    } catch {}
  });
  buttonRow.appendChild(swButton);

  document.body.appendChild(overlay);
}

function renderBootSoftTimeoutNotice(lastPhase) {
  if (typeof document === 'undefined') {
    return;
  }
  const id = 'athens-boot-soft-timeout';
  const message = lastPhase
    ? `Athens is still starting… (last phase: ${lastPhase || 'unknown'})`
    : 'Athens is still starting…';

  const updateContent = (node) => {
    try {
      node.textContent = message;
    } catch {}
  };

  const existing = document.getElementById(id);
  if (existing) {
    updateContent(existing);
    return;
  }

  if (!document.body) {
    return;
  }

  const notice = document.createElement('div');
  notice.id = id;
  notice.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:9998;padding:12px 16px;border-radius:8px;background:rgba(17,25,40,0.88);color:#fff;font-family:system-ui,sans-serif;font-size:13px;max-width:280px;box-shadow:0 12px 24px rgba(0,0,0,0.35);pointer-events:none;';
  updateContent(notice);
  document.body.appendChild(notice);

  try {
    setTimeout(() => {
      try {
        notice.remove();
      } catch {}
    }, 20000);
  } catch {}
}

function resolveBootDeadlineMs() {
  try {
    const candidate = typeof window !== 'undefined' ? window.__ATHENS_BOOT_TIMEOUT : undefined;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.max(8000, candidate);
    }
  } catch {}
  return DEFAULT_BOOT_DEADLINE_MS;
}

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

    const setPhase =
      typeof window !== 'undefined' && typeof window.__athensSetPhase === 'function'
        ? window.__athensSetPhase
        : () => {};
    setPhase('init-start');

    const initializationTask = initializeAthens({ ...options, container });
    const bootDeadlineMs = resolveBootDeadlineMs();
    let bootTimer = null;
    let context;
    try {
      bootTimer = setTimeout(() => {
        let lastPhase;
        try {
          lastPhase = typeof window !== 'undefined' ? window.__athensBoot?.phase : undefined;
        } catch {}
        try {
          console.warn(`[Boot] Soft timeout; last phase=${lastPhase}. Continuing with fallbacks.`);
        } catch {}
        try {
          if (typeof window !== 'undefined') {
            window.__athensBootWarned = true;
          }
        } catch {}
        try {
          renderBootSoftTimeoutNotice(lastPhase);
        } catch {}
      }, bootDeadlineMs);

      context = await initializationTask;
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
    try {
      setPhase('ready');
    } catch {}
    try {
      startAmbience();
    } catch {}
    Promise.resolve()
      .then(() => maybeRemoteInit(context))
      .catch(() => {});
    initializedContext = context;
    return context;
  })();

  try {
    return await initializationTask;
  } catch (error) {
    renderBootFailureOverlay(error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('timeout')) {
      watchdog?.warn?.('boot timeout');
    }
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
