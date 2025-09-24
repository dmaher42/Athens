// tools/find-unused-ground.js
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const CANDIDATE_PAT = /(ground|dirt|grass|dust)/i;
const EXT = new Set(['.js', '.mjs', '.ts', '.jsx', '.tsx']);

const allFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.has(path.extname(name))) allFiles.push(p);
  }
}
walk(ROOT);

// Index file contents once
const fileText = new Map(allFiles.map(p => [p, fs.readFileSync(p, 'utf8')]));

// Build reverse dependency graph (very simple import scanner)
const importsOf = new Map(allFiles.map(p => [p, new Set()]));
for (const [p, txt] of fileText) {
  const dir = path.dirname(p);
  const re = /\bimport\s+[^'"]*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(txt))) {
    let spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const resolved =
        path.resolve(dir, spec.endsWith('.js') ? spec : spec + '.js');
      // try variations
      const tries = [
        resolved,
        resolved.replace(/\.js$/, '.mjs'),
        resolved.replace(/\.js$/, '.ts'),
        resolved.replace(/\.js$/, '/index.js'),
        resolved.replace(/\.js$/, '/index.mjs'),
        resolved.replace(/\.js$/, '/index.ts'),
      ];
      const hit = tries.find(t => fileText.has(t));
      if (hit) importsOf.get(hit)?.add(p);
    }
  }
}

// Find candidates containing "ground|dirt|grass|dust"
const candidates = allFiles.filter(p => CANDIDATE_PAT.test(path.basename(p)) || CANDIDATE_PAT.test(p));

// Mark "entry-ish" files that are probably roots (imported by HTML or toolchain)
const entryHints = ['index.html', 'main.js', 'app.js', 'bootstrap', 'entry'];
const likelyEntries = new Set(
  allFiles.filter(p => entryHints.some(h => p.toLowerCase().includes(h)))
);

// Orphans = no one imports them AND they are not likely entry
const orphans = candidates.filter(p => importsOf.get(p)?.size === 0 && !likelyEntries.has(p));

// Also show multiply-defined ground planes by quick heuristic: PlaneGeometry + scene.add
const planeMakers = candidates.filter(p => /\bPlaneGeometry\b/.test(fileText.get(p) || '') && /\bscene\.add\b/.test(fileText.get(p) || ''));

console.log('--- Ground-related files ---');
for (const p of candidates) {
  const usedBy = [...(importsOf.get(p) || [])];
  console.log((usedBy.length ? 'USED   ' : 'UNUSED ') + p + (usedBy.length ? `  <- ${usedBy.length} importer(s)` : ''));
}

console.log('\n--- Unused candidates (SAFE TO DISABLE FIRST) ---');
orphans.forEach(p => console.log('•', p));

console.log('\n--- Files that likely add planes to the scene (possible overlap) ---');
planeMakers.forEach(p => console.log('•', p));
