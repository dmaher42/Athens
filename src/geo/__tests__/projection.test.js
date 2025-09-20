import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalEquirectangularProjection } from '../projection.js';

const PARTHENON_COORDS = { lat: 37.9715379, lon: 23.7266531 };
const AGORA_COORDS = { lat: 37.975, lon: 23.723 };
const PNYX_COORDS = { lat: 37.973, lon: 23.718 };

test('Parthenon projects to the local origin', () => {
    const projector = new LocalEquirectangularProjection({ origin: PARTHENON_COORDS });
    const { x, y } = projector.project(PARTHENON_COORDS);

    assert.ok(Math.abs(x) < 0.01, `Expected x ≈ 0 but received ${x}`);
    assert.ok(Math.abs(y) < 0.01, `Expected y ≈ 0 but received ${y}`);
});

test('Agora falls northwest of the Parthenon', () => {
    const projector = new LocalEquirectangularProjection({ origin: PARTHENON_COORDS });
    const { x, y } = projector.project(AGORA_COORDS);

    assert.ok(x < -200, `Expected x to be west (negative) of origin, received ${x}`);
    assert.ok(y > 200, `Expected y to be north (positive) of origin, received ${y}`);
});

test('Pnyx falls west or northwest of the Parthenon', () => {
    const projector = new LocalEquirectangularProjection({ origin: PARTHENON_COORDS });
    const { x, y } = projector.project(PNYX_COORDS);

    assert.ok(x < -500, `Expected x to be significantly west of origin, received ${x}`);
    assert.ok(y > 50, `Expected y to be slightly north of origin, received ${y}`);
});

test('Rotation parameter rotates the local grid clockwise', () => {
    const projector = new LocalEquirectangularProjection({ origin: PARTHENON_COORDS, rotationDegrees: 90 });
    const { x, y } = projector.project({ lat: PARTHENON_COORDS.lat + 0.001, lon: PARTHENON_COORDS.lon });

    assert.ok(x > 0, 'Clockwise rotation should move northward displacement onto the +x axis');
    assert.ok(Math.abs(y) < 1e-6, 'Clockwise rotation should align that displacement with the x axis');
});
