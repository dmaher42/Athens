import { USE_REMOTE } from '../config/flags';

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
    window.fetch = async function (input, init) {
      const url = String(input instanceof Request ? input.url : input);
      if (blocked.some((p) => url.includes(p))) {
        console.warn('[remote blocked]', url);
        return new Response(JSON.stringify({ ok: false, blocked: true }), {
          status: 499,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return origFetch.apply(this, arguments);
    };
  })();
}
