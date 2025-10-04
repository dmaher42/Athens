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

test('withTimeout rejects when there is no fallback', async () => {
  await assert.rejects(
    withTimeout(new Promise<never>(() => {}), 5, 'unit-test-no-fallback'),
    /timeout:unit-test-no-fallback/
  );
});

test('environment-module timeout resolves softly without fallback', async () => {
  const result = await withTimeout(new Promise<never>(() => {}), 5, 'environment-module');
  assert.equal(result, undefined);
});
