const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

type EnvSource = { [key: string]: unknown } | undefined;

function readBaseFromEnv(importEnv: EnvSource, globalEnv: EnvSource): string | undefined {
  if (importEnv && typeof importEnv === 'object' && typeof importEnv.BASE_URL === 'string') {
    return importEnv.BASE_URL;
  }

  if (globalEnv && typeof globalEnv === 'object' && typeof globalEnv.BASE_URL === 'string') {
    return globalEnv.BASE_URL;
  }

  if (typeof globalThis !== 'undefined') {
    const scoped = globalThis as Record<string, unknown>;
    const windowBase = scoped.window && typeof (scoped.window as any).__ATHENS_BASE__ === 'string'
      ? (scoped.window as any).__ATHENS_BASE__
      : undefined;
    if (windowBase) {
      return windowBase;
    }

    if (typeof scoped.__ATHENS_BASE__ === 'string') {
      return scoped.__ATHENS_BASE__ as string;
    }

    const swEnv = scoped.__ATHENS_SW_ENV__;
    if (swEnv && typeof swEnv === 'object' && typeof (swEnv as any).BASE_URL === 'string') {
      return (swEnv as any).BASE_URL;
    }
  }

  return undefined;
}

export function resolveBaseUrl(overrides?: { importEnv?: EnvSource; globalEnv?: EnvSource }): string {
  const importEnv = overrides?.importEnv ?? (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined);
  const globalEnv = overrides?.globalEnv;

  const candidate = readBaseFromEnv(importEnv, globalEnv);
  if (typeof candidate === 'string' && candidate.length) {
    return candidate;
  }

  return '/';
}

function ensureTrailingSlash(base: string): string {
  if (!base) {
    return '/';
  }

  if (ABSOLUTE_URL_REGEX.test(base)) {
    return base.endsWith('/') ? base : `${base}/`;
  }

  return base.endsWith('/') ? base : `${base}/`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/^\/+/, '');
}

export function buildBaseRelativeUrl(
  relativePath: string,
  overrides?: { importEnv?: EnvSource; globalEnv?: EnvSource }
): string {
  if (typeof relativePath !== 'string') {
    return resolveBaseUrl(overrides);
  }

  if (ABSOLUTE_URL_REGEX.test(relativePath)) {
    return relativePath;
  }

  const base = resolveBaseUrl(overrides);
  const normalizedBase = ensureTrailingSlash(base);
  const normalizedRelative = normalizeRelativePath(relativePath);

  if (ABSOLUTE_URL_REGEX.test(normalizedBase)) {
    return new URL(normalizedRelative, normalizedBase).toString();
  }

  const combined = `${normalizedBase}${normalizedRelative}`;
  return combined.replace(/\/{2,}/g, '/');
}

