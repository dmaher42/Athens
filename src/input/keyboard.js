const INV_SQRT2 = 1 / Math.sqrt(2);

const RELEVANT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight'
]);

export function createKeyboard(target = typeof window !== 'undefined' ? window : null) {
  const pressed = new Set();
  const listeners = new Map();
  const axisVector = { x: 0, z: 0 };

  const handleKeyDown = (event) => {
    if (!RELEVANT_KEYS.has(event.code)) {
      return;
    }
    pressed.add(event.code);
  };

  const handleKeyUp = (event) => {
    if (!RELEVANT_KEYS.has(event.code)) {
      return;
    }
    pressed.delete(event.code);
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

    if (isDown('KeyA') || isDown('ArrowLeft')) {
      x -= 1;
    }
    if (isDown('KeyD') || isDown('ArrowRight')) {
      x += 1;
    }
    if (isDown('KeyW') || isDown('ArrowUp')) {
      z -= 1;
    }
    if (isDown('KeyS') || isDown('ArrowDown')) {
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
        return isDown('ShiftLeft') || isDown('ShiftRight');
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
    dispose
  };
}

export default createKeyboard;
