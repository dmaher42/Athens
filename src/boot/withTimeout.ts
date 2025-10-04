declare global {
  interface Window {
    __ATHENS_BOOT_TIMEOUT?: number;
  }
}

const resolveDebugTimeout = () => {
  try {
    const value = (typeof window !== 'undefined' && window.__ATHENS_BOOT_TIMEOUT) || undefined;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(2500, value) : undefined;
  } catch {
    return undefined;
  }
};

const normalizeError = (value: unknown, fallback: Error) => {
  if (value instanceof Error) {
    return value;
  }
  const message = typeof value === 'string' ? value : `${value}`;
  return message && message !== '[object Object]' ? new Error(message) : fallback;
};

export async function withTimeout<T>(
  p: Promise<T>,
  ms: number | undefined,
  label: string,
  fallback?: (error: unknown) => T | Promise<T>
): Promise<T> {
  const providedMs = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  const debugOverride = label === 'environment-module' ? undefined : resolveDebugTimeout();
  const timeoutMs =
    label === 'environment-module'
      ? Math.max(providedMs, 8000)
      : debugOverride ?? (providedMs > 0 ? providedMs : 2500);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error(`timeout:${label}`);
  const runFallback = async (error: unknown): Promise<T> => {
    if (fallback) {
      return await fallback(error);
    }
    if (label === 'environment-module') {
      // Allow environment-module to resolve softly when no explicit fallback is provided.
      // @ts-expect-error soft fallback may return undefined for environment phase.
      return undefined;
    }
    throw normalizeError(error, timeoutError);
  };

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      try {
        console.warn('[Boot][withTimeout] timed out:', label, '→ using fallback');
      } catch {
        // ignore console issues
      }
      runFallback(timeoutError)
        .then(resolve)
        .catch((error) => {
          reject(normalizeError(error, timeoutError));
        });
    }, timeoutMs);
  });

  try {
    return await Promise.race([p, timeoutPromise]);
  } catch (error) {
    try {
      return await runFallback(error);
    } catch (fallbackError) {
      throw normalizeError(fallbackError, timeoutError);
    }
  } finally {
    if (typeof timer !== 'undefined') {
      clearTimeout(timer);
    }
  }
}
