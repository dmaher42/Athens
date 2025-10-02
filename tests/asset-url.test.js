import assert from 'node:assert/strict';
import test from 'node:test';

import { assetUrl } from '../src/utils/assetUrl.ts';

function withBaseUrl(value, fn) {
  const previous = process.env.BASE_URL;
  if (typeof value === 'undefined') {
    delete process.env.BASE_URL;
  } else {
    process.env.BASE_URL = value;
  }

  try {
    return fn();
  } finally {
    if (typeof previous === 'undefined') {
      delete process.env.BASE_URL;
    } else {
      process.env.BASE_URL = previous;
    }
  }
}

test('assetUrl resolves URLs for different base formats', async (t) => {
  await t.test('joins relative base and asset path', () => {
    withBaseUrl('/static/', () => {
      assert.equal(
        assetUrl('models/tree.glb'),
        '/static/models/tree.glb'
      );
    });
  });

  await t.test('respects GitHub Pages base path', () => {
    withBaseUrl('/Athens/', () => {
      assert.equal(
        assetUrl('assets/audio/ambience_day.mp3'),
        '/Athens/assets/audio/ambience_day.mp3'
      );
    });
  });

  await t.test('preserves protocol delimiters for absolute bases', () => {
    withBaseUrl('https://cdn.example.com/assets/', () => {
      assert.equal(
        assetUrl('textures/sky.jpg'),
        'https://cdn.example.com/assets/textures/sky.jpg'
      );
    });
  });

  await t.test('allows absolute asset paths to pass through unchanged', () => {
    withBaseUrl('https://cdn.example.com/assets/', () => {
      assert.equal(
        assetUrl('https://images.example.com/sky.jpg'),
        'https://images.example.com/sky.jpg'
      );
    });
  });
});
