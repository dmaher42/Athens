import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const lock = JSON.parse(fs.readFileSync(new URL('./release-lock.json', import.meta.url), 'utf8'));
const pins = lock.releases.filter(pin => pin.role === 'active');
const [athens, sparta] = pins;
const base = new URL(process.argv[2] ?? '');
assert((base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname))) && !base.username && !base.password && base.href === base.origin + '/',
  'Usage: node smoke.mjs https://private-athens-origin');
const starter = '/athens-game-starter/';
const pinned = (p, file) => '/__babylon/apps/' + p.app + '/releases/' + p.id + starter + file;
const get = (target, headers = {}) => {
  assert(target.startsWith('/') && !target.startsWith('//'));
  const cookie = process.env.ATHENS_SMOKE_COOKIE;
  return fetch(new URL(target, base), {
    redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
    signal: AbortSignal.timeout(30_000)
  });
};
async function redirect(target, location) {
  const response = await get(target);
  assert.equal(response.status, 302, 'Expected game redirect: ' + target);
  assert.equal(response.headers.get('location'), location);
  await response.body?.cancel();
}
async function matching(target, pin, sha, headers) {
  const response = await get(target, headers);
  assert.equal(response.status, 200, 'Expected game bytes: ' + target);
  assert.equal(response.headers.get('x-babylon-release'), pin.id);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
}
const start = 'index.html?engine=babylon&place=propylaia';
await redirect('/', starter + start);
await redirect(starter + start, pinned(athens, start));
await redirect(pinned(athens, 'sparta/index.html'), starter + 'sparta/index.html');
await redirect(starter + 'sparta/index.html', pinned(sparta, 'sparta/index.html'));
await redirect(pinned(sparta, 'index.html'), starter + 'index.html');
const response = await get('/__babylon/status', { Referer: new URL(pinned(athens, start), base).href });
assert.equal(response.status, 200);
const status = await response.json();
assert.equal(status.id, athens.id);
assert.equal(status.assetRouting, 'pinned-request-context-v1');
for (const pin of pins) {
  assert.equal(status.apps[pin.app].id, pin.id);
  assert.equal(status.apps[pin.app].manifestSHA256, pin.manifest);
  await matching(pinned(pin, pin.entry), pin, pin.sha256);
}
await matching(starter + 'textures/grading/mediterranean-luminous-32.png', athens,
  'aae654527340254be31af4d8b9824afc87da023f1b894fb20baec9ad6a7aeaf1',
  { Referer: new URL(pinned(athens, start), base).href });
const range = await get(pinned(sparta, 'sparta/assets/intro/sparta-intro.mp4'), { Range: 'bytes=0-63' });
assert.equal(range.status, 206);
assert.match(range.headers.get('content-range') ?? '', /^bytes 0-63\/[0-9]+$/);
assert.equal((await range.arrayBuffer()).byteLength, 64);
console.log('Served Athens and Sparta match the pinned entries; HTTPS context, travel routing and media byte ranges passed.');
