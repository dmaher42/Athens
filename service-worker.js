// ---- service-worker.js ----

const CACHE_NAME = 'athens-static-v9';
const ASSET_EXT = /\.(?:js|css|html|json|wasm|png|jpg|jpeg|webp|gif|svg|ico|mp3|wav|ogg|flac|glb|gltf|ktx2|hdr|bin|txt)(\?.*)?$/i;

const INDEX_CACHE_KEY = (() => {
  try {
    const scope = self?.registration?.scope ?? self?.location?.origin ?? '/';
    return new URL('index.html', scope).href;
  } catch (error) {
    return '/index.html';
  }
})();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const precache = caches.open(CACHE_NAME).then((cache) => cache.addAll([])).catch(() => {});
  event.waitUntil(precache);
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
      );
    } catch (error) {
      // ignore cache cleanup errors
    }
    try {
      await self.clients.claim();
    } catch (error) {
      // ignore claim failures
    }
  })());
});

function isHtmlRequest(request) {
  if (!request) {
    return false;
  }
  if (request.mode === 'navigate') {
    return true;
  }
  const accept = request.headers?.get?.('accept') ?? '';
  return accept.includes('text/html');
}

function putInCache(request, response) {
  if (!request || !response) {
    return Promise.resolve();
  }
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch(() => {});
}

function putIndexInCache(response) {
  if (!response) {
    return Promise.resolve();
  }
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(INDEX_CACHE_KEY, response))
    .catch(() => {});
}

async function matchInCache(request, options) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(request, options);
    if (match) {
      return match;
    }
  } catch (error) {
    // ignore cache lookup errors
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    return;
  }

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  if (isHtmlRequest(request)) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          event.waitUntil(putIndexInCache(clone));
        }
        return networkResponse;
      } catch (error) {
        const cached = await matchInCache(INDEX_CACHE_KEY, { ignoreSearch: true });
        if (cached) {
          return cached;
        }
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    })());
    return;
  }

  const isStaticAsset = ASSET_EXT.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          event.waitUntil(putInCache(request, clone));
        }
        return networkResponse;
      } catch (error) {
        const cached = await matchInCache(request, { ignoreSearch: true });
        if (cached) {
          return cached;
        }
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (error) {
      const cached = await matchInCache(request, { ignoreSearch: true });
      if (cached) {
        return cached;
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
