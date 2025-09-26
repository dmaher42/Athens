const CACHE_NAME = 'athens-static-v1';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(precacheUrls))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    // Allow the browser to handle cross-origin requests (e.g. CDN assets).
    return;
  }

  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  try {
    const networkResponse = await fetch(request);
    if (isCacheable(networkResponse)) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      const offlineShell = await cache.match(INDEX_URL);
      if (offlineShell) {
        return offlineShell;
      }
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}
