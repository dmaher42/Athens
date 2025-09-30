const ABSOLUTE_URL_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

function resolveBaseUrl() {
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

export function assetUrl(rel) {
  const base = resolveBaseUrl();

  if (ABSOLUTE_URL_REGEX.test(rel)) {
    return rel;
  }

  if (ABSOLUTE_URL_REGEX.test(base)) {
    return new URL(rel, base).toString();
  }

  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedRel = rel.replace(/^\/+/, '');
  const combined = normalizedBase + normalizedRel;

  return combined.replace(/\/{2,}/g, '/');
}
