import test from 'node:test';
import assert from 'node:assert/strict';

import { getFeatureOffset, applyFeatureOffset } from '../featureOffsets.js';

const EPSILON = 1e-12;

const PARTHENON_COORDS = [23.726663, 37.971536];

function almostEqual(a, b, epsilon = EPSILON) {
    assert.ok(Math.abs(a - b) <= epsilon, `Expected ${a} ≈ ${b}`);
}

test('getFeatureOffset resolves Parthenon offsets irrespective of casing', () => {
    const offset = getFeatureOffset('parthenon');
    assert.ok(offset, 'offset should be registered for the Parthenon');
    almostEqual(offset.deltaLon, 0.0004);
    almostEqual(offset.deltaLat, 0.0003);
});

test('applyFeatureOffset adjusts coordinates for matching features', () => {
    const [lon, lat] = applyFeatureOffset(PARTHENON_COORDS, {
        fallbackName: 'Parthenon'
    });
    almostEqual(lon, PARTHENON_COORDS[0] + 0.0004);
    almostEqual(lat, PARTHENON_COORDS[1] + 0.0003);
});

test('applyFeatureOffset leaves unrelated coordinates untouched', () => {
    const original = [23.7229, 37.9753];
    const adjusted = applyFeatureOffset(original, { fallbackName: 'Agora of Athens' });
    almostEqual(adjusted[0], original[0]);
    almostEqual(adjusted[1], original[1]);
});
