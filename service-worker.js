const NETWORK_ERROR_STATUS = 520;

self.addEventListener('install', (event) => {
  // Activate immediately so fixes apply without requiring a reload cycle.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests. Let the browser deal with other HTTP verbs so
  // we do not interfere with APIs like Firebase auth token refreshes.
  if (event.request.method !== 'GET') {
    return;
  }

  // Some browser requests (notably for extension assets) use the
  // `only-if-cached` cache mode with a cross-origin URL. Those cannot be
  // fulfilled via fetch(), so we must ignore them or the service worker will
  // throw.
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const response = await fetch(request);

    // Guard against misbehaving fetch implementations that might return
    // undefined. The FetchEvent infrastructure expects an actual Response
    // instance.
    if (response instanceof Response) {
      return response;
    }

    return new Response('', {
      status: 502,
      statusText: 'Invalid fetch response returned by service worker'
    });
  } catch (error) {
    // Provide a well-formed Response so the browser does not reject the
    // FetchEvent promise. This prevents the "Failed to convert value to
    // Response" error that previously surfaced when network failures
    // bubbled up unhandled.
    const body = JSON.stringify({
      error: 'network-failure',
      message: error?.message ?? 'Unknown network error'
    });

    return new Response(body, {
      status: NETWORK_ERROR_STATUS,
      statusText: 'Network request failed',
      headers: {
        'content-type': 'application/json'
      }
    });
  }
}
