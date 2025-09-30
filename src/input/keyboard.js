const INV_SQRT2 = 1 / Math.sqrt(2);

const MOVEMENT_KEYS = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD'
];

const LOOK_KEYS = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
];

const MODIFIER_KEYS = ['ShiftLeft', 'ShiftRight'];

const EXTRA_KEYS = ['Space', 'KeyX', 'KeyC', 'KeyE', 'KeyQ', 'KeyZ', 'KeyF', 'ControlLeft', 'ControlRight'];

const RELEVANT_KEYS = new Set([...MOVEMENT_KEYS, ...LOOK_KEYS, ...MODIFIER_KEYS, ...EXTRA_KEYS]);

const KEY_FALLBACK_MAP = new Map([
  ['w', 'KeyW'],
  ['a', 'KeyA'],
  ['s', 'KeyS'],
  ['d', 'KeyD'],
  ['z', 'KeyW'],
  ['q', 'KeyA'],
  ['arrowup', 'ArrowUp'],
  ['arrowdown', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  [' ', 'Space'],
  ['space', 'Space'],
  ['spacebar', 'Space'],
  ['x', 'KeyX'],
  ['f', 'KeyF'],
  ['c', 'KeyC'],
  ['e', 'KeyE'],
  ['shift', 'ShiftLeft'],
  ['control', 'ControlLeft']
]);

const normalizeCode = (event) => {
  if (!event) {
    return undefined;
  }

  const { code, key } = event;

  if (code && code !== '' && code !== 'Unidentified') {
    return code;
  }

  if (!key && key !== 0) {
    return undefined;
  }

  const fallbackKey = String(key).toLowerCase();
  return KEY_FALLBACK_MAP.get(fallbackKey);
};

export function createKeyboard(target = typeof window !== 'undefined' ? window : null) {
  const pressed = new Set();
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

  const handleKeyDown = (event) => {
    const code = normalizeCode(event);

    if (!RELEVANT_KEYS.has(code)) {
      return;
    }
    pressed.add(code);
    updateState();
  };

  const handleKeyUp = (event) => {
    const code = normalizeCode(event);

    if (!RELEVANT_KEYS.has(code)) {
      return;
    }
    pressed.delete(code);
    updateState();
  };

  if (target && target.addEventListener) {
    target.addEventListener('keydown', handleKeyDown);
    target.addEventListener('keyup', handleKeyUp);
    listeners.set('keydown', handleKeyDown);
    listeners.set('keyup', handleKeyUp);
  }

  const isDown = (code) => pressed.has(code);

  const updateState = () => {
    let x = 0;
    let z = 0;

    if (isDown('KeyD')) {
      x += 1;
    }
    if (isDown('KeyA')) {
      x -= 1;
    }

    if (isDown('KeyS')) {
      z += 1;
    }
    if (isDown('KeyW')) {
      z -= 1;
    }

    if (x !== 0 && z !== 0) {
      x *= INV_SQRT2;
      z *= INV_SQRT2;
    }

    axisState.x = x;
    axisState.z = z;
    axisState.turn = 0;
    axisState.running = MODIFIER_KEYS.some((code) => isDown(code));

    axisState.lookX = (isDown('ArrowRight') ? 1 : 0) - (isDown('ArrowLeft') ? 1 : 0);
    axisState.lookY = (isDown('ArrowUp') ? 1 : 0) - (isDown('ArrowDown') ? 1 : 0);

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
    return axisState;
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
    updateState();
  };

  return {
    isDown,
    update,
    axis,
    look,
    dispose
  };
}

export default createKeyboard;
