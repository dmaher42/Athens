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
