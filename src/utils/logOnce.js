export function logOnce(key, ...args) {
  if (typeof key !== 'string' || !key) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(...args);
    }
    return;
  }

  const globalObject = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
  if (!globalObject) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(...args);
    }
    return;
  }

  if (!globalObject.__LOG_ONCE || !(globalObject.__LOG_ONCE instanceof Set)) {
    globalObject.__LOG_ONCE = new Set();
  }

  if (globalObject.__LOG_ONCE.has(key)) {
    return;
  }

  globalObject.__LOG_ONCE.add(key);

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(...args);
  }
}

export default logOnce;
