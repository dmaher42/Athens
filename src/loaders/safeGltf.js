import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ACCEPTED_TYPES = ['application/octet-stream', 'model/gltf-binary'];

function normalizeError(error) {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message || error.toString();
  return String(error);
}

async function verifyUrl(url) {
  if (typeof fetch !== 'function') {
    return { verified: false, reason: null };
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const contentLengthHeader = response.headers.get('content-length');
    const resolvedUrl = response.url || url;
    const looksLikeGlb = resolvedUrl.toLowerCase().endsWith('.glb') || url.toLowerCase().endsWith('.glb');

    const hasAcceptedType = ACCEPTED_TYPES.some((type) => contentType.includes(type));

    if (!hasAcceptedType) {
      const lengthValue = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
      if (!(looksLikeGlb && Number.isFinite(lengthValue) && lengthValue > 1024)) {
        throw new Error(`Unexpected response for ${resolvedUrl} (type: ${contentType || 'unknown'}, length: ${contentLengthHeader || 'unknown'})`);
      }
    }

    return { verified: true, reason: null };
  } catch (error) {
    if (error instanceof Error && /HTTP\s+\d+/.test(error.message)) {
      throw new Error(`GLB request failed (${error.message}) for ${url}`);
    }

    return { verified: false, reason: error };
  }
}

export async function loadGLTF(url, { dracoLoader } = {}) {
  if (!url) {
    throw new Error('GLTF URL is required');
  }

  const { verified, reason } = await verifyUrl(url);

  const loader = new GLTFLoader();
  if (dracoLoader) {
    loader.setDRACOLoader(dracoLoader);
  }

  try {
    return await loader.loadAsync(url);
  } catch (error) {
    if (!verified && reason) {
      const verifyMessage = normalizeError(reason);
      throw new Error(`Failed to load GLB at ${url}: ${verifyMessage}`);
    }
    const message = normalizeError(error);
    throw new Error(`Failed to load GLB at ${url}: ${message}`);
  }
}

export default loadGLTF;
