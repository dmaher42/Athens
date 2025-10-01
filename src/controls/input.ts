import {
  HOTKEY_IDS,
  KEY_FALLBACK_MAP,
  RELEVANT_KEYS,
  getActionCodes
} from '../config/hotkeys.ts';

import type { CharacterInput } from './CharacterController.ts';

type KeyboardEventLike = { code?: string; key?: string; repeat?: boolean };

const activeKeys = new Set<string>();

const POSITIVE_FORWARD = createActionCodeSet(HOTKEY_IDS.movement.forward);
const NEGATIVE_FORWARD = createActionCodeSet(HOTKEY_IDS.movement.backward);
const POSITIVE_RIGHT = createActionCodeSet(HOTKEY_IDS.movement.right);
const NEGATIVE_RIGHT = createActionCodeSet(HOTKEY_IDS.movement.left);
const JUMP_KEYS = createActionCodeSet(HOTKEY_IDS.flight.ascend);
const SPRINT_KEYS = createActionCodeSet(HOTKEY_IDS.movement.run);
const RELEVANT_KEY_SET: Set<string> | undefined =
  RELEVANT_KEYS && typeof RELEVANT_KEYS.has === 'function' ? RELEVANT_KEYS : undefined;

function createActionCodeSet(actionId: string | undefined): Set<string> {
  if (!actionId) {
    return new Set();
  }

  const codes = getActionCodes(actionId);
  return new Set(codes);
}

let listenersAttached = false;

function normalizeCode(event: KeyboardEventLike): string {
  if (!event) {
    return '';
  }

  const code = event.code;
  if (typeof code === 'string' && code && code !== 'Unidentified') {
    return isRelevant(code) ? code : '';
  }

  const key = event.key;
  if (typeof key === 'string' && key) {
    const fallbackKey = key.toLowerCase();
    const fallbackCode = KEY_FALLBACK_MAP.get(fallbackKey);

    if (fallbackCode && isRelevant(fallbackCode)) {
      return fallbackCode;
    }
  }

  return '';
}

function isRelevant(code: string): boolean {
  if (!code) {
    return false;
  }

  if (RELEVANT_KEY_SET) {
    return RELEVANT_KEY_SET.has(code);
  }

  return true;
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
