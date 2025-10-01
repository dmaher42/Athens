import assert from 'node:assert/strict';
import test from 'node:test';

import createKeyboard from '../src/input/keyboard.js';
import { HOTKEY_IDS } from '../src/config/hotkeys.ts';

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
  assert.strictEqual(keyboard.axis.z, -1);

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
  assert.strictEqual(keyboard.axis.z, -1);

  keydown({ key: 'Shift', code: 'Unidentified' });
  assert.strictEqual(keyboard.axis.running, true);
  assert.strictEqual(keyboard.isActionDown(HOTKEY_IDS.movement.run), true);

  keydown({ key: 'ArrowLeft', code: 'Unidentified' });
  assert.strictEqual(keyboard.isDown('ArrowLeft'), true);
  assert.strictEqual(keyboard.getActionState(HOTKEY_IDS.look.left).isDown, true);
  assert.strictEqual(keyboard.look.x, -1);
  assert.strictEqual(keyboard.axis.lookX, -1);

  keydown({ key: 'ArrowUp', code: undefined });
  assert.strictEqual(keyboard.look.y, 1);
  assert.strictEqual(keyboard.axis.lookY, 1);

  keyup({ key: 'ArrowLeft', code: '' });
  keyup({ key: 'ArrowUp', code: '' });
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
  assert.strictEqual(keyboard.axis.z, -1);

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
