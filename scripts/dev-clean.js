#!/usr/bin/env node
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

async function removeIfExists(target) {
  try {
    await rm(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Warning: failed to remove ${target}:`, error);
    }
    return false;
  }
}

async function removeViteCaches() {
  const removed = [];

  if (await removeIfExists('.vite')) {
    removed.push('.vite');
  }

  if (await removeIfExists('node_modules/.vite')) {
    removed.push('node_modules/.vite');
  }

  try {
    const entries = await readdir('node_modules', { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('.vite-'))
        .map((entry) => removeIfExists(join('node_modules', entry.name)).then((didRemove) => {
          if (didRemove) removed.push(join('node_modules', entry.name));
        }))
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Warning: unable to inspect node_modules for Vite caches:', error);
    }
  }

  if (removed.length > 0) {
    console.log('Removed Vite caches:', removed.join(', '));
  } else {
    console.log('No Vite caches found to remove.');
  }
}

await removeViteCaches();
