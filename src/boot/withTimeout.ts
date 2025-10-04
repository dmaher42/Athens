type TimeoutFallback<T> = (error: unknown) => T | Promise<T>;

declare global {
  interface Window {
    __ATHENS_BOOT_TIMEOUT?: number;
  }
}

const resolveDebugTimeout = (): number | undefined => {
  try {
    const candidate = (globalThis as typeof window | undefined)?.__ATHENS_BOOT_TIMEOUT;
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
};

const toError = (value: unknown, fallbackError: Error): Error => {
  if (value instanceof Error) return value;
  const message = typeof value === 'string' ? value : `${value}`;
  return message && message !== '[object Object]' ? new Error(message) : fallbackError;
};

export function withTimeout<T>(
  p: Promise<T>,
  ms: number | undefined,
  label: string,
  fallback?: TimeoutFallback<T>
): Promise<T> {
  const providedMs = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;

  // Only allow debug override for non-environment-module labels.
  const debugOverride = label === 'environment-module' ? undefined : resolveDebugTimeout();

  // Enforce a larger minimum for environment-module; otherwise prefer debug override, then provided, then default.
  const timeoutMs =
    label === 'environment-module'
      ? (providedMs > 0 ? Math.max(providedMs, 5000) : 8000)
      : (debugOverride ?? (providedMs > 0 ? providedMs : 2500));

  const timeoutError = new Error(`timeout:${label}`);

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const clearTimer = () => {
      if (typeof timer !== 'undefined') {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const settleResolve = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimer();
      resolve(value);
    };

    const settleReject = (reason: unknown) => {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(reason);
    };

    const runFallback = (error: unknown, allowUndefined: boolean) => {
      if (fallback) {
        try {
          Promise.resolve(fallback(error))
            .then((value) => settleResolve(value))
            .catch((fbError) => {
              settleReject(toError(fbError, toError(error, timeoutError)));
            });
        } catch (fbError) {
          settleReject(toError(fbError, toError(error, timeoutError)));
        }
        return;
      }

      if (allowUndefined) {
        // For environment-module we permit resolving to undefined if no fallback is provided.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error allow undefined fallback for environment timeouts
        settleResolve(undefined);
        return;
      }

      settleReject(toError(error, timeoutError));
    };

    const handleTimeout = () => {
      if (settled) return;
      clearTimer();
      // eslint-disable-next-line no-console
      console.warn('[Boot][withTimeout] timed out:', label, '→ using fallback');
      runFallback(timeoutError, label === 'environment-module');
    };

    timer = setTimeout(handleTimeout, timeoutMs);

    p.then(
      (value) => {
        settleResolve(value);
      },
      (error) => {
        if (settled) return;
        clearTimer();
        runFallback(error, label === 'environment-module');
      }
    );
  });
}
