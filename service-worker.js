// ---- service-worker.js ----

// Bump this whenever you change the SW to force an update
const CACHE_NAME = 'athens-static-v4';

// Optional pre-cache list (can stay empty for GH Pages)
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function safeNetwork(req) {
  try {
    return await fetch(req);
  } catch (err) {
    // Always return a Response so respondWith never rejects
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

  // Only cache same-origin GET requests. Pass others straight through (safely).
  if (req.method !== 'GET' || !isSameOrigin) {
    event.respondWith(safeNetwork(req));
    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(req);
      if (cached) return cached;

      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const wantsHtml = req.destination === 'document' || req.headers.get('accept')?.includes('text/html');
      if (wantsHtml) {
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
