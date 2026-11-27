import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const APPS = Object.freeze(['athens', 'sparta']);
export const PUBLIC_BASE = '/athens-game-starter/';
export const IMMUTABLE_BASE = '/__babylon/apps/';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{12}$/;
const lexical=(a,b)=>a<b?-1:a>b?1:0;

export function invariant(ok, message) { if (!ok) throw new Error(message); }
export function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  invariant(value !== undefined && typeof value !== 'function', 'Non-JSON value');
  return JSON.stringify(value);
}
export function appName(app) { invariant(APPS.includes(app), 'Unknown application'); return app; }
export function releaseId(id) { invariant(typeof id === 'string' && ID.test(id), 'Invalid release id'); return id; }
export function relativeFile(file) {
  invariant(typeof file === 'string' && file.length > 0 && file.length <= 1000, 'Invalid relative file');
  invariant(!/[\\:%\u0000-\u001f?#<>"|*]/.test(file) && !file.startsWith('/'), 'Unsafe relative file');
  invariant(file.split('/').every(x => x && x !== '.' && x !== '..'), 'Unsafe path segment');
  invariant(file.split('/').every(x=>!/[. ]$/.test(x)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)), 'Unsafe Windows filename');
  return file;
}
export function assertNoLinks(root) {
  const absolute=path.resolve(root), parsed=path.parse(absolute);
  let cursor=parsed.root;
  for(const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,component);
    if(fs.existsSync(cursor))invariant(!fs.lstatSync(cursor).isSymbolicLink(),'Symlink/junction in release path');
  }
}
export function inside(root, ...parts) {
  const target = path.resolve(root, ...parts), rel = path.relative(path.resolve(root), target);
  invariant(rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel), 'Path escaped its application root');
  return target;
}
export function appRoot(home, app) { return inside(home, 'apps', appName(app)); }
export function validateHome(home) {
  assertNoLinks(home);
  const markerFile=inside(home,'isolation.json');assertNoLinks(markerFile);
  const marker=JSON.parse(fs.readFileSync(markerFile,'utf8'));
  invariant(marker.schemaVersion===1 && marker.mode==='independent-city-releases', 'Root has not been migrated to independent releases');
  return marker;
}
export function pointerPath(home, app) { return inside(appRoot(home, app), 'current.json'); }
export function rawFile(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
export function fileSHA(file) { const raw = rawFile(file); return raw === null ? null : sha256(raw); }
export function releaseURL(app, id, relative = '') {
  appName(app); releaseId(id);
  if (relative) relativeFile(relative);
  return `${IMMUTABLE_BASE}${app}/releases/${id}${PUBLIC_BASE}${relative}`;
}
export function poolId(files) {
  return sha256(canonical(files.filter(f => f.kind === 'asset').map(({path:p,sha256:s,size}) => ({path:p,sha256:s,size})).sort((a,b) => lexical(a.path,b.path))));
}
export function legacyCatalogId(files){return sha256(canonical([...files].sort((a,b)=>lexical(a.path,b.path))));}
export function computeReleaseId(manifest) {
  const { id, ...identity } = manifest;
  return sha256('babylon-isolated-release-v1\n' + canonical(identity)).slice(0, 12);
}
export function validateManifest(manifest, app, id) {
  appName(app); releaseId(id);
  invariant(manifest?.schemaVersion === 1 && manifest.app === app && manifest.id === id, 'Release identity/app mismatch');
  invariant((manifest.runtime?.versionedAssetURLs === true || (manifest.runtime?.versionedAssetURLs === false && manifest.runtime?.requestContextAssetAdapter === 1)) && manifest.runtime?.crossCityLinkContract === 1, 'Release needs a declared versioned or pinned-context runtime/link adapter');
  invariant(manifest.provenance && typeof manifest.provenance === 'object' && !Array.isArray(manifest.provenance), 'Missing source/output provenance');
  invariant(Array.isArray(manifest.files) && manifest.files.length > 0, 'Empty release file inventory');
  const names = new Set();
  for (const f of manifest.files) {
    relativeFile(f.path);
    invariant(f.kind === 'build' || f.kind === 'asset', 'Unknown inventory kind');
    invariant(HASH.test(f.sha256) && Number.isSafeInteger(f.size) && f.size >= 0, 'Invalid file digest/size');
    invariant(!names.has(f.path.toLowerCase()), 'Ambiguous duplicate route'); names.add(f.path.toLowerCase());
  }
  invariant(HASH.test(manifest.assetPool) && manifest.assetPool === poolId(manifest.files), 'Asset-pool identity mismatch');
  invariant(manifest.entry === (app === 'athens' ? 'index.html' : 'sparta/index.html'), 'Unexpected entry route');
  invariant(manifest.files.some(f => f.path === manifest.entry && f.kind === 'build'), 'Entry absent from inventory');
  invariant(computeReleaseId(manifest) === id, 'Release identity does not cover its manifest');
  return manifest;
}
export function readPointer(home, app) {
  assertNoLinks(pointerPath(home,app));
  const raw = rawFile(pointerPath(home, app));
  if (raw === null) return null;
  const pointer = JSON.parse(raw.toString('utf8'));
  invariant(pointer.schemaVersion === 1 && pointer.app === app && HASH.test(pointer.manifestSHA256), 'Invalid city pointer');
  releaseId(pointer.id);
  return { pointer, raw, sha256: sha256(raw) };
}
export function readRelease(home, app, id, expectedManifestSHA256 = null) {
  const root = inside(appRoot(home, app), 'releases', releaseId(id));
  const file = inside(root, 'release.json');assertNoLinks(file);const raw = fs.readFileSync(file);
  if (expectedManifestSHA256 !== null) invariant(sha256(raw) === expectedManifestSHA256, 'Manifest bytes changed');
  const manifest = validateManifest(JSON.parse(raw.toString('utf8')), app, id);
  return { root, manifest, raw, manifestSHA256: sha256(raw) };
}
export function physicalFile(home, app, release, row) {
  const root = row.kind === 'build' ? inside(release.root, 'build') : inside(appRoot(home, app), 'assets', release.manifest.assetPool, 'athens-game-starter');
  const target = inside(root, relativeFile(row.path));
  assertNoLinks(target);
  invariant(fs.statSync(target).isFile(), 'Release route is not a file');
  return target;
}
export function verifyRow(file, row) {
  const bytes = fs.readFileSync(file);
  invariant(bytes.length === row.size && sha256(bytes) === row.sha256, `Release file changed: ${row.path}`);
  return bytes;
}
function parseTarget(target) {
  invariant(typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.includes('#'), 'Invalid request target');
  const q = target.indexOf('?'), rawPath = q < 0 ? target : target.slice(0,q), search = q < 0 ? '' : target.slice(q);
  invariant(!/[\\\u0000-\u001f]/.test(rawPath), 'Unsafe URL');
  const pathname = decodeURIComponent(rawPath);
  invariant(!/[\\%\u0000-\u001f]/.test(pathname) && pathname.split('/').every(p => p !== '.' && p !== '..'), 'Unsafe URL path');
  return { pathname, search };
}
function stableApp(pathname) {
  if (pathname === PUBLIC_BASE || pathname === `${PUBLIC_BASE}index.html`) return 'athens';
  if (pathname === `${PUBLIC_BASE}sparta/` || pathname === `${PUBLIC_BASE}sparta/index.html`) return 'sparta';
  return null;
}
function legacyFile(home,relative,verifyBytes){
  // Optional immutable compatibility snapshot for clients already open at migration.
  // It never follows legacy home/current.json or scans arbitrary release folders.
  const pointerFile=inside(home,'legacy','selected.json');
  if(!fs.existsSync(pointerFile))return {type:'error',status:404,message:'Unversioned asset route is not installed'};
  assertNoLinks(pointerFile);
  const selected=JSON.parse(fs.readFileSync(pointerFile,'utf8'));
  invariant(selected.schemaVersion===1&&HASH.test(selected.catalogId)&&HASH.test(selected.manifestSHA256),'Invalid legacy snapshot pointer');
  const root=inside(home,'legacy','catalogs',selected.catalogId),manifestFile=inside(root,'manifest.json');assertNoLinks(manifestFile);
  const raw=fs.readFileSync(manifestFile);invariant(sha256(raw)===selected.manifestSHA256,'Legacy catalog manifest changed');
  const manifest=JSON.parse(raw.toString('utf8'));invariant(manifest.schemaVersion===1&&manifest.id===selected.catalogId&&Array.isArray(manifest.files),'Invalid legacy catalog');
  const names=new Set();
  for(const row of manifest.files){relativeFile(row.path);invariant(HASH.test(row.sha256)&&Number.isSafeInteger(row.size)&&row.size>=0&&!names.has(row.path),'Invalid legacy catalog row');names.add(row.path);}
  invariant(legacyCatalogId(manifest.files)===manifest.id,'Legacy catalog identity mismatch');
  const row=manifest.files.find(f=>f.path===relative);if(!row)return {type:'error',status:404,message:'File absent from frozen legacy catalog'};
  const file=inside(root,'files',relative);assertNoLinks(file);
  return {type:'file',status:200,file,bytes:verifyBytes?verifyRow(file,row):null,relative,sha256:row.sha256,immutable:true,legacyCatalogId:manifest.id};
}

// Pure routing decision plus guarded filesystem reads. It never reads home/current.json.
// A caller may cache validated immutable files; this initial adapter defaults to hashing each served file.
export function resolveRequest(home, target, { verifyBytes = true } = {}) {
  try { validateHome(home); } catch { return {type:'error',status:503,message:'Independent registry is not initialized'}; }
  let route;
  try { route = parseTarget(target); } catch (error) { return { type:'error', status:400, message:error.message }; }
  const {pathname,search} = route;
  if (pathname === '/__babylon/status') {
    try {
      return { type:'json', status:200, body:{application:'athens-babylon-independent',servingMode:'isolated-city-releases',schemaVersion:1,apps:Object.fromEntries(APPS.map(a => [a,readPointer(home,a)?.pointer ?? null]))} };
    } catch { return {type:'error',status:503,message:'City registry unavailable'}; }
  }
  const stable = stableApp(pathname);
  if (stable) {
    try {
      const active=readPointer(home,stable); invariant(active,'City not installed');
      const release=readRelease(home,stable,active.pointer.id,active.pointer.manifestSHA256);
      return {type:'redirect',status:302,location:releaseURL(stable,active.pointer.id,release.manifest.entry)+search};
    } catch { return {type:'error',status:503,message:'City release unavailable'}; }
  }
  const match=/^\/__babylon\/apps\/(athens|sparta)\/releases\/([a-f0-9]{12})\/athens-game-starter\/(.*)$/.exec(pathname);
  if (!match) {
    if(pathname.startsWith(PUBLIC_BASE)){
      try{const relative=pathname.slice(PUBLIC_BASE.length);relativeFile(relative);return legacyFile(home,relative,verifyBytes);}
      catch{return {type:'error',status:503,message:'Frozen legacy snapshot unavailable'};}
    }
    return {type:'error',status:404,message:'Unknown city release route'};
  }
  const [,app,id,requested]=match, relative=requested.endsWith('/') ? requested+'index.html' : requested || 'index.html';
  // Keep established relative travel links while selecting the destination city's current release.
  const destination=stableApp(PUBLIC_BASE+relative);
  if (destination && destination !== app) return {type:'redirect',status:302,location:PUBLIC_BASE+(destination==='sparta'?'sparta/index.html':'index.html')+search};
  try {
    relativeFile(relative);
    const release=readRelease(home,app,id), row=release.manifest.files.find(f=>f.path===relative);
    if (!row) return {type:'error',status:404,message:'File absent from this release'};
    const file=physicalFile(home,app,release,row);
    const bytes=verifyBytes ? verifyRow(file,row) : null;
    return {type:'file',status:200,file,bytes,app,id,relative,sha256:row.sha256,immutable:true};
  } catch { return {type:'error',status:503,message:'Versioned release file unavailable'}; }
}
