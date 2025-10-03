const isDevelopmentEnvironment = (() => {
  try {
    return Boolean(import.meta?.env?.DEV);
  } catch (_) {
    return false;
  }
})();

export const logger = {
  info: (...a: any[]) => (isDevelopmentEnvironment ? console.info(...a) : void 0),
  warn: (...a: any[]) => (isDevelopmentEnvironment ? console.warn(...a) : void 0),
  error: (...a: any[]) => console.error(...a), // keep errors
};
