const FEATURE_OFFSETS = new Map([
    [
        'parthenon',
        {
            /** Approximate longitudinal offset in degrees eastward */
            deltaLon: 0.0004,
            /** Approximate latitudinal offset in degrees northward */
            deltaLat: 0.0003
        }
    ]
]);

function normalizeFeatureName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

export function getFeatureOffset(name) {
    const normalized = normalizeFeatureName(name ?? '');
    if (!normalized) {
        return null;
    }
    return FEATURE_OFFSETS.get(normalized) ?? null;
}

export function resolveFeatureOffset(properties = {}, fallbackName) {
    const candidates = [];
    if (typeof properties.title === 'string') {
        candidates.push(properties.title);
    }
    if (typeof properties.name === 'string') {
        candidates.push(properties.name);
    }
    if (typeof fallbackName === 'string') {
        candidates.push(fallbackName);
    }

    for (const candidate of candidates) {
        const offset = getFeatureOffset(candidate);
        if (offset) {
            return offset;
        }
    }
    return null;
}

export function applyFeatureOffset(coordinates, { properties = {}, fallbackName } = {}) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return coordinates;
    }
    const [lonRaw, latRaw, ...rest] = coordinates;
    const lon = Number(lonRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return coordinates;
    }

    const offset = resolveFeatureOffset(properties, fallbackName);
    if (!offset) {
        return [lon, lat, ...rest];
    }

    const deltaLon = Number.isFinite(offset.deltaLon) ? offset.deltaLon : 0;
    const deltaLat = Number.isFinite(offset.deltaLat) ? offset.deltaLat : 0;
    return [lon + deltaLon, lat + deltaLat, ...rest];
}

export { FEATURE_OFFSETS };
