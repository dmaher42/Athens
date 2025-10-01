import {
  HOTKEY_IDS,
  KEY_FALLBACK_MAP,
  RELEVANT_KEYS,
  getActionCodes
} from '../config/hotkeys.ts';

import type { CharacterInput } from './CharacterController.ts';

type KeyboardEventLike = { code?: string; key?: string; repeat?: boolean };

const activeKeys = new Set<string>();

type MovementActionCodes = {
  forwardPositive: readonly string[];
  forwardNegative: readonly string[];
  rightPositive: readonly string[];
  rightNegative: readonly string[];
  jump: readonly string[];
  sprint: readonly string[];
};

const RELEVANT_KEY_SET: Set<string> | undefined =
  RELEVANT_KEYS && typeof RELEVANT_KEYS.has === 'function' ? RELEVANT_KEYS : undefined;

const dynamicRelevantCodes = new Set<string>();

function resolveActionCodes(actionId: string | undefined): string[] {
  if (!actionId) {
    return [];
  }

  const codes = getActionCodes(actionId);
  const resolved: string[] = [];
  if (Array.isArray(codes)) {
    for (const code of codes) {
      if (typeof code === 'string' && code) {
        resolved.push(code);
      }
    }
  }

  return resolved;
}

function updateDynamicRelevance(codes: MovementActionCodes) {
  if (!RELEVANT_KEY_SET) {
    return;
  }

  dynamicRelevantCodes.clear();
  for (const group of Object.values(codes)) {
    for (const code of group) {
      dynamicRelevantCodes.add(code);
    }
  }
}

function refreshMovementCodes(): MovementActionCodes {
  const codes: MovementActionCodes = {
    forwardPositive: resolveActionCodes(HOTKEY_IDS.movement.forward),
    forwardNegative: resolveActionCodes(HOTKEY_IDS.movement.backward),
    rightPositive: resolveActionCodes(HOTKEY_IDS.movement.right),
    rightNegative: resolveActionCodes(HOTKEY_IDS.movement.left),
    jump: resolveActionCodes(HOTKEY_IDS.flight.ascend),
    sprint: resolveActionCodes(HOTKEY_IDS.movement.run)
  };

  updateDynamicRelevance(codes);
  return codes;
}

let listenersAttached = false;

function normalizeCode(event: KeyboardEventLike): string {
  if (!event) {
    return '';
  }

  refreshMovementCodes();

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
    return RELEVANT_KEY_SET.has(code) || dynamicRelevantCodes.has(code);
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

function axisValue(positive: Iterable<string>, negative: Iterable<string>) {
  const pos = hasAnyKey(positive) ? 1 : 0;
  const neg = hasAnyKey(negative) ? 1 : 0;
  return pos - neg;
}

function hasAnyKey(codes: Iterable<string>) {
  for (const code of codes) {
    if (activeKeys.has(code)) {
      return true;
    }
  }
  return false;
}

export function getInput(): CharacterInput {
  ensureListeners();

  const movementCodes = refreshMovementCodes();

  return {
    forward: axisValue(movementCodes.forwardPositive, movementCodes.forwardNegative),
    right: axisValue(movementCodes.rightPositive, movementCodes.rightNegative),
    jump: hasAnyKey(movementCodes.jump),
    sprint: hasAnyKey(movementCodes.sprint)
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
