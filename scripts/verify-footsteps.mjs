import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import createFootsteps from '../src/audio/footsteps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const loads = [];

const audio = {
  getListener() {
    return null;
  },
  getMasterVolume() {
    return 1;
  },
  isContextSuspended() {
    return false;
  },
  async load(name, rel) {
    const absolute = join(projectRoot, 'public', 'assets', 'audio', rel);
    const data = await readFile(absolute);
    loads.push({ name, rel, size: data.byteLength });
    return { buffer: { byteLength: data.byteLength } };
  }
};

const footsteps = createFootsteps(audio, {
  dirt: 'ambience_day.mp3',
  stone: 'ambience_day.mp3'
});

footsteps.setIntervalBySpeed(3);
await new Promise((resolve) => setTimeout(resolve, 600));
await footsteps.onStep('dirt');
await new Promise((resolve) => setTimeout(resolve, 600));
await footsteps.onStep('stone');

footsteps.dispose();

console.log(JSON.stringify(loads, null, 2));
