import type { CharacterInput } from './CharacterController.ts';

type KeyboardEventLike = { code?: string; key?: string; repeat?: boolean };

const activeKeys = new Set<string>();

const POSITIVE_FORWARD = new Set(['KeyW', 'ArrowUp']);
const NEGATIVE_FORWARD = new Set(['KeyS', 'ArrowDown']);
const POSITIVE_RIGHT = new Set(['KeyD', 'ArrowRight']);
const NEGATIVE_RIGHT = new Set(['KeyA', 'ArrowLeft']);
const JUMP_KEYS = new Set(['Space']);
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

const KEY_ALIAS: Record<string, string> = {
  w: 'KeyW',
  W: 'KeyW',
  s: 'KeyS',
  S: 'KeyS',
  a: 'KeyA',
  A: 'KeyA',
  d: 'KeyD',
  D: 'KeyD',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ' ': 'Space',
  Space: 'Space',
  Shift: 'ShiftLeft'
};

let listenersAttached = false;

function normalizeCode(event: KeyboardEventLike): string {
  if (!event) {
    return '';
  }

  const code = event.code;
  if (typeof code === 'string' && code && code !== 'Unidentified') {
    return code;
  }

  const key = event.key;
  if (typeof key === 'string' && key) {
    return KEY_ALIAS[key] || KEY_ALIAS[key.toUpperCase()] || '';
  }

  return '';
}

function setKeyState(code: string, isDown: boolean) {
  if (!code) {
    return;
  }

  if (isDown) {
    activeKeys.add(code);
  } else {
    activeKeys.delete(code);
  }
}

function handleKeyDown(event: KeyboardEventLike) {
  const code = normalizeCode(event);
  if (!code || event.repeat) {
    return;
  }
  setKeyState(code, true);
}

function handleKeyUp(event: KeyboardEventLike) {
  const code = normalizeCode(event);
  if (!code) {
    return;
  }
  setKeyState(code, false);
}

function ensureListeners() {
  if (listenersAttached) {
    return;
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    listenersAttached = true;
  }
}

function axisValue(positive: Set<string>, negative: Set<string>) {
  const pos = hasAnyKey(positive) ? 1 : 0;
  const neg = hasAnyKey(negative) ? 1 : 0;
  return pos - neg;
}

function hasAnyKey(codes: Set<string>) {
  for (const code of codes) {
    if (activeKeys.has(code)) {
      return true;
    }
  }
  return false;
}

export function getInput(): CharacterInput {
  ensureListeners();

  return {
    forward: axisValue(POSITIVE_FORWARD, NEGATIVE_FORWARD),
    right: axisValue(POSITIVE_RIGHT, NEGATIVE_RIGHT),
    jump: hasAnyKey(JUMP_KEYS),
    sprint: hasAnyKey(SPRINT_KEYS)
  };
}

export const __inputTest = {
  press(code: string) {
    setKeyState(code, true);
  },
  release(code: string) {
    setKeyState(code, false);
  },
  reset() {
    activeKeys.clear();
  }
};

export default getInput;
