import assert from 'node:assert/strict';
import test from 'node:test';

function withProcessBaseUrl(value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env.BASE_URL;

  if (typeof value === 'undefined') {
    delete process.env.BASE_URL;
  } else {
    process.env.BASE_URL = value;
  }

  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (typeof previous === 'undefined') {
        delete process.env.BASE_URL;
      } else {
        process.env.BASE_URL = previous;
      }
    });
}

async function importFreshAssetPaths() {
  delete (globalThis as Record<string, unknown>).__AthensAssetBase;
  const specifier = `../src/utils/asset-paths.js?cachebust=${Date.now()}-${Math.random()}`;
  return import(specifier);
}

test('computeAssetBaseUrl retains absolute BASE_URL origins', { concurrency: 1 }, async () => {
  await withProcessBaseUrl('https://cdn.example.com/assets', async () => {
    try {
      const module = await importFreshAssetPaths();
      const base = module.computeAssetBaseUrl();
      assert.equal(base, 'https://cdn.example.com/assets/');
      assert.equal(module.getAssetBase(), 'https://cdn.example.com/assets/');
      assert.equal(module.ASSET_BASE, 'https://cdn.example.com/assets/');

      const scoped = globalThis as Record<string, unknown>;
      const assetBase = scoped.__AthensAssetBase as { value: string; source: string } | undefined;
      assert.ok(assetBase, 'expected __AthensAssetBase to be defined');
      assert.equal(assetBase?.value, 'https://cdn.example.com/assets/');
      assert.equal(assetBase?.source, 'env:BASE_URL');
    } finally {
      delete (globalThis as Record<string, unknown>).__AthensAssetBase;
    }
  });
});

test('computeAssetBaseUrl tolerates unusable BASE_URL values', { concurrency: 1 }, async () => {
  await withProcessBaseUrl('   ', async () => {
    try {
      const module = await importFreshAssetPaths();
      const base = module.computeAssetBaseUrl();
      assert.equal(base, module.ASSET_BASE);
      assert.equal(module.getAssetBase(), module.ASSET_BASE);
      assert.ok(base.endsWith('/'), 'expected base URL to end with a slash');

      const scoped = globalThis as Record<string, unknown>;
      const assetBase = scoped.__AthensAssetBase as { value: string; source: string } | undefined;
      assert.ok(assetBase, 'expected __AthensAssetBase to be defined');
      assert.equal(assetBase?.value, module.ASSET_BASE);
      assert.equal(assetBase?.source, 'import.meta.url');
    } finally {
      delete (globalThis as Record<string, unknown>).__AthensAssetBase;
    }
  });
});
