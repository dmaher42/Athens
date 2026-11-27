import fs from 'node:fs';
import assert from 'node:assert/strict';
import {root,read,sha} from './build-entry.mjs';
import path from 'node:path';
const inventory=read('provenance/source-inventory.json');
for(const row of inventory.files) {
  const bytes=fs.readFileSync(path.join(root,row.path));
  assert.equal(bytes.length,row.bytes,row.path);assert.equal(sha(bytes),row.sha256,row.path);
}
console.log('Verified '+inventory.files.length+' frozen source and build input files.');
