import assert from 'node:assert/strict';
import test from 'node:test';

import getInput, { __inputTest } from '../input.ts';

test('input adapter maps movement hotkeys to axes', () => {
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

test('input adapter ignores look hotkeys for walking movement', () => {
  __inputTest.reset();

  __inputTest.press('ArrowDown');
  __inputTest.press('ArrowRight');
  const input = getInput();
  assert.strictEqual(input.forward, 0);
  assert.strictEqual(input.right, 0);
  assert.strictEqual(input.jump, false);
  assert.strictEqual(input.sprint, false);

  __inputTest.reset();
  const reset = getInput();
  assert.strictEqual(reset.forward, 0);
  assert.strictEqual(reset.right, 0);
  assert.strictEqual(reset.jump, false);
  assert.strictEqual(reset.sprint, false);
});

test('input adapter respects configured sprint and jump aliases', () => {
  __inputTest.reset();

  __inputTest.press('KeyE');
  __inputTest.press('ShiftRight');

  const input = getInput();
  assert.strictEqual(input.jump, true);
  assert.strictEqual(input.sprint, true);

  __inputTest.release('KeyE');
  __inputTest.release('ShiftRight');
  const cleared = getInput();
  assert.strictEqual(cleared.jump, false);
  assert.strictEqual(cleared.sprint, false);
});
