import assert from 'node:assert/strict';
import test from 'node:test';
import { mock } from 'node:test';

test('landing boot resolves to ready phase under normal conditions', async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timeouts: number[] = [];
  let handle = 1;
  const pending = new Map<number, () => void>();

  function fakeSetTimeout(callback: (...args: any[]) => void, ms?: number) {
    const id = handle++;
    timeouts.push(typeof ms === 'number' ? ms : 0);
    pending.set(id, () => {
      try {
        callback();
      } catch {}
    });
    return id;
  }

  function fakeClearTimeout(id?: number) {
    if (typeof id === 'number') {
      pending.delete(id);
    }
  }

  globalThis.setTimeout = fakeSetTimeout as any;
  globalThis.clearTimeout = fakeClearTimeout as any;

  const windowStub: any = {
    devicePixelRatio: 1,
    location: { search: '' },
    navigator: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
  };
  const body = {
    appendChild: () => {},
    removeChild: () => {},
    style: {},
  };
  const containerEl = {
    id: 'app',
    style: {},
    contains: () => true,
    appendChild: () => {},
  } as any;
  const documentStub: any = {
    body,
    readyState: 'complete',
    createElement: () => ({
      id: '',
      style: {},
      appendChild: () => {},
      removeChild: () => {},
    }),
    getElementById: (id: string) => (id === 'app' ? containerEl : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  windowStub.document = documentStub;

  (globalThis as any).window = windowStub;
  (globalThis as any).document = documentStub;
  (globalThis as any).performance = windowStub.performance;
  (globalThis as any).requestAnimationFrame = windowStub.requestAnimationFrame;
  (globalThis as any).cancelAnimationFrame = windowStub.cancelAnimationFrame;

  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).performance;
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;
    mock.restoreAll();
  });

  mock.module('../block-remote-guard.js', () => ({}));
  mock.module('../registerServiceWorker.ts', () => ({ registerSW: () => {} }));
  mock.module('../core/bootstrap.js', () => ({
    default: () => {},
    whenBootReady: async () => {},
  }));
  mock.module('../engine/loop.js', () => ({
    startGameLoop: () => ({ stop: () => {} }),
    setLoopWatchdog: () => {},
  }));
  mock.module('../engine/safeEntry.js', () => ({
    createSafeScene: async () => ({
      renderer: { domElement: { style: {} } },
      dispose: () => {},
      render: () => {},
      update: () => {},
    }),
  }));
  mock.module('../ui/watchdog.js', () => ({
    attachWatchdog: () => ({ warn: () => {}, error: () => {} }),
  }));
  mock.module('../services/remote.js', () => ({
    maybeRemoteInit: () => {},
  }));
  mock.module('../../audio/startAmbience.ts', () => ({
    startAmbience: () => {},
  }));
  mock.module('../utils/logger.ts', () => ({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }));
  mock.module('../initializeAthens.js', () => ({
    initializeAthens: async () => ({
      renderer: { setClearColor: () => {} },
      scene: {},
    }),
  }));
  mock.module('three', () => ({
    Color: class Color {
      constructor(_hex: number) {}
    },
  }));

  await import('../landing.js');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(windowStub.__athensBoot?.phase, 'ready');
  assert.ok(
    timeouts.every((ms) => ms <= 10000),
    'no watchdog should exceed 10s'
  );
});
