import assert from 'node:assert/strict';
import test from 'node:test';

import { registerSW } from '../src/registerServiceWorker.ts';

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

test('registerSW checks for service worker availability and registers with base scope', async () => {
  const registerCalls: Array<{ url: string; scope?: string }> = [];
  const fetchCalls: Array<{ input: any; init: any }> = [];

  await withPatchedGlobals(
    {
      navigator: {
        serviceWorker: {
          register(url: string, options?: { scope?: string }) {
            registerCalls.push({ url, scope: options?.scope });
            return Promise.resolve();
          },
          getRegistrations() {
            return Promise.resolve([]);
          }
        }
      },
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        fetchCalls.push({ input, init });
        return Promise.resolve({ ok: true });
      },
      __ATHENS_SW_ENV__: { BASE_URL: '/Athens/', DEV: false }
    },
    async () => {
      assert.ok('serviceWorker' in navigator);
      await registerSW();

      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0]?.init?.method, 'HEAD');
      assert.deepEqual(registerCalls, [{ url: '/Athens/service-worker.js', scope: '/Athens/' }]);
    }
  );
});

test('registerSW unregisters existing registrations during development', async () => {
  const unregisterCalls: number[] = [];

  await withPatchedGlobals(
    {
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
      },
      __ATHENS_SW_ENV__: { BASE_URL: '/Athens/', DEV: true }
    },
    async () => {
      await registerSW();

      assert.deepEqual(unregisterCalls, [1, 2]);
    }
  );
});
