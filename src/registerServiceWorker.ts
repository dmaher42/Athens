function resolveEnv(): { BASE_URL?: string; DEV?: boolean } {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      return import.meta.env as { BASE_URL?: string; DEV?: boolean };
    }
  } catch (error) {
    // ignore inability to access import.meta
  }

  if (typeof globalThis !== 'undefined' && (globalThis as any).__ATHENS_IMPORT_META_ENV__) {
    return (globalThis as any).__ATHENS_IMPORT_META_ENV__;
  }

  return {};
}

function normalizeBaseUrl(base: string | undefined): string {
  if (!base) {
    return '/';
  }
  return base.endsWith('/') ? base : `${base}/`;
}

export function setupServiceWorker(env: { BASE_URL?: string; DEV?: boolean } = resolveEnv()): Promise<void> | void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  const sw = navigator.serviceWorker;
  if (!sw) {
    return;
  }

  const baseUrl = normalizeBaseUrl(env?.BASE_URL);
  const isDev = Boolean(env?.DEV);

  if (isDev) {
    return sw
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister().catch(() => {}))))
      .then(() => {})
      .catch(() => {});
  }

  const registerOnLoad = () => {
    sw.register(`${baseUrl}service-worker.js`).catch(() => {});
  };

  window.addEventListener('load', registerOnLoad, { once: true });
  return;
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.serviceWorker) {
  setupServiceWorker();
}
