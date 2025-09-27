import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const FAIL_SOFT_FILE = path.join('src', 'utils', 'fail-soft-loaders.js');

/**
 * Guard against accidental writes to read-only texture identifiers.
 */
test('no code writes to texture.id or uuid', async () => {
  const sample = new THREE.Texture();
  const descriptor = Object.getOwnPropertyDescriptor(sample, 'id');
  assert.ok(descriptor, 'Expected THREE.Texture.id descriptor');
  assert.equal(descriptor.writable, false, 'Texture.id should be read-only');

  const failSoftPath = path.join(repoRoot, FAIL_SOFT_FILE);
  const code = await readFile(failSoftPath, 'utf8');
  assert.ok(!/\.id\s*=/.test(code), 'Code must not assign to texture.id');
  assert.ok(!/\.uuid\s*=/.test(code), 'Code must not assign to texture.uuid');
});
