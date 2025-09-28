import initializeAthens from './initializeAthens.js';
import boot, { whenBootReady } from '../core/bootstrap.js';

/**
 * @typedef {ReturnType<typeof initializeAthens> extends Promise<infer T> ? T : never} AthensContext
 */

/** @type {Promise<AthensContext> | null} */
let initializationTask = null;
/** @type {AthensContext | null} */
let initializedContext = null;
/** @type {Promise<any> | null} */
let bootPromise = null;
let bootLogEmitted = false;

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
}

async function runAthens() {
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

    const container = document.getElementById('app');
    if (!container) {
      throw new Error('Missing #app container for Athens renderer.');
    }

    const context = await initializeAthens({ container });
    initializedContext = context;
    return context;
  })();

  try {
    return await initializationTask;
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
    detail: { initializer: runAthens, source: 'index.html' }
  })
);
console.log('[Athens] initializer ready');

try {
  await runAthens();
} catch (error) {
  console.error('[Athens] Failed to initialize.', error);
}
