import {
  RELEVANT_KEYS,
  KEY_FALLBACK_MAP,
  HOTKEY_AXIS_METADATA,
  getActionCodes
} from '../config/hotkeys.ts';

const INV_SQRT2 = 1 / Math.sqrt(2);

const DEV_FALLBACK_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'ShiftLeft',
  'ShiftRight',
  'Space'
];

const axisCodeBindings = new Map();
const runningActionCodes = new Set();
let hasWarnedForRelevantKeyFallback = false;

const createCodeSet = (actionId) => {
  const set = new Set();
  if (!actionId) {
    return set;
  }
  const codes = getActionCodes(actionId);
  if (!Array.isArray(codes)) {
    return set;
  }
  for (const code of codes) {
    if (typeof code === 'string' && code) {
      set.add(code);
    }
  }
  return set;
};

for (const binding of HOTKEY_AXIS_METADATA) {
  if (!binding) continue;
  if (binding.type === 'paired') {
    axisCodeBindings.set(binding.axis, {
      positive: createCodeSet(binding.positive),
      negative: createCodeSet(binding.negative)
    });
  } else if (binding.type === 'binary' && binding.axis === 'running') {
    for (const actionId of binding.actions ?? []) {
      const codes = getActionCodes(actionId);
      if (!Array.isArray(codes)) {
        continue;
      }
      for (const code of codes) {
        if (typeof code === 'string' && code) {
          runningActionCodes.add(code);
        }
      }
    }
  }
}

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown'
]);

const normalizeCode = (event) => {
  if (!event) {
    return undefined;
  }

  const { code, key } = event;

  if (typeof code === 'string' && code !== '' && code !== 'Unidentified') {
    return code;
  }

  if (key === undefined || key === null) {
    return undefined;
  }

  const fallbackKey = String(key).toLowerCase();
  return KEY_FALLBACK_MAP.get(fallbackKey);
};

export function createKeyboard(target = typeof window !== 'undefined' ? window : null) {
  const pressed = new Set();
  const justPressed = new Set();
  const listeners = new Map();
  const axisState = {
    x: 0,
    z: 0,
    turn: 0,
    running: false,
    lookX: 0,
    lookY: 0
  };
  const lookState = { x: 0, y: 0 };
  let frameJustPressed = new Set();

  const isDevEnvironment =
    typeof process === 'undefined' || process?.env?.NODE_ENV !== 'production';

  let activeRelevantKeys = RELEVANT_KEYS;
  if (!(activeRelevantKeys instanceof Set)) {
    activeRelevantKeys = new Set(activeRelevantKeys ? [...activeRelevantKeys] : []);
  }
  if ((!activeRelevantKeys || activeRelevantKeys.size === 0) && isDevEnvironment) {
    activeRelevantKeys = new Set(DEV_FALLBACK_CODES);
    if (!hasWarnedForRelevantKeyFallback) {
      console.warn('[hotkeys] empty RELEVANT_KEYS; enabling dev fallback');
      hasWarnedForRelevantKeyFallback = true;
    }
  }

  const resolveActionCodes = (actionId) => getActionCodes(actionId);

  const shouldPreventDefault = (event, normalizedCode) => {
    if (!normalizedCode || !PREVENT_DEFAULT_CODES.has(normalizedCode)) {
      return false;
    }
    if (!event) {
      return false;
    }
    if (!target || target === window) {
      return true;
    }
    const eventTarget = event.target;
    if (eventTarget) {
      if (eventTarget === target) {
        return true;
      }
      if (typeof target.contains === 'function' && target.contains(eventTarget)) {
        return true;
      }
    }
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement;
      if (activeElement) {
        if (activeElement === target) {
          return true;
        }
        if (typeof target.contains === 'function' && target.contains(activeElement)) {
          return true;
        }
      }
    }
    return false;
  };

  const getActionState = (actionId) => {
    const codes = resolveActionCodes(actionId);
    if (!codes.length) {
      return { id: actionId, isDown: false, justPressed: false, codes };
    }
    let isDown = false;
    let wasJustPressed = false;
    for (const code of codes) {
      if (!isDown && pressed.has(code)) {
        isDown = true;
      }
      if (!wasJustPressed && (frameJustPressed.has(code) || justPressed.has(code))) {
        wasJustPressed = true;
      }
      if (isDown && wasJustPressed) {
        break;
      }
    }
    return { id: actionId, isDown, justPressed: wasJustPressed, codes };
  };

  const isActionDown = (actionId) => {
    const codes = resolveActionCodes(actionId);
    if (!codes.length) {
      return false;
    }
    for (const code of codes) {
      if (pressed.has(code)) {
        return true;
      }
    }
    return false;
  };

  const hasAnyPressed = (codes) => {
    if (!codes || typeof codes.size !== 'number' || codes.size === 0) {
      return false;
    }
    for (const code of codes) {
      if (pressed.has(code)) {
        return true;
      }
    }
    return false;
  };

  const axisValueFromCodes = (axisId) => {
    const binding = axisCodeBindings.get(axisId);
    if (!binding) {
      return 0;
    }
    const positive = hasAnyPressed(binding.positive) ? 1 : 0;
    const negative = hasAnyPressed(binding.negative) ? 1 : 0;
    return positive - negative;
  };

  const handleKeyDown = (event) => {
    const code = normalizeCode(event);

    if (shouldPreventDefault(event, code)) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    }

    if (!code || !activeRelevantKeys.has(code)) {
      return;
    }

    if (!pressed.has(code)) {
      justPressed.add(code);
      pressed.add(code);
      updateState();
      return;
    }
  };

  const handleKeyUp = (event) => {
    const code = normalizeCode(event);

    if (!code || !activeRelevantKeys.has(code)) {
      return;
    }
    if (pressed.delete(code)) {
      updateState();
    }
  };

  if (target && target.addEventListener) {
    target.addEventListener('keydown', handleKeyDown);
    target.addEventListener('keyup', handleKeyUp);
    listeners.set('keydown', handleKeyDown);
    listeners.set('keyup', handleKeyUp);
  }

  const isDown = (code) => pressed.has(code);

  const updateState = () => {
    axisState.x = axisValueFromCodes('x');
    axisState.z = axisValueFromCodes('z');

    const combinedMagnitude = Math.abs(axisState.x) + Math.abs(axisState.z);
    if (combinedMagnitude > 1) {
      axisState.x *= INV_SQRT2;
      axisState.z *= INV_SQRT2;
    }

    axisState.turn = 0;

    axisState.lookX = axisValueFromCodes('lookX');
    axisState.lookY = axisValueFromCodes('lookY');

    axisState.running = hasAnyPressed(runningActionCodes);

    lookState.x = axisState.lookX;
    lookState.y = axisState.lookY;
  };

  updateState();

  const axis = {};
  Object.defineProperties(axis, {
    x: {
      enumerable: true,
      get() {
        return axisState.x;
      }
    },
    z: {
      enumerable: true,
      get() {
        return axisState.z;
      }
    },
    turn: {
      enumerable: true,
      get() {
        return axisState.turn;
      }
    },
    running: {
      enumerable: true,
      get() {
        return axisState.running;
      }
    },
    lookX: {
      enumerable: true,
      get() {
        return axisState.lookX;
      }
    },
    lookY: {
      enumerable: true,
      get() {
        return axisState.lookY;
      }
    }
  });

  const look = {};
  Object.defineProperties(look, {
    x: {
      enumerable: true,
      get() {
        return lookState.x;
      }
    },
    y: {
      enumerable: true,
      get() {
        return lookState.y;
      }
    }
  });

  const update = () => {
    updateState();
    frameJustPressed = new Set(justPressed);
    justPressed.clear();
    return axisState;
  };

  const wasPressed = (code) => {
    if (!code) return false;
    if (frameJustPressed.has(code)) {
      frameJustPressed.delete(code);
      return true;
    }
    return false;
  };

  const dispose = () => {
    if (!target || !target.removeEventListener) {
      return;
    }
    listeners.forEach((handler, type) => {
      target.removeEventListener(type, handler);
    });
    listeners.clear();
    pressed.clear();
    justPressed.clear();
    frameJustPressed.clear();
    updateState();
  };

  return {
    isDown,
    isActionDown,
    getActionState,
    update,
    axis,
    look,
    wasPressed,
    dispose
  };
}

export default createKeyboard;
