import { buildBaseRelativeUrl, resolveBaseUrl } from './utils/baseUrl.ts';

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  const globalEnv =
    typeof globalThis !== 'undefined' && globalThis
      ? (globalThis as { __ATHENS_SW_ENV__?: Record<string, unknown> }).__ATHENS_SW_ENV__
      : undefined;
  const importEnv = (import.meta ?? {})?.env as Record<string, unknown> | undefined;
  const resolvedDev =
    typeof importEnv?.DEV !== 'undefined' ? importEnv.DEV : globalEnv?.DEV;

  const isDev = Boolean(resolvedDev);
  const scopeBase = resolveBaseUrl({ importEnv, globalEnv });
  const normalizedScope = scopeBase.endsWith('/') ? scopeBase : `${scopeBase}/`;
  const swUrl = buildBaseRelativeUrl('service-worker.js', { importEnv, globalEnv });

  if (isDev) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {}
    return;
  }

  try {
    const head = await fetch(swUrl, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return; // file missing -> skip without error
  } catch {
    return; // network issue -> skip without blocking boot
  }

  try {
    const registration = navigator.serviceWorker.register(swUrl, { scope: normalizedScope });
    if (registration && typeof (registration as Promise<unknown>).catch === 'function') {
      (registration as Promise<unknown>).catch(() => {});
    }
  } catch {
    // swallow: SW is optional, never block boot
  }
}
