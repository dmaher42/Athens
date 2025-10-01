import assert from 'node:assert/strict';
import test from 'node:test';

import createKeyboard from '../src/input/keyboard.js';
import { HOTKEY_IDS } from '../src/config/hotkeys.ts';

const EPSILON = 1e-6;

const createMockTarget = () => {
  const listeners = new Map();

  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    }
  };
};

test('keyboard respects event.code when provided', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown({ code: 'KeyW', key: 'w' });
  assert.strictEqual(keyboard.isDown('KeyW'), true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), true);
  assert.strictEqual(keyboard.getActionState(HOTKEY_IDS.movement.forward).isDown, true);
  assert.strictEqual(keyboard.axis.z, 1);

  keyup({ code: 'KeyW', key: 'w' });
  assert.strictEqual(keyboard.isDown('KeyW'), false);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), false);
  assert.strictEqual(keyboard.axis.z, 0);

  keyboard.dispose();
});

test('keyboard normalizes events without code to maintain controls', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown({ key: 'w', code: '' });
  assert.strictEqual(keyboard.isDown('KeyW'), true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), true);
  assert.strictEqual(keyboard.getActionState(HOTKEY_IDS.movement.forward).isDown, true);
  assert.strictEqual(keyboard.axis.z, 1);

  keydown({ key: 'Shift', code: 'Unidentified' });
  assert.strictEqual(keyboard.axis.running, true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.run), true);

  keydown({ key: 'ArrowLeft', code: 'Unidentified' });
  assert.strictEqual(keyboard.isDown('ArrowLeft'), true);
  assert.strictEqual(keyboard.getActionState(HOTKEY_IDS.look.left).isDown, true);
  assert.strictEqual(keyboard.look.x, -1);
  assert.strictEqual(keyboard.axis.lookX, -1);

  keyup({ key: 'ArrowLeft', code: '' });

  keydown({ key: 'ArrowRight', code: undefined });
  assert.strictEqual(keyboard.axis.lookX, 1);
  assert.strictEqual(keyboard.look.x, 1);

  keyup({ key: 'ArrowRight', code: '' });

  keydown({ key: 'ArrowUp', code: undefined });
  assert.strictEqual(keyboard.look.y, 1);
  assert.strictEqual(keyboard.axis.lookY, 1);

  keyup({ key: 'ArrowUp', code: '' });

  keydown({ key: 'ArrowDown', code: undefined });
  assert.strictEqual(keyboard.look.y, -1);
  assert.strictEqual(keyboard.axis.lookY, -1);

  keyup({ key: 'ArrowRight', code: '' });
  keyup({ key: 'ArrowDown', code: '' });
  keyup({ key: 'Shift', code: '' });
  keyup({ key: 'w', code: '' });

  assert.strictEqual(keyboard.isDown('KeyW'), false);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), false);
  assert.strictEqual(keyboard.axis.z, 0);
  assert.strictEqual(keyboard.axis.running, false);
  assert.strictEqual(keyboard.look.x, 0);
  assert.strictEqual(keyboard.look.y, 0);
  assert.strictEqual(keyboard.axis.lookX, 0);
  assert.strictEqual(keyboard.axis.lookY, 0);

  keyboard.dispose();
});

test('keyboard maps azerty movement aliases without triggering descend', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown({ key: 'z' });
  assert.strictEqual(keyboard.isDown('KeyW'), true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.forward), true);
  assert.strictEqual(keyboard.axis.z, 1);

  keyup({ key: 'z' });
  assert.strictEqual(keyboard.axis.z, 0);

  keydown({ key: 'q' });
  assert.strictEqual(keyboard.isDown('KeyA'), true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.left), true);
  assert.strictEqual(keyboard.axis.x, -1);
  assert.strictEqual(keyboard.isDown('KeyQ'), false);

  keyup({ key: 'q' });

  assert.strictEqual(keyboard.axis.x, 0);

  keyboard.dispose();
});

test('keyboard normalizes diagonal movement speed', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  keydown({ code: 'KeyW', key: 'w' });
  keydown({ code: 'KeyD', key: 'd' });

  assert.ok(Math.abs(keyboard.axis.z - Math.SQRT1_2) < EPSILON);
  assert.ok(Math.abs(keyboard.axis.x - Math.SQRT1_2) < EPSILON);

  keyup({ code: 'KeyW', key: 'w' });
  keyup({ code: 'KeyD', key: 'd' });

  keyboard.dispose();
});

test('keyboard prevents default browser actions for space and arrow keys', () => {
  const target = createMockTarget();
  const keyboard = createKeyboard(target);
  const keydown = target.listeners.get('keydown');
  const keyup = target.listeners.get('keyup');

  let spacePrevented = 0;
  let spaceStopped = 0;
  keydown({
    code: 'Space',
    key: ' ',
    preventDefault() {
      spacePrevented += 1;
    },
    stopPropagation() {
      spaceStopped += 1;
    }
  });
  assert.strictEqual(spacePrevented, 1);
  assert.strictEqual(spaceStopped, 1);

  keyup({ code: 'Space', key: ' ' });

  let arrowPrevented = 0;
  let arrowStopped = 0;
  keydown({
    code: 'ArrowDown',
    key: 'ArrowDown',
    preventDefault() {
      arrowPrevented += 1;
    },
    stopPropagation() {
      arrowStopped += 1;
    }
  });
  assert.strictEqual(arrowPrevented, 1);
  assert.strictEqual(arrowStopped, 1);

  keyup({ code: 'ArrowDown', key: 'ArrowDown' });

  keyboard.dispose();
});
