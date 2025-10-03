export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  fallback?: (error: unknown) => T | Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error(`timeout:${label}`);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError);
    }, ms);
  });

  try {
    return await Promise.race([p, timeoutPromise]);
  } catch (error) {
    if (fallback) {
      console.warn(
        `[Athens][Boot] ${label} timed out after ${ms}ms; running fallback.`,
        error
      );
      return await fallback(error);
    }

    throw (error instanceof Error ? error : timeoutError);
  } finally {
    if (typeof timer !== 'undefined') {
      clearTimeout(timer);
    }
  }
}
