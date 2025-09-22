import { loadGeoJson } from '../geo/geoLoader.js';
import { LocalEquirectangularProjection } from '../geo/projection.js';

const DEFAULT_GEOJSON_URL = './data/athens_places.geojson';
const DEFAULT_CITY_WALL_BUFFER_METERS = 2.5;
const DEFAULT_LONG_WALL_BUFFER_METERS = 4;
const DEFAULT_CLIFF_SEGMENTS = 48;
const DEFAULT_CITY_POINT_RADIUS_METERS = 20000;
const DEFAULT_SLOPE_THRESHOLD = 0.35; // tangent of ~19 degrees
const DEFAULT_ACROPOLIS_MAJOR_RADIUS = 130; // metres (east-west)
const DEFAULT_ACROPOLIS_MINOR_RADIUS = 90;  // metres (north-south)

function isFiniteNumber(value) {
    return Number.isFinite(value);
}

function perpendicular({ x, y }) {
    return { x: -y, y: x };
}

function createRectangleAroundSegment(start, end, halfWidth) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || !isFiniteNumber(length)) {
        return null;
    }
    const direction = { x: dx / length, y: dy / length };
    const normal = perpendicular(direction);
    const offset = { x: normal.x * halfWidth, y: normal.y * halfWidth };
    return [
        { x: start.x + offset.x, y: start.y + offset.y },
        { x: end.x + offset.x, y: end.y + offset.y },
        { x: end.x - offset.x, y: end.y - offset.y },
        { x: start.x - offset.x, y: start.y - offset.y }
    ];
}

function createCirclePolygon(center, radius, segments = 16) {
    if (!isFiniteNumber(radius) || radius <= 0) {
        return null;
    }
    const count = Math.max(8, segments | 0);
    const points = [];
    for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
        });
    }
    return points;
}

function createEllipsePolygon(center, radiusX, radiusY, segments = DEFAULT_CLIFF_SEGMENTS) {
    if (!isFiniteNumber(radiusX) || !isFiniteNumber(radiusY) || radiusX <= 0 || radiusY <= 0) {
        return null;
    }
    const count = Math.max(12, segments | 0);
    const points = [];
    for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        points.push({
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY
        });
    }
    return points;
}

function computeBoundingBox(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
        if (!point) {
            continue;
        }
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
    }
    return { minX, maxX, minY, maxY };
}

function createPolygonRecord(points) {
    if (!Array.isArray(points) || points.length < 3) {
        return null;
    }
    const filtered = [];
    for (const point of points) {
        if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
            continue;
        }
        const last = filtered[filtered.length - 1];
        if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) {
            continue;
        }
        filtered.push({ x: point.x, y: point.y });
    }
    if (filtered.length < 3) {
        return null;
    }
    const bbox = computeBoundingBox(filtered);
    if (!isFiniteNumber(bbox.minX) || !isFiniteNumber(bbox.minY)) {
        return null;
    }
    return { points: filtered, bbox };
}

function pointInPolygon(point, polygon) {
    if (!polygon || !Array.isArray(polygon.points)) {
        return false;
    }
    const { bbox, points } = polygon;
    if (bbox) {
        if (point.x < bbox.minX || point.x > bbox.maxX || point.y < bbox.minY || point.y > bbox.maxY) {
            return false;
        }
    }
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const xi = points[i].x;
        const yi = points[i].y;
        const xj = points[j].x;
        const yj = points[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}

function squaredDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

function computeConvexHull(points) {
    if (!Array.isArray(points) || points.length < 3) {
        return points ?? [];
    }
    const sorted = points
        .filter((point) => isFiniteNumber(point?.x) && isFiniteNumber(point?.y))
        .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    if (sorted.length < 3) {
        return sorted;
    }
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const point = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

function bufferPolyline(points, options = {}) {
    const { buffer = 0, closed = false, capSegments = 12 } = options;
    const halfWidth = Math.max(0, buffer);
    if (!Array.isArray(points) || points.length < 2 || halfWidth === 0) {
        return [];
    }
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
        const start = points[i - 1];
        const end = points[i];
        const rect = createRectangleAroundSegment(start, end, halfWidth);
        if (rect) {
            const polygon = createPolygonRecord(rect);
            if (polygon) {
                segments.push(polygon);
            }
        }
    }
    if (closed) {
        const closingRect = createRectangleAroundSegment(points[points.length - 1], points[0], halfWidth);
        if (closingRect) {
            const polygon = createPolygonRecord(closingRect);
            if (polygon) {
                segments.push(polygon);
            }
        }
    }
    const circleSegments = Math.max(8, capSegments | 0);
    if (closed) {
        for (const point of points) {
            const circle = createCirclePolygon(point, halfWidth, circleSegments);
            const polygon = createPolygonRecord(circle);
            if (polygon) {
                segments.push(polygon);
            }
        }
    } else {
        const startCircle = createCirclePolygon(points[0], halfWidth, circleSegments);
        const endCircle = createCirclePolygon(points[points.length - 1], halfWidth, circleSegments);
        const startPolygon = createPolygonRecord(startCircle);
        const endPolygon = createPolygonRecord(endCircle);
        if (startPolygon) {
            segments.push(startPolygon);
        }
        if (endPolygon) {
            segments.push(endPolygon);
        }
    }
    return segments;
}

function findFeaturePoints(features, projector) {
    const points = [];
    for (const feature of features) {
        if (feature?.geometry?.type !== 'Point') {
            continue;
        }
        const [lon, lat] = feature.geometry.coordinates;
        const projected = projector.project({ lat, lon });
        points.push({
            world: projected,
            properties: feature.properties ?? {},
            feature
        });
    }
    return points;
}

function extractPolylines(features, projector, predicate) {
    const result = [];
    for (const feature of features) {
        const geometry = feature?.geometry;
        const properties = feature?.properties ?? {};
        if (!geometry) {
            continue;
        }
        if (geometry.type === 'LineString') {
            if (!predicate(properties)) {
                continue;
            }
            const line = geometry.coordinates
                .map(([lon, lat]) => projector.project({ lat, lon }))
                .filter((point) => isFiniteNumber(point?.x) && isFiniteNumber(point?.y));
            if (line.length >= 2) {
                result.push({ points: line, properties });
            }
        } else if (geometry.type === 'MultiLineString') {
            if (!predicate(properties)) {
                continue;
            }
            for (const segment of geometry.coordinates) {
                const line = segment
                    .map(([lon, lat]) => projector.project({ lat, lon }))
                    .filter((point) => isFiniteNumber(point?.x) && isFiniteNumber(point?.y));
                if (line.length >= 2) {
                    result.push({ points: line, properties });
                }
            }
        }
    }
    return result;
}

function averageGeoOrigin(features) {
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;
    for (const feature of features) {
        const geometry = feature?.geometry;
        if (!geometry) {
            continue;
        }
        if (geometry.type === 'Point') {
            const [lon, lat] = geometry.coordinates;
            if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
                sumLat += lat;
                sumLon += lon;
                count += 1;
            }
        }
    }
    if (count === 0) {
        return null;
    }
    return { lat: sumLat / count, lon: sumLon / count };
}

function normalizeSlopeSampler(slopeMap) {
    if (!slopeMap) {
        return null;
    }
    if (typeof slopeMap === 'function') {
        return slopeMap;
    }
    if (typeof slopeMap.sample === 'function') {
        return (x, y) => slopeMap.sample(x, y);
    }
    return null;
}

export class CollisionGeometry {
    constructor(options = {}) {
        this.options = {
            geoJsonUrl: options.geoJsonUrl ?? DEFAULT_GEOJSON_URL,
            cityWallBuffer: options.cityWallBuffer ?? DEFAULT_CITY_WALL_BUFFER_METERS,
            longWallBuffer: options.longWallBuffer ?? DEFAULT_LONG_WALL_BUFFER_METERS,
            cityPointRadius: options.cityPointRadius ?? DEFAULT_CITY_POINT_RADIUS_METERS,
            slopeThreshold: options.slopeThreshold ?? DEFAULT_SLOPE_THRESHOLD,
            acropolisRadii: options.acropolisRadii ?? {
                major: DEFAULT_ACROPOLIS_MAJOR_RADIUS,
                minor: DEFAULT_ACROPOLIS_MINOR_RADIUS
            }
        };
        this.projector = options.projector ?? null;
        this.cityWallPolygons = [];
        this.longWallPolygons = [];
        this.additionalPolygons = [];
        this.acropolisPolygons = [];
        this.allPolygons = [];
        this.namedLocations = new Map();
        this._slopeSampler = normalizeSlopeSampler(options.slopeMap);
        this._loaded = false;
    }

    async load(options = {}) {
        const geoJson = options.geoJson ?? (await loadGeoJson(options.geoJsonUrl ?? this.options.geoJsonUrl, options.fetchImpl));
        if (!geoJson || !Array.isArray(geoJson.features)) {
            throw new Error('CollisionGeometry: GeoJSON feature collection required');
        }
        const features = geoJson.features;
        if (!this.projector) {
            const origin = options.origin ?? averageGeoOrigin(features);
            if (!origin) {
                throw new Error('CollisionGeometry: Unable to infer origin for projection');
            }
            this.projector = options.projector ?? new LocalEquirectangularProjection({ origin });
        }
        if (options.projector) {
            this.projector = options.projector;
        }
        this.cityWallPolygons = [];
        this.longWallPolygons = [];
        this.additionalPolygons = [];
        this.acropolisPolygons = [];
        this.allPolygons = [];
        this.namedLocations.clear();

        this._ingestPoints(features);
        this._buildCityWall(features);
        this._buildLongWalls(features);
        this._buildAcropolis(features);

        this.allPolygons = [
            ...this.cityWallPolygons,
            ...this.longWallPolygons,
            ...this.additionalPolygons
        ];
        this._loaded = true;
        return this;
    }

    setSlopeMap(slopeMap, threshold = this.options.slopeThreshold) {
        this._slopeSampler = normalizeSlopeSampler(slopeMap);
        if (isFiniteNumber(threshold)) {
            this.options.slopeThreshold = threshold;
        }
    }

    isWalkable(x, y) {
        if (!this._loaded) {
            return true;
        }
        if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
            return false;
        }
        const point = { x, y };
        if (this._slopeSampler) {
            for (const polygon of this.acropolisPolygons) {
                if (pointInPolygon(point, polygon)) {
                    const slope = this._slopeSampler(x, y);
                    if (!isFiniteNumber(slope)) {
                        return false;
                    }
                    if (slope > this.options.slopeThreshold) {
                        return false;
                    }
                    // Within polygon but slope acceptable -> treat as walkable, continue checks for other blockers.
                    break;
                }
            }
        } else {
            for (const polygon of this.acropolisPolygons) {
                if (pointInPolygon(point, polygon)) {
                    return false;
                }
            }
        }
        for (const polygon of this.allPolygons) {
            if (pointInPolygon(point, polygon)) {
                return false;
            }
        }
        return true;
    }

    _ingestPoints(features) {
        const points = findFeaturePoints(features, this.projector);
        for (const item of points) {
            const name = item.properties?.name;
            if (typeof name === 'string') {
                this.namedLocations.set(name, item.world);
            }
        }
    }

    _buildCityWall(features) {
        const predicate = (properties) => {
            const kind = typeof properties.kind === 'string' ? properties.kind.toLowerCase() : '';
            if (kind.includes('city_wall') || kind.includes('fortification')) {
                return true;
            }
            const name = typeof properties.name === 'string' ? properties.name.toLowerCase() : '';
            return name.includes('city wall');
        };
        const polylines = extractPolylines(features, this.projector, predicate);
        if (polylines.length > 0) {
            for (const line of polylines) {
                const polygons = bufferPolyline(line.points, {
                    buffer: this.options.cityWallBuffer,
                    closed: false
                });
                this.cityWallPolygons.push(...polygons);
            }
            return;
        }
        const acropolis = this.namedLocations.get('Acropolis of Athens');
        const fallbackOrigin = acropolis ?? this._computeCentroidFromPoints();
        if (!fallbackOrigin) {
            return;
        }
        const cityCandidates = [];
        for (const [name, location] of this.namedLocations.entries()) {
            const properties = { name };
            const distance = Math.sqrt(squaredDistance(location, fallbackOrigin));
            const withinWallsFlag = features.find(
                (feature) =>
                    feature?.properties?.name === name &&
                    feature.properties.within_walls !== undefined
            )?.properties?.within_walls;
            const include = withinWallsFlag !== false && distance <= this.options.cityPointRadius;
            if (include) {
                cityCandidates.push(location);
            }
        }
        if (cityCandidates.length < 3) {
            return;
        }
        const hull = computeConvexHull(cityCandidates);
        if (hull.length < 3) {
            return;
        }
        const polygons = bufferPolyline(hull, {
            buffer: this.options.cityWallBuffer,
            closed: true
        });
        this.cityWallPolygons.push(...polygons);
    }

    _computeCentroidFromPoints() {
        if (this.namedLocations.size === 0) {
            return null;
        }
        let sumX = 0;
        let sumY = 0;
        for (const point of this.namedLocations.values()) {
            sumX += point.x;
            sumY += point.y;
        }
        return { x: sumX / this.namedLocations.size, y: sumY / this.namedLocations.size };
    }

    _buildLongWalls(features) {
        const predicate = (properties) => {
            const kind = typeof properties.kind === 'string' ? properties.kind.toLowerCase() : '';
            if (kind.includes('wall_corridor') || kind.includes('long_wall')) {
                return true;
            }
            const name = typeof properties.name === 'string' ? properties.name.toLowerCase() : '';
            return name.includes('long wall') || name.includes('phaleric wall') || name.includes('makra teiche');
        };
        const polylines = extractPolylines(features, this.projector, predicate);
        for (const line of polylines) {
            const polygons = bufferPolyline(line.points, {
                buffer: this.options.longWallBuffer,
                closed: false
            });
            this.longWallPolygons.push(...polygons);
        }
    }

    _buildAcropolis(features) {
        const acropolisPoint = this.namedLocations.get('Acropolis of Athens');
        if (!acropolisPoint) {
            return;
        }
        const radii = this.options.acropolisRadii || {};
        const major = isFiniteNumber(radii.major) ? radii.major : DEFAULT_ACROPOLIS_MAJOR_RADIUS;
        const minor = isFiniteNumber(radii.minor) ? radii.minor : DEFAULT_ACROPOLIS_MINOR_RADIUS;
        const ellipse = createEllipsePolygon(acropolisPoint, major, minor, DEFAULT_CLIFF_SEGMENTS);
        const polygon = createPolygonRecord(ellipse);
        if (polygon) {
            this.acropolisPolygons.push(polygon);
        }
        // Optionally handle additional hills (placeholder for future data)
        for (const feature of features) {
            const name = feature?.properties?.name;
            if (!name || typeof name !== 'string') {
                continue;
            }
            if (name.toLowerCase().includes('hill') && feature.geometry?.type === 'Point') {
                const [lon, lat] = feature.geometry.coordinates;
                const world = this.projector.project({ lat, lon });
                const hillCircle = createCirclePolygon(world, minor * 0.6, 24);
                const hillPolygon = createPolygonRecord(hillCircle);
                if (hillPolygon) {
                    this.acropolisPolygons.push(hillPolygon);
                }
            }
        }
    }
}

export async function createCollisionGeometry(options = {}) {
    const collisionGeometry = new CollisionGeometry(options);
    await collisionGeometry.load(options);
    return collisionGeometry;
}

export { DEFAULT_CITY_WALL_BUFFER_METERS, DEFAULT_LONG_WALL_BUFFER_METERS };
