// ---- service-worker.js (drop-in) ----

// Bump this whenever you ship SW changes (forces update)
const CACHE_NAME = 'athens-static-v2';

// Precache (optional). You can add core assets here if you want offline.
// For GH Pages, keeping this empty is fine; we’ll cache on first fetch.
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  // Immediately activate the new SW
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    // Control all pages without reload
    await self.clients.claim();
  })());
});

// Helper: always return a Response object (never let respondWith reject)
async function safeNetwork(req) {
  try {
    return await fetch(req);
  } catch (err) {
    // Non-document fallback: JSON 502 so the promise resolves
    return new Response(JSON.stringify({ ok: false, error: 'network-error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Only cache same-origin GETs. Let cross-origin & non-GET go straight to network.
  if (req.method !== 'GET' || !isSameOrigin) {
    event.respondWith(safeNetwork(req));
    return;
  }

  event.respondWith((async () => {
    try {
      // 1) Cache-first for same-origin GETs
      const cached = await caches.match(req);
      if (cached) return cached;

      // 2) Network, then populate cache
      const res = await fetch(req);
      // Only cache successful/basic responses
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // 3) Final fallback — always return a Response (no rejected promise)
      const acceptsHtml = req.destination === 'document' || req.headers.get('accept')?.includes('text/html');
      if (acceptsHtml) {
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Network error.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } }
        );
      }
      return new Response(JSON.stringify({ ok: false, error: 'offline' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  })());
});
