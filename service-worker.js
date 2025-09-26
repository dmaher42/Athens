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
    const message = extractErrorMessage(error);
    const body = safeStringify({
      error: 'network-failure',
      message
    });

    try {
      return new Response(body, {
        status: NETWORK_ERROR_STATUS,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (responseError) {
      // If constructing the JSON response fails for any reason (for example,
      // due to an unexpected body type restriction in the runtime) fall back
      // to a minimal empty response so the promise still resolves with a
      // Response instance.
      console.warn('service-worker: falling back to empty response', responseError);

      return new Response('', {
        status: NETWORK_ERROR_STATUS
      });
    }
  }
}

function extractErrorMessage(error) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const name = error.name;
    if (typeof name === 'string' && name.trim()) {
      return name;
    }
  }

  return 'Unknown network error';
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (stringifyError) {
    console.warn('service-worker: failed to serialise error payload', stringifyError);
    return '{"error":"network-failure","message":"Unknown network error"}';
  }
}
