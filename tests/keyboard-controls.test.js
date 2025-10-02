import assert from 'node:assert/strict';
import test from 'node:test';

import createKeyboard from '../src/input/keyboard.js';
import { HOTKEY_IDS } from '../src/config/hotkeys.ts';

const EPSILON = 1e-6;

const createMockTarget = () => {
  const listeners = new Map();

  return {
    listeners,
    tagName: 'CANVAS',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    contains(node) {
      return node === this;
    }
  };
};

const focusEvent = (target, event) => ({ target, ...event });

test('WASD movement updates axes and shift enables running', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown(focusEvent(target, { code: 'KeyW', key: 'w' }));
  assert.strictEqual(keyboard.isDown('KeyW'), true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), true);
  assert.strictEqual(keyboard.axis.z, 1);

  keydown(focusEvent(target, { code: 'KeyA', key: 'a' }));
  assert.ok(Math.abs(keyboard.axis.x + Math.SQRT1_2) < EPSILON);
  assert.ok(Math.abs(keyboard.axis.z - Math.SQRT1_2) < EPSILON);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.left), true);

  keydown(
    focusEvent(target, {
      code: 'Unidentified',
      key: 'Shift'
    })
  );
  assert.strictEqual(keyboard.axis.running, true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.run), true);

  keyup(focusEvent(target, { code: 'Unidentified', key: 'Shift' }));
  assert.strictEqual(keyboard.axis.running, false);

  keyup(focusEvent(target, { code: 'KeyA', key: 'a' }));
  assert.strictEqual(keyboard.axis.x, 0);

  keyup(focusEvent(target, { code: 'KeyW', key: 'w' }));
  assert.strictEqual(keyboard.axis.z, 0);

  keyboard.dispose();
});

test('Azerty fallbacks map to WASD movement', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown(focusEvent(target, { key: 'z' }));
  assert.strictEqual(keyboard.isDown('KeyW'), true);
  assert.strictEqual(keyboard.axis.z, 1);

  keyup(focusEvent(target, { key: 'z' }));
  assert.strictEqual(keyboard.axis.z, 0);

  keydown(focusEvent(target, { key: 'q' }));
  assert.strictEqual(keyboard.isDown('KeyA'), true);
  assert.strictEqual(keyboard.axis.x, -1);

  keyup(focusEvent(target, { key: 'q' }));
  assert.strictEqual(keyboard.axis.x, 0);

  keyboard.dispose();
});

test('Diagonal movement normalizes to unit speed', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown(focusEvent(target, { code: 'KeyW', key: 'w' }));
  keydown(focusEvent(target, { code: 'KeyD', key: 'd' }));

  assert.ok(Math.abs(keyboard.axis.z - Math.SQRT1_2) < EPSILON);
  assert.ok(Math.abs(keyboard.axis.x - Math.SQRT1_2) < EPSILON);

  keyup(focusEvent(target, { code: 'KeyD', key: 'd' }));
  keyup(focusEvent(target, { code: 'KeyW', key: 'w' }));

  keyboard.dispose();
});

test('Arrow keys drive look axes', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown(focusEvent(target, { key: 'ArrowLeft', code: 'Unidentified' }));
  assert.strictEqual(keyboard.axis.lookX, -1);
  assert.strictEqual(keyboard.look.x, -1);

  keyup(focusEvent(target, { key: 'ArrowLeft', code: 'Unidentified' }));
  assert.strictEqual(keyboard.axis.lookX, 0);

  keydown(focusEvent(target, { key: 'ArrowRight', code: 'ArrowRight' }));
  assert.strictEqual(keyboard.axis.lookX, 1);

  keyup(focusEvent(target, { key: 'ArrowRight', code: 'ArrowRight' }));
  assert.strictEqual(keyboard.axis.lookX, 0);

  keydown(focusEvent(target, { key: 'ArrowUp', code: 'ArrowUp' }));
  assert.strictEqual(keyboard.axis.lookY, 1);
  assert.strictEqual(keyboard.look.y, 1);

  keyup(focusEvent(target, { key: 'ArrowUp', code: 'ArrowUp' }));
  assert.strictEqual(keyboard.axis.lookY, 0);

  keydown(focusEvent(target, { key: 'ArrowDown', code: 'ArrowDown' }));
  assert.strictEqual(keyboard.axis.lookY, -1);

  keyup(focusEvent(target, { key: 'ArrowDown', code: 'ArrowDown' }));
  assert.strictEqual(keyboard.axis.lookY, 0);

  keyboard.dispose();
});

test('Space and arrow keys prevent default when canvas is focused', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  let spacePrevented = 0;
  let spaceStopped = 0;
  keydown(
    focusEvent(target, {
      code: 'Space',
      key: ' ',
      preventDefault() {
        spacePrevented += 1;
      },
      stopPropagation() {
        spaceStopped += 1;
      }
    })
  );
  assert.strictEqual(spacePrevented, 1);
  assert.strictEqual(spaceStopped, 1);

  keyup(focusEvent(target, { code: 'Space', key: ' ' }));

  let arrowPrevented = 0;
  let arrowStopped = 0;
  keydown(
    focusEvent(target, {
      code: 'ArrowUp',
      key: 'ArrowUp',
      preventDefault() {
        arrowPrevented += 1;
      },
      stopPropagation() {
        arrowStopped += 1;
      }
    })
  );
  assert.strictEqual(arrowPrevented, 1);
  assert.strictEqual(arrowStopped, 1);

  keyup(focusEvent(target, { code: 'ArrowUp', key: 'ArrowUp' }));

  keyboard.dispose();
});
