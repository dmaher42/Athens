const EARTH_RADIUS_METERS = 6378137;

const degToRad = (degrees) => (degrees * Math.PI) / 180;
const radToDeg = (radians) => (radians * 180) / Math.PI;

/**
 * Equirectangular projection centered on a specific geographic origin.
 */
export class LocalEquirectangularProjection {
    /**
     * @param {{ lat: number, lon: number }} origin - Geographic origin of the local coordinate system.
     * @param {number} [rotationDegrees=0] - Rotation to apply after projection, measured clockwise from east in degrees.
     * @param {number} [radius=EARTH_RADIUS_METERS] - Earth radius to use for the projection.
     */
    constructor({ origin, rotationDegrees = 0, radius = EARTH_RADIUS_METERS }) {
        if (!origin || typeof origin.lat !== 'number' || typeof origin.lon !== 'number') {
            throw new TypeError('Origin with numeric lat and lon must be provided');
        }

        this.radius = radius;
        this.originLat = origin.lat;
        this.originLon = origin.lon;
        this.originLatRad = degToRad(origin.lat);
        this.originLonRad = degToRad(origin.lon);
        this.setRotation(rotationDegrees);
    }

    /**
     * Updates the rotation of the local grid.
     * @param {number} rotationDegrees
     */
    setRotation(rotationDegrees = 0) {
        this.rotationDegrees = rotationDegrees;
        this.rotationRadians = degToRad(-rotationDegrees);
        this._cosRotation = Math.cos(this.rotationRadians);
        this._sinRotation = Math.sin(this.rotationRadians);
    }

    /**
     * Projects a WGS84 coordinate into the local Cartesian plane.
     * @param {{ lat: number, lon: number }} coordinate
     * @returns {{ x: number, y: number }} - Local coordinates in meters.
     */
    project({ lat, lon }) {
        if (typeof lat !== 'number' || typeof lon !== 'number') {
            throw new TypeError('Coordinate must contain numeric lat and lon');
        }

        const latRad = degToRad(lat);
        const lonRad = degToRad(lon);

        const x = this.radius * (lonRad - this.originLonRad) * Math.cos(this.originLatRad);
        const y = this.radius * (latRad - this.originLatRad);

        const rotatedX = x * this._cosRotation - y * this._sinRotation;
        const rotatedY = x * this._sinRotation + y * this._cosRotation;

        return { x: rotatedX, y: rotatedY };
    }

    /**
     * Convenience helper that projects GeoJSON Point coordinates which use [lon, lat].
     * @param {number[]} position - GeoJSON position array [lon, lat].
     * @returns {{ x: number, y: number }}
     */
    projectGeoJsonPosition(position) {
        if (!Array.isArray(position) || position.length < 2) {
            throw new TypeError('GeoJSON position must be a [lon, lat] array');
        }
        const [lon, lat] = position;
        return this.project({ lat, lon });
    }
}

export { EARTH_RADIUS_METERS, degToRad, radToDeg };
