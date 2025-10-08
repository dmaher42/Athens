#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');
const VALID_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.glsl']);

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(entryPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        yield entryPath;
      }
    }
  }
}

function canonicalizeWhitespace(content) {
  return content.replace(/\s+/g, '');
}

async function hashFile(filePath) {
  const rawContent = await fs.readFile(filePath, 'utf8');
  const canonicalContent = canonicalizeWhitespace(rawContent);
  return crypto.createHash('sha1').update(canonicalContent).digest('hex');
}

async function main() {
  const duplicates = new Map();

  for await (const filePath of walk(SRC_DIR)) {
    const hash = await hashFile(filePath);
    if (!duplicates.has(hash)) {
      duplicates.set(hash, []);
    }
    duplicates.get(hash).push(filePath);
  }

  const duplicateGroups = Array.from(duplicates.entries())
    .map(([hash, files]) => [hash, files.sort((a, b) => a.localeCompare(b))])
    .filter(([, files]) => files.length > 1)
    .sort(([, filesA], [, filesB]) => filesA[0].localeCompare(filesB[0]));

  if (duplicateGroups.length === 0) {
    console.log('No duplicates found.');
    return;
  }

  for (const [hash, files] of duplicateGroups) {
    console.log(`Duplicate group (${hash}):`);
    for (const file of files) {
      console.log(`  ${path.relative(process.cwd(), file)}`);
    }
    console.log('');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
