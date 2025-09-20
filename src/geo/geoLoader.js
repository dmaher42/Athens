const DEFAULT_GEOJSON_PATH = '/data/athens_places.geojson';

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

    const response = await fetchImpl(url, {
        headers: {
            'Accept': 'application/geo+json, application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to load GeoJSON from ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export { DEFAULT_GEOJSON_PATH };
