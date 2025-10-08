const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

function resolveBaseUrl(): string {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta &&
    import.meta.env &&
    typeof import.meta.env.BASE_URL === 'string'
  ) {
    return import.meta.env.BASE_URL;
  }

  if (
    typeof process !== 'undefined' &&
    process &&
    process.env &&
    typeof process.env.BASE_URL === 'string'
  ) {
    return process.env.BASE_URL;
  }

  return '/';
}

function normalizeBase(base: string): string {
  if (!base) {
    return '/';
  }

  if (ABSOLUTE_URL_REGEX.test(base)) {
    return base.endsWith('/') ? base : `${base}/`;
  }

  return base.endsWith('/') ? base : `${base}/`;
}

function normalizeRelativePath(rel: string): string {
  if (!rel) {
    return '';
  }

  return rel.replace(/^\/+/, '');
}

export function assetUrl(relPath: string): string {
  const rel = typeof relPath === 'string' ? relPath : '';

  if (!rel) {
    const base = normalizeBase(resolveBaseUrl());
    return ABSOLUTE_URL_REGEX.test(base) ? base : base.replace(/\/{2,}/g, '/');
  }

  if (ABSOLUTE_URL_REGEX.test(rel)) {
    return rel;
  }

  const base = normalizeBase(resolveBaseUrl());
  if (ABSOLUTE_URL_REGEX.test(base)) {
    return new URL(normalizeRelativePath(rel), base).toString();
  }

  const combined = `${base}${normalizeRelativePath(rel)}`;
  return combined.replace(/\/{2,}/g, '/');
}

export default assetUrl;
