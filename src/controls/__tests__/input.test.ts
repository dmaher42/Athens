import assert from 'node:assert/strict';
import test from 'node:test';

import getInput, { __inputTest } from '../input.ts';

test('input adapter maps WASD keys to movement axes', () => {
  __inputTest.reset();

  __inputTest.press('KeyW');
  let input = getInput();
  assert.strictEqual(input.forward, 1);
  assert.strictEqual(input.right, 0);

  __inputTest.press('KeyA');
  input = getInput();
  assert.strictEqual(input.forward, 1);
  assert.strictEqual(input.right, -1);

  __inputTest.release('KeyW');
  __inputTest.release('KeyA');
  input = getInput();
  assert.strictEqual(input.forward, 0);
  assert.strictEqual(input.right, 0);
});

test('input adapter respects arrow keys and sprint/jump modifiers', () => {
  __inputTest.reset();

  __inputTest.press('ArrowDown');
  __inputTest.press('ArrowRight');
  __inputTest.press('Space');
  __inputTest.press('ShiftLeft');

  const input = getInput();
  assert.strictEqual(input.forward, -1);
  assert.strictEqual(input.right, 1);
  assert.strictEqual(input.jump, true);
  assert.strictEqual(input.sprint, true);

  __inputTest.reset();
  const reset = getInput();
  assert.strictEqual(reset.forward, 0);
  assert.strictEqual(reset.right, 0);
  assert.strictEqual(reset.jump, false);
  assert.strictEqual(reset.sprint, false);
});
