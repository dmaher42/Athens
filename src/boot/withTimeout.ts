type TimeoutFallback<T> = (error: unknown) => T | Promise<T>;

declare global {
  interface Window {
    __ATHENS_BOOT_TIMEOUT?: number;
  }
}

const resolveDebugTimeout = () => {
  if (typeof globalThis === 'undefined') return undefined;
  const candidate = (globalThis as typeof window | undefined)?.__ATHENS_BOOT_TIMEOUT;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
};

export async function withTimeout<T>(
  p: Promise<T>,
  ms: number | undefined,
  label: string,
  fallback?: TimeoutFallback<T>
): Promise<T> {
  const providedMs = typeof ms === 'number' && Number.isFinite(ms) ? ms : undefined;
  const debugOverrideMs = resolveDebugTimeout();
  const timeoutMs =
    label === 'environment-module'
      ? providedMs
        ? Math.max(providedMs, 5000)
        : 8000
      : debugOverrideMs ?? providedMs ?? 2500;
  const timeoutError = new Error(`timeout:${label}`);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finalize = (cb: () => void) => {
      if (!settled) {
        settled = true;
        cb();
      }
    };

    const clear = (timer?: ReturnType<typeof setTimeout>) => {
      if (typeof timer !== 'undefined') {
        clearTimeout(timer);
      }
    };

    const onResolve = (value: T) => {
      finalize(() => {
        clear(timer);
        resolve(value);
      });
    };

    const runFallback = async (error: unknown) => {
      if (!fallback) {
        reject(error instanceof Error ? error : timeoutError);
        return;
      }
      try {
        const next = await fallback(error);
        resolve(next);
      } catch (fbError) {
        reject(fbError instanceof Error ? fbError : error);
      }
    };

    const onReject = (error: unknown) => {
      finalize(() => {
        clear(timer);
        runFallback(error);
      });
    };

    const timer = setTimeout(() => {
      console.warn('[Boot][withTimeout] timed out:', label, '→ using fallback');
      if (label === 'environment-module') {
        clear(timer);
        if (fallback) {
          Promise.resolve(fallback(timeoutError)).then(resolve, reject);
        } else {
          // @ts-expect-error allow undefined fallback for env
          resolve(undefined);
        }
        settled = true;
        return;
      }
      onReject(timeoutError);
    }, timeoutMs);

    p.then(onResolve).catch(onReject);
  });
}
