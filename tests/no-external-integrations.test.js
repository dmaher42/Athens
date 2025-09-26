import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  { label: 'Firebase', regex: /firebase/i },
  { label: 'Memory cue', regex: /memory[\s_-]*cue/i }
];

const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts'
]);

const SKIP_PATH_SEGMENTS = new Set([
  '.git',
  'assets',
  'data',
  'models',
  'node_modules',
  'public/assets/vendor'
]);

async function collectTextFiles(relativeDir) {
  const files = [];
  const start = path.resolve(repoRoot, relativeDir);

  async function walk(currentPath) {
    const relPath = path.relative(repoRoot, currentPath);

    for (const segment of relPath.split(path.sep)) {
      if (!segment) continue;
      if (SKIP_PATH_SEGMENTS.has(segment) || SKIP_PATH_SEGMENTS.has(relPath)) {
        return;
      }
    }

    const entryStat = await stat(currentPath);
    if (entryStat.isDirectory()) {
      const entries = await readdir(currentPath);
      await Promise.all(entries.map((entry) => walk(path.join(currentPath, entry))));
      return;
    }

    const ext = path.extname(currentPath).toLowerCase();
    if (!TEXT_FILE_EXTENSIONS.has(ext)) {
      return;
    }

    files.push(relPath);
  }

  try {
    await walk(start);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return files;
}

test('runtime dependencies exclude Firebase and memory cues', async () => {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);
  const dependencies = packageJson.dependencies || {};

  for (const depName of Object.keys(dependencies)) {
    for (const { label, regex } of FORBIDDEN_PATTERNS) {
      assert(
        !regex.test(depName),
        `Dependency \"${depName}\" unexpectedly references ${label}.`
      );
    }
  }
});

test('source files do not reference Firebase or memory cues', async () => {
  const rootsToScan = ['index.html', 'service-worker.js', 'src', 'public'];
  const filesToScan = new Set();

  for (const root of rootsToScan) {
    const collected = await collectTextFiles(root);
    for (const file of collected) {
      filesToScan.add(file);
    }
  }

  const violations = [];
  for (const relPath of filesToScan) {
    const absolutePath = path.join(repoRoot, relPath);
    const contents = await readFile(absolutePath, 'utf8');

    for (const { label, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(contents)) {
        violations.push({ relPath, label });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    violations
      .map(({ relPath, label }) => `${label} reference found in ${relPath}`)
      .join('\n') || 'Forbidden references detected.'
  );
});
