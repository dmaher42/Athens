import assert from 'node:assert/strict';
import test from 'node:test';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const withFakeDom = async (readyState, run) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  const domReadyHandlers = [];
  const otherHandlers = new Map();

  const fakeWindow = {
    Athens: {},
    addEventListener: (event, handler) => {
      if (event === 'DOMContentLoaded') {
        domReadyHandlers.push(handler);
        return;
      }
      if (!otherHandlers.has(event)) {
        otherHandlers.set(event, []);
      }
      otherHandlers.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      if (event === 'DOMContentLoaded') {
        const idx = domReadyHandlers.indexOf(handler);
        if (idx >= 0) {
          domReadyHandlers.splice(idx, 1);
        }
        return;
      }
      const handlers = otherHandlers.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) {
          handlers.splice(idx, 1);
        }
      }
    },
    dispatchEvent: (event) => {
      const handlers = otherHandlers.get(event.type) || [];
      for (const handler of handlers) {
        handler(event);
      }
    }
  };

  const fakeDocument = {
    readyState,
    getElementById: () => null,
    createElement: () => ({
      style: {},
      appendChild: () => {},
      remove: () => {}
    }),
    body: {
      appendChild: () => {}
    }
  };

  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;

  try {
    await run({ domReadyHandlers, fakeWindow, fakeDocument });
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }

    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
};

const importBootstrap = async () => {
  const module = await import(`../src/core/bootstrap.js?test=${Math.random()}`);
  return module;
};

test('Athens.boot returns a promise tied to the bootstrap lifecycle', async (t) => {
  await t.test('resolves only after entrypoint completes when DOM is ready', async () => {
    await withFakeDom('complete', async ({ fakeWindow }) => {
      const deferred = createDeferred();
      const calls = [];
      fakeWindow.__AthensBootEntrypoint = async (options) => {
        calls.push(options);
        await deferred.promise;
      };

      const bootstrap = await importBootstrap();
      const bootPromise = fakeWindow.Athens.boot({ preset: 'Evening' });

      assert.equal(typeof bootPromise?.then, 'function');
      assert.deepEqual(calls, [{ preset: 'Evening' }]);

      let settled = false;
      bootPromise.then(() => {
        settled = true;
      });

      await Promise.resolve();
      assert.equal(settled, false, 'boot promise should not settle before entrypoint resolves');

      deferred.resolve();
      await bootPromise;
      assert.equal(settled, true);

      assert.equal(await bootstrap.whenBootReady(), true);
    });
  });

  await t.test('queues boot until DOMContentLoaded and resolves afterwards', async () => {
    await withFakeDom('loading', async ({ domReadyHandlers, fakeWindow }) => {
      const deferred = createDeferred();
      let entrypointCalls = 0;
      fakeWindow.__AthensBootEntrypoint = async () => {
        entrypointCalls += 1;
        await deferred.promise;
      };

      const bootstrap = await importBootstrap();
      const bootPromise = fakeWindow.Athens.boot();

      assert.equal(typeof bootPromise?.then, 'function');
      assert.equal(entrypointCalls, 0, 'entrypoint should not run before DOMContentLoaded');
      assert.equal(domReadyHandlers.length, 1, 'DOMContentLoaded handler should be registered once');

      let settled = false;
      bootPromise.then(() => {
        settled = true;
      }, () => {
        settled = true;
      });

      await Promise.resolve();
      assert.equal(settled, false, 'boot promise should not settle before DOM ready');

      domReadyHandlers[0]?.();
      await Promise.resolve();
      assert.equal(entrypointCalls, 1, 'entrypoint should run after DOMContentLoaded');
      assert.equal(settled, false, 'boot promise should still wait for entrypoint completion');

      deferred.resolve();
      await bootPromise;
      assert.equal(settled, true);
      assert.equal(await bootstrap.whenBootReady(), true);
    });
  });

  await t.test('propagates initialization failures', async () => {
    await withFakeDom('complete', async ({ fakeWindow }) => {
      const error = new Error('boom');
      fakeWindow.__AthensBootEntrypoint = async () => {
        throw error;
      };

      const bootstrap = await importBootstrap();
      await assert.rejects(() => fakeWindow.Athens.boot(), error);
      await assert.rejects(bootstrap.whenBootReady(), error);
    });
  });
});
