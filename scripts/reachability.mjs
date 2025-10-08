import { spawnSync } from 'node:child_process';

const EXPORT_PATTERN = '^export\\s+(?:async\\s+)?function\\s+(\\w+)|^export\\s+class\\s+(\\w+)';
const RG_ARGS = ['--no-heading', '--line-number', '--glob=*.{ts,tsx,js}', '--pcre2'];

const entryFiles = new Set(['src/main.ts', 'src/main.js']);

function runRg(pattern, extraArgs = []) {
  const result = spawnSync('rg', [...RG_ARGS, pattern, 'src', ...extraArgs], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `ripgrep exited with status ${result.status}`);
  }

  return result.stdout.trim();
}

function parseExports(output) {
  if (!output) {
    return [];
  }

  return output.split('\n').map((line) => {
    const [file, lineNumber, ...rest] = line.split(':');
    const code = rest.join(':');
    const nameMatch = code.match(/function\s+(\w+)/) || code.match(/class\s+(\w+)/);
    if (!nameMatch) {
      return null;
    }

    return {
      file,
      line: Number.parseInt(lineNumber, 10),
      name: nameMatch[1],
    };
  }).filter(Boolean);
}

function findReferences(name) {
  const output = runRg(`\\b${name}\\b`);
  if (!output) {
    return [];
  }

  return output.split('\n').map((line) => {
    const [file, lineNumber] = line.split(':');
    return { file, line: Number.parseInt(lineNumber, 10) };
  });
}

function isEntryFile(file) {
  return file.startsWith('src/entry/') || entryFiles.has(file);
}

function main() {
  const exportOutput = runRg(EXPORT_PATTERN);
  const exports = parseExports(exportOutput).filter((exp) => !isEntryFile(exp.file));

  const deadExports = exports.filter((exp) => {
    const references = findReferences(exp.name).filter(
      (ref) => !(ref.file === exp.file && ref.line === exp.line)
    );
    return references.length === 0;
  });

  if (deadExports.length === 0) {
    console.log('No potentially dead exports found.');
    return;
  }

  console.log('Potentially dead exports:');
  for (const exp of deadExports) {
    console.log(`- ${exp.name} (${exp.file}:${exp.line})`);
  }
}

main();
