import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBaseRelativeUrl } from '../src/utils/baseUrl.ts';

test('buildBaseRelativeUrl prefixes assets with the GitHub Pages base', () => {
  const scoped = globalThis as Record<string, unknown>;
  const previous = scoped.__ATHENS_BASE__;

  try {
    scoped.__ATHENS_BASE__ = '/Athens/';
    const url = buildBaseRelativeUrl('assets/audio/ambience_dawn.mp3');
    assert.equal(url, '/Athens/assets/audio/ambience_dawn.mp3');
  } finally {
    if (typeof previous === 'undefined') {
      delete scoped.__ATHENS_BASE__;
    } else {
      scoped.__ATHENS_BASE__ = previous;
    }
  }
});
