import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const outputFile = path.join(repoRoot, 'file-sizes.csv');
const outputRelativePath = path.relative(repoRoot, outputFile);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vite',
  '.idea',
  '.vscode',
  'coverage'
]);

type FileEntry = {
  relativePath: string;
  size: number;
};

async function collectFileSizes(startDir: string): Promise<FileEntry[]> {
  const stack: string[] = [startDir];
  const files: FileEntry[] = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const dirEntries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of dirEntries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(repoRoot, absolutePath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        if (relativePath === outputRelativePath) {
          continue;
        }
        const fileStats = await stat(absolutePath);
        files.push({ relativePath, size: fileStats.size });
      } else if (entry.isSymbolicLink()) {
        continue;
      }
    }
  }

  return files;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = bytes;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function writeCsv(entries: FileEntry[]): Promise<void> {
  await mkdir(path.dirname(outputFile), { recursive: true });
  const sorted = entries
    .slice()
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const stream = createWriteStream(outputFile, 'utf8');
  stream.write('path,bytes\n');
  for (const entry of sorted) {
    const normalizedPath = entry.relativePath.replace(/\\/g, '/');
    stream.write(`${normalizedPath},${entry.size}\n`);
  }
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on('error', reject);
  });
}

async function main(): Promise<void> {
  const entries = await collectFileSizes(repoRoot);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);

  await writeCsv(entries);

  console.log(`Wrote ${entries.length} records to ${path.relative(repoRoot, outputFile)} (total ${formatBytes(totalBytes)}).`);
  const top = entries
    .slice()
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);

  console.log('\nTop 20 largest files:');
  top.forEach((entry, index) => {
    console.log(
      `${String(index + 1).padStart(2, ' ')}. ${entry.relativePath.replace(/\\/g, '/')} – ${formatBytes(entry.size)} (${entry.size} bytes)`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
