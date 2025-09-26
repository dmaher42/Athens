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
  let cache;
  let cachedResponse;
  let cacheAvailable = true;

  try {
    cache = await caches.open(CACHE_NAME);
    cachedResponse = await cache.match(request);
  } catch (cacheError) {
    cacheAvailable = false;
    console.error('Service Worker cache access failed, falling back to network only.', cacheError);
  }

  try {
    const networkResponse = await fetch(request);
    if (cacheAvailable && cache && isCacheable(networkResponse)) {
      cache.put(request, networkResponse.clone()).catch((putError) => {
        console.error('Service Worker failed to update cache entry.', putError);
      });
    }
    return networkResponse;
  } catch (error) {
    console.error('Service Worker fetch failed, attempting to serve from cache.', error);

    if (cacheAvailable && cachedResponse) {
      return cachedResponse;
    }

    if (cacheAvailable && cache && request.mode === 'navigate') {
      try {
        const offlineShell = await cache.match(INDEX_URL);
        if (offlineShell) {
          return offlineShell;
        }
      } catch (shellError) {
        console.error('Service Worker failed to retrieve offline shell.', shellError);
      }
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}
