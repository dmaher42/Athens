import assert from 'node:assert/strict';
import test from 'node:test';

import { withTimeout } from '../withTimeout';

test('withTimeout resolves with fallback when promise times out', async () => {
  const result = await withTimeout(
    new Promise<never>(() => {}),
    5,
    'unit-test',
    () => 'fallback'
  );

  assert.equal(result, 'fallback');
});

test('withTimeout resolves when promise fulfills before timeout', async () => {
  const result = await withTimeout(Promise.resolve('success'), 50, 'unit-test');

  assert.equal(result, 'success');
});

test('withTimeout rethrows underlying rejection errors', async () => {
  let fallbackCalled = false;

  await assert.rejects(
    async () =>
      withTimeout(
        Promise.resolve().then(() => {
          throw new Error('boom');
        }),
        50,
        'unit-test',
        () => {
          fallbackCalled = true;
          return 'fallback';
        }
      ),
    /boom/
  );

  assert.equal(fallbackCalled, false);
});

test('withTimeout rejects when timeout occurs without fallback', async () => {
  await assert.rejects(
    async () => withTimeout(new Promise<never>(() => {}), 5, 'unit-test'),
    /timeout:unit-test/
  );
});
