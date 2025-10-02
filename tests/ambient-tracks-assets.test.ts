import path from 'node:path';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CANDIDATE_ROOTS = JSON.stringify([
  path.join(PROJECT_ROOT, 'public'),
  path.join(PROJECT_ROOT, 'assets')
]);

function runAmbientAssetCheck(script: string) {
  return new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      { cwd: PROJECT_ROOT },
      (error, _stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || error.message;
          const wrapped = new Error(details);
          wrapped.cause = error;
          reject(wrapped);
        } else {
          resolve();
        }
      }
    );
  });
}

test('ambient track URLs resolve to available audio assets', async () => {
  const moduleUrl = new URL('../src/audio/ambient.ts', import.meta.url).href;
  const script = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.listener = { setPosition: () => {}, setOrientation: () => {} };
    this.destination = {};
  }
  resume() { return Promise.resolve(); }
  createGain() { return { gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }; }
  createAnalyser() { return { connect: () => {} }; }
  createBufferSource() { return { connect: () => {}, start: () => {}, stop: () => {} }; }
  createPanner() { return { connect: () => {}, panningModel: 'HRTF' }; }
  createOscillator() { return { connect: () => {}, start: () => {} }; }
}

globalThis.window = {
  AudioContext: FakeAudioContext,
  webkitAudioContext: FakeAudioContext
};

const module = await import(${JSON.stringify(moduleUrl)});
const tracks = module.AMBIENT_TRACKS;
const roots = ${CANDIDATE_ROOTS};

for (const track of tracks) {
  assert.ok(track.file, \`Ambient track \${track.id} is missing a file URL\`);

  const url = track.file;
  if (/^[a-zA-Z][a-zA-Z\\d+\\-.]*:\\/\\//.test(url)) {
    continue;
  }

  const relative = url.replace(/^\\/*/, '');
  let resolved = false;

  for (const root of roots) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate)) {
      resolved = true;
      break;
    }
  }

  assert.ok(resolved, \`Ambient track \${track.id} points to missing asset: \${url}\`);
}
`;

  await runAmbientAssetCheck(script);
});
