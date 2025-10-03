export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  fallback?: () => T | Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout:${label}`));
    }, ms);
  });

  try {
    return await Promise.race([p, timeoutPromise]);
  } catch (error) {
    const isTimeoutError =
      error instanceof Error ? error.message === `timeout:${label}` : false;

    if (!isTimeoutError) {
      throw error;
    }

    console.warn('[Athens][Boot] timed out:', label, error);
    if (fallback) {
      return await fallback();
    }

    throw error;
  } finally {
    if (typeof timer !== 'undefined') {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
  }
}
