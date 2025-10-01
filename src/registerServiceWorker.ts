export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  const globalEnv =
    typeof globalThis !== 'undefined' && globalThis
      ? (globalThis as { __ATHENS_SW_ENV__?: Record<string, unknown> }).__ATHENS_SW_ENV__
      : undefined;
  const importEnv = (import.meta ?? {})?.env as Record<string, unknown> | undefined;
  const resolvedDev =
    typeof importEnv?.DEV !== 'undefined' ? importEnv.DEV : globalEnv?.DEV;
  const resolvedBase =
    typeof importEnv?.BASE_URL === 'string'
      ? importEnv.BASE_URL
      : typeof globalEnv?.BASE_URL === 'string'
        ? (globalEnv.BASE_URL as string)
        : '/';

  const isDev = Boolean(resolvedDev);
  const baseUrl = resolvedBase;

  if (isDev) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {}
    return;
  }

  const url = `${baseUrl}service-worker.js`;

  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return; // file missing -> skip without error
  } catch {
    return; // network issue -> skip without blocking boot
  }

  try {
    await navigator.serviceWorker.register(url, { scope: baseUrl });
  } catch {
    // swallow: SW is optional, never block boot
  }
}
