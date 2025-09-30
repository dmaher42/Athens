export const logger = {
  info: (...a: any[]) => (import.meta.env.DEV ? console.info(...a) : void 0),
  warn: (...a: any[]) => (import.meta.env.DEV ? console.warn(...a) : void 0),
  error: (...a: any[]) => console.error(...a), // keep errors
};
