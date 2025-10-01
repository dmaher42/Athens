import { USE_REMOTE } from '../config/flags';
import { logger } from '../utils/logger.ts';

if (typeof window !== 'undefined' && !USE_REMOTE) {
  (function () {
    const blocked = [
      'script.google.com/macros/',
      'firestore.googleapis.com',
      'www.google.com/images/cleardot.gif'
    ];
    const origFetch = window.fetch;
    if (typeof origFetch !== 'function') {
      return;
    }
    window.fetch = async function (input, _init) {
      const url = String(input instanceof Request ? input.url : input);
      if (blocked.some((p) => url.includes(p))) {
        logger.warn('[remote blocked]', url);
        return new Response(JSON.stringify({ ok: false, blocked: true }), {
          status: 499,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch.apply(this, arguments);
    };
  })();

  (function () {
    const candidateFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (!candidateFetch) {
      return;
    }

    try {
      const base = (import.meta?.env?.BASE_URL ?? window.__ATHENS_BASE__ ?? '/');
      const swUrl = new URL(`${base}service-worker.js`, window.location.href).toString();

      Promise.resolve()
        .then(() =>
          candidateFetch(swUrl, { method: 'HEAD', cache: 'no-store' }).catch(() => {
            // Optional probe: absence of the service worker is allowed.
          })
        )
        .catch(() => {});
    } catch (error) {
      if (import.meta?.env?.DEV) {
        logger.warn('[remote guard] service worker probe skipped', error);
      }
    }
  })();
}
