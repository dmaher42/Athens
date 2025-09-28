import { resolveAssetUrl } from '../utils/asset-paths.js';

const DEFAULT_GEOJSON_PATH = 'data/athens_places.geojson';

function normalizeGeoJsonUrl(url) {
    if (typeof url !== 'string' || !url) {
        return resolveAssetUrl(DEFAULT_GEOJSON_PATH);
    }

    const trimmed = url.trim();
    if (!trimmed) {
        return resolveAssetUrl(DEFAULT_GEOJSON_PATH);
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return resolveAssetUrl(trimmed);
}

/**
 * Fetches a GeoJSON feature collection containing places around Athens.
 *
 * @param {string} [url=DEFAULT_GEOJSON_PATH] - Path to the GeoJSON file.
 * @param {typeof fetch} [fetchImpl=globalThis.fetch] - Custom fetch implementation (useful for tests).
 * @returns {Promise<object>} The parsed GeoJSON data.
 */
export async function loadGeoJson(url = DEFAULT_GEOJSON_PATH, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('A valid fetch implementation must be provided');
    }

    const targetUrl = normalizeGeoJsonUrl(url);

    const response = await fetchImpl(targetUrl, {
        headers: {
            'Accept': 'application/geo+json, application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to load GeoJSON from ${targetUrl}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export { DEFAULT_GEOJSON_PATH };
