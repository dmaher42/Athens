const envBase =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  typeof import.meta.env.BASE_URL === 'string' &&
  import.meta.env.BASE_URL.length > 0
    ? import.meta.env.BASE_URL
    : null;

const inferredBase = envBase
  ? envBase
  : (typeof location !== 'undefined' && typeof location.pathname === 'string' && location.pathname.startsWith('/Athens/'))
    ? '/Athens/'
    : '/';

const ASSET_BASE = inferredBase.endsWith('/') ? inferredBase : `${inferredBase}/`;

export function getAssetBase() {
  return ASSET_BASE;
}

export function resolveAssetUrl(path = '') {
  if (!path) {
    return ASSET_BASE;
  }

  let sanitized = `${path}`.trim();
  if (!sanitized) {
    return ASSET_BASE;
  }

  while (sanitized.startsWith('../')) {
    sanitized = sanitized.slice(3);
  }

  while (sanitized.startsWith('./')) {
    sanitized = sanitized.slice(2);
  }

  sanitized = sanitized.replace(/^\/+/, '');

  if (sanitized.startsWith('public/')) {
    sanitized = sanitized.slice('public/'.length);
  }

  return `${ASSET_BASE}${sanitized}`;
}

export { ASSET_BASE };
