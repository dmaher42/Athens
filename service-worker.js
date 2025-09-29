const CACHE_NAME = 'athens-static-v2';
const INDEX_URL = new URL('index.html', self.registration.scope).toString();

function isCacheable(response) {
  return (
    response &&
    response.status === 200 &&
    (response.type === 'basic' || response.type === 'default')
  );
}

self.addEventListener('install', (event) => {
  const precacheUrls = [INDEX_URL, self.registration.scope];
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(precacheUrls);
      } catch (error) {
        console.warn('Service Worker precache skipped (likely offline).', error);
      }
    } catch (error) {
      console.warn('Service Worker failed to open cache during install.', error);
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    } catch (error) {
      console.warn('Service Worker activation cleanup failed.', error);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (req.method !== 'GET' || !isSameOrigin) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ ok: false }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  event.respondWith((async () => {
    try {
      const cached = await caches.match(req);
      if (cached) {
        return cached;
      }

      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      if (isCacheable(res)) {
        cache.put(req, res.clone()).catch((error) => {
          console.warn('Service Worker failed to cache response.', error);
        });
      }
      return res;
    } catch (error) {
      console.warn('Service Worker fetch failed, providing fallback response.', error);
      const isDocument =
        req.destination === 'document' || req.headers.get('accept')?.includes('text/html');

      if (isDocument) {
        let offlineShell = null;
        try {
          const cache = await caches.open(CACHE_NAME);
          offlineShell = await cache.match(INDEX_URL);
        } catch (cacheError) {
          console.warn('Service Worker failed to retrieve offline shell.', cacheError);
        }
        if (offlineShell) {
          return offlineShell;
        }
        return new Response('<h1>Offline</h1><p>Network error.</p>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      }

      return new Response(JSON.stringify({ ok: false, error: 'network-error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  })());
});
