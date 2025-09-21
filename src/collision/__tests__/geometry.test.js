import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionGeometry } from '../geometry.js';
import { LocalEquirectangularProjection } from '../../geo/projection.js';
import fs from 'node:fs/promises';

async function loadSampleGeoJson() {
    const raw = await fs.readFile(new URL('../../../data/athens_places.geojson', import.meta.url));
    return JSON.parse(raw.toString());
}

test('CollisionGeometry builds buffers for walls and cliffs', async () => {
    const geoJson = await loadSampleGeoJson();
    const origin = { lat: 37.9715379, lon: 23.7266531 };
    const projector = new LocalEquirectangularProjection({ origin });
    const geometry = new CollisionGeometry({ projector });
    await geometry.load({ geoJson });

    assert.ok(geometry.cityWallPolygons.length > 0, 'expected buffered city wall polygons');
    assert.ok(geometry.longWallPolygons.length > 0, 'expected buffered long wall polygons');
    assert.ok(geometry.acropolisPolygons.length > 0, 'expected acropolis cliff polygon');

    const acropolis = geometry.namedLocations.get('Acropolis of Athens');
    assert.ok(acropolis, 'should retain acropolis location');

    const walkable = geometry.isWalkable(acropolis.x, acropolis.y);
    assert.equal(walkable, false, 'acropolis cliff should be blocked without slope map');
});

test('CollisionGeometry honours slope map when provided', async () => {
    const geoJson = await loadSampleGeoJson();
    const origin = { lat: 37.9715379, lon: 23.7266531 };
    const projector = new LocalEquirectangularProjection({ origin });
    const geometry = new CollisionGeometry({ projector });
    await geometry.load({ geoJson });

    const acropolis = geometry.namedLocations.get('Acropolis of Athens');
    assert.ok(acropolis, 'expected acropolis location');

    geometry.setSlopeMap(() => 0.2, 0.3);
    assert.equal(geometry.isWalkable(acropolis.x, acropolis.y), true, 'gentle slope should be walkable');

    geometry.setSlopeMap(() => 0.6, 0.3);
    assert.equal(geometry.isWalkable(acropolis.x, acropolis.y), false, 'steep slope should block movement');
});

test('CollisionGeometry blocks buffered long walls', async () => {
    const geoJson = await loadSampleGeoJson();
    const origin = { lat: 37.9715379, lon: 23.7266531 };
    const projector = new LocalEquirectangularProjection({ origin });
    const geometry = new CollisionGeometry({ projector });
    await geometry.load({ geoJson });

    assert.ok(geometry.longWallPolygons.length > 0, 'long wall polygons expected');
    const firstWall = geometry.longWallPolygons[0];
    const midpoint = firstWall.points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 }
    );
    midpoint.x /= firstWall.points.length;
    midpoint.y /= firstWall.points.length;

    assert.equal(geometry.isWalkable(midpoint.x, midpoint.y), false, 'inside buffered wall should be blocked');

    const farAway = { x: midpoint.x + 5000, y: midpoint.y + 5000 };
    assert.equal(geometry.isWalkable(farAway.x, farAway.y), true, 'distant point should be walkable');
});
