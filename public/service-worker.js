const CACHE_NAME = 'athens-static-v1';
const ASSET_EXT = /\.(?:js|css|html|json|wasm|png|jpg|jpeg|webp|gif|svg|ico|mp3|wav|ogg|glb|gltf|ktx2|hdr)(\?.*)?$/i;

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bypass cross-origin (Firebase/analytics/CDNs) to avoid errors
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(
        () => new Response('', { status: 504, statusText: 'Gateway Timeout' })
      )
    );
    return;
  }

  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      if (ASSET_EXT.test(url.pathname)) {
        event.waitUntil((async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, net.clone());
          } catch {}
        })());
      }
      return net;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;

      if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        const indexHit = await cache.match(new Request(`${self.registration.scope}index.html`));
        if (indexHit) return indexHit;
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
