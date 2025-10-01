import assert from 'node:assert/strict';
import test from 'node:test';

import { setupServiceWorker } from '../src/registerServiceWorker.ts';

type GlobalPatch = Partial<Record<string, any>>;

const UNDEFINED_SENTINEL = Symbol.for('athens.global.undefined');

async function withPatchedGlobals(patch: GlobalPatch, fn: () => Promise<void> | void) {
  const g = globalThis as Record<string, any>;
  const previous = new Map<string, any>();

  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, key in g ? g[key] : UNDEFINED_SENTINEL);
    g[key] = value;
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === UNDEFINED_SENTINEL) {
        delete g[key];
      } else {
        g[key] = value;
      }
    }
  }
}

test('setupServiceWorker registers service worker with base URL on window load', async () => {
  const registerCalls: string[] = [];
  const loadHandlers: Array<() => void | Promise<void>> = [];

  await withPatchedGlobals(
    {
      window: {
        addEventListener(type: string, handler: () => void | Promise<void>) {
          if (type === 'load') {
            loadHandlers.push(handler);
          }
        }
      },
      navigator: {
        serviceWorker: {
          register(url: string) {
            registerCalls.push(url);
            return Promise.resolve();
          },
          getRegistrations() {
            return Promise.resolve([]);
          }
        }
      }
    },
    async () => {
      setupServiceWorker({ BASE_URL: '/Athens/', DEV: false });

      assert.equal(registerCalls.length, 0);
      assert.ok(loadHandlers.length > 0, 'expected load handler to be registered');

      for (const handler of loadHandlers) {
        await handler();
      }

      assert.deepEqual(registerCalls, ['/Athens/service-worker.js']);
    }
  );
});

test('setupServiceWorker unregisters existing registrations during development', async () => {
  const unregisterCalls: number[] = [];

  await withPatchedGlobals(
    {
      window: {
        addEventListener() {
          // no-op
        }
      },
      navigator: {
        serviceWorker: {
          getRegistrations() {
            return Promise.resolve([
              {
                unregister() {
                  unregisterCalls.push(1);
                  return Promise.resolve();
                }
              },
              {
                unregister() {
                  unregisterCalls.push(2);
                  return Promise.reject(new Error('fail'));
                }
              }
            ]);
          }
        }
      }
    },
    async () => {
      await setupServiceWorker({ BASE_URL: '/Athens/', DEV: true });

      assert.deepEqual(unregisterCalls, [1, 2]);
    }
  );
});
