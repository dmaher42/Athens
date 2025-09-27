function ensureTrailingSlash(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '/';
  }

  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeBaseCandidate(candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  // Allow fully-qualified URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const absolute = new URL(trimmed);
      return ensureTrailingSlash(absolute.pathname || '/');
    } catch (error) {
      console.warn('[asset-paths] Invalid absolute BASE_URL candidate.', error);
      return null;
    }
  }

  // Treat relative references (./ or ../) as rooted at the current location if possible
  if (/^(\.\/?)+/.test(trimmed)) {
    if (typeof location !== 'undefined' && typeof location.href === 'string') {
      try {
        const relative = new URL(trimmed, location.href);
        return ensureTrailingSlash(relative.pathname || '/');
      } catch (error) {
        console.warn('[asset-paths] Unable to resolve relative BASE_URL candidate.', error);
      }
    }
    const sanitized = trimmed.replace(/^\.\//, '/');
    return ensureTrailingSlash(sanitized.startsWith('/') ? sanitized : `/${sanitized}`);
  }

  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return ensureTrailingSlash(prefixed);
}

function computeFromEnv() {
  if (typeof import.meta === 'undefined') {
    return null;
  }
  const env = import.meta.env ?? null;
  const base = env && typeof env.BASE_URL === 'string' ? env.BASE_URL : null;
  return normalizeBaseCandidate(base);
}

function computeFromLocation() {
  if (typeof location === 'undefined' || typeof location.pathname !== 'string') {
    return null;
  }

  const { pathname } = location;
  if (!pathname) {
    return '/';
  }

  if (pathname.endsWith('/')) {
    return ensureTrailingSlash(pathname);
  }

  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash < 0) {
    return '/';
  }

  const basePath = pathname.slice(0, lastSlash + 1) || '/';
  return ensureTrailingSlash(basePath);
}

function computeFromModuleUrl() {
  if (typeof import.meta === 'undefined' || typeof import.meta.url !== 'string') {
    return null;
  }

  try {
    const moduleUrl = new URL(import.meta.url);
    const pathname = moduleUrl.pathname || '/';

    if (pathname.includes('/public/')) {
      const index = pathname.indexOf('/public/');
      return ensureTrailingSlash(pathname.slice(0, index + 1));
    }

    if (pathname.includes('/src/')) {
      const index = pathname.indexOf('/src/');
      return ensureTrailingSlash(pathname.slice(0, index + 1));
    }

    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash >= 0) {
      return ensureTrailingSlash(pathname.slice(0, lastSlash + 1) || '/');
    }
  } catch (error) {
    console.warn('[asset-paths] Unable to infer base from module URL.', error);
  }

  return null;
}

let assetBaseSource = 'fallback:/';

function computeAssetBaseUrl() {
  const fromEnv = computeFromEnv();
  if (fromEnv) {
    assetBaseSource = 'env:BASE_URL';
    return fromEnv;
  }

  const fromLocation = computeFromLocation();
  if (fromLocation) {
    assetBaseSource = 'location.pathname';
    return fromLocation;
  }

  const fromModuleUrl = computeFromModuleUrl();
  if (fromModuleUrl) {
    assetBaseSource = 'import.meta.url';
    return fromModuleUrl;
  }

  assetBaseSource = 'fallback:/';
  return '/';
}

const ASSET_BASE = computeAssetBaseUrl();

export function getAssetBase() {
  return ASSET_BASE;
}

export function getAssetBaseSource() {
  return assetBaseSource;
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

export { ASSET_BASE, computeAssetBaseUrl };

try {
  const scope = typeof globalThis !== 'undefined' ? globalThis : undefined;
  if (scope) {
    scope.__AthensAssetBase = { value: ASSET_BASE, source: assetBaseSource };
  }
} catch (_) {
  // ignore write errors on locked globals
}
