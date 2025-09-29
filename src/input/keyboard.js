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

const EXTRA_KEYS = ['Space', 'KeyX', 'KeyC', 'KeyE', 'KeyQ', 'KeyZ', 'ControlLeft', 'ControlRight'];

const RELEVANT_KEYS = new Set([...MOVEMENT_KEYS, ...LOOK_KEYS, ...MODIFIER_KEYS, ...EXTRA_KEYS]);

const KEY_FALLBACK_MAP = new Map([
  ['w', 'KeyW'],
  ['a', 'KeyA'],
  ['s', 'KeyS'],
  ['d', 'KeyD'],
  ['arrowup', 'ArrowUp'],
  ['arrowdown', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  [' ', 'Space'],
  ['space', 'Space'],
  ['spacebar', 'Space'],
  ['x', 'KeyX'],
  ['c', 'KeyC'],
  ['e', 'KeyE'],
  ['q', 'KeyQ'],
  ['z', 'KeyZ'],
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
  const axisVector = { x: 0, z: 0 };
  const lookVector = { x: 0, y: 0 };

  const handleKeyDown = (event) => {
    const code = normalizeCode(event);

    if (!RELEVANT_KEYS.has(code)) {
      return;
    }
    pressed.add(code);
  };

  const handleKeyUp = (event) => {
    const code = normalizeCode(event);

    if (!RELEVANT_KEYS.has(code)) {
      return;
    }
    pressed.delete(code);
  };

  if (target && target.addEventListener) {
    target.addEventListener('keydown', handleKeyDown);
    target.addEventListener('keyup', handleKeyUp);
    listeners.set('keydown', handleKeyDown);
    listeners.set('keyup', handleKeyUp);
  }

  const isDown = (code) => pressed.has(code);

  const computeAxis = () => {
    let x = 0;
    let z = 0;

    if (isDown('KeyA')) {
      x -= 1;
    }
    if (isDown('KeyD')) {
      x += 1;
    }
    if (isDown('KeyW')) {
      z -= 1;
    }
    if (isDown('KeyS')) {
      z += 1;
    }

    if (x !== 0 && z !== 0) {
      x *= INV_SQRT2;
      z *= INV_SQRT2;
    }

    axisVector.x = x;
    axisVector.z = z;
    return axisVector;
  };

  const computeLook = () => {
    let x = 0;
    let y = 0;

    if (isDown('ArrowLeft')) {
      x -= 1;
    }
    if (isDown('ArrowRight')) {
      x += 1;
    }
    if (isDown('ArrowUp')) {
      y += 1;
    }
    if (isDown('ArrowDown')) {
      y -= 1;
    }

    lookVector.x = x;
    lookVector.y = y;
    return lookVector;
  };

  const axis = {};
  Object.defineProperties(axis, {
    x: {
      enumerable: true,
      get() {
        return computeAxis().x;
      }
    },
    z: {
      enumerable: true,
      get() {
        return computeAxis().z;
      }
    },
    running: {
      enumerable: true,
      get() {
        return MODIFIER_KEYS.some((code) => isDown(code));
      }
    },
    lookX: {
      enumerable: true,
      get() {
        return computeLook().x;
      }
    },
    lookY: {
      enumerable: true,
      get() {
        return computeLook().y;
      }
    }
  });

  const look = {};
  Object.defineProperties(look, {
    x: {
      enumerable: true,
      get() {
        return computeLook().x;
      }
    },
    y: {
      enumerable: true,
      get() {
        return computeLook().y;
      }
    }
  });

  const dispose = () => {
    if (!target || !target.removeEventListener) {
      return;
    }
    listeners.forEach((handler, type) => {
      target.removeEventListener(type, handler);
    });
    listeners.clear();
    pressed.clear();
  };

  return {
    isDown,
    axis,
    look,
    dispose
  };
}

export default createKeyboard;
