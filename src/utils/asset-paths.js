function ensureTrailingSlash(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '/';
  }

  return value.endsWith('/') ? value : `${value}/`;
}

function computeModuleBase() {
  if (typeof import.meta === 'undefined' || !import.meta?.url) {
    return null;
  }

  try {
    const moduleUrl = new URL(import.meta.url);
    return new URL('../../', moduleUrl).href;
  } catch (error) {
    console.warn('[asset-paths] Unable to infer base from module URL.', error);
    return null;
  }
}

function computeLocationBase() {
  if (typeof location === 'undefined' || typeof location.pathname !== 'string') {
    return null;
  }

  const { pathname } = location;
  if (!pathname) {
    return '/';
  }

  if (pathname.endsWith('/')) {
    return pathname;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return '/';
  }

  const lastSegment = segments[segments.length - 1];
  const isFile = lastSegment.includes('.');
  if (isFile) {
    const lastSlash = pathname.lastIndexOf('/');
    return lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) || '/' : '/';
  }

  const hostname = typeof location.hostname === 'string' ? location.hostname : '';
  const isGitHubPages = /\.github\.io$/i.test(hostname);

  if (isGitHubPages) {
    return `/${segments[0]}/`;
  }

  if (segments.length === 1) {
    return `/${segments[0]}/`;
  }

  return `/${segments.slice(0, -1).join('/')}/`;
}

const envBase =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  typeof import.meta.env.BASE_URL === 'string' &&
  import.meta.env.BASE_URL.length > 0
    ? import.meta.env.BASE_URL
    : null;

const moduleBase = computeModuleBase();
const locationBase = computeLocationBase();

const inferredBase = envBase ?? moduleBase ?? locationBase ?? '/';

const ASSET_BASE = ensureTrailingSlash(inferredBase);

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
