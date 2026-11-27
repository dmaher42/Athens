import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {root,read,sha,buildEntry} from './build-entry.mjs';

await import('./verify-source.mjs');
const lock=read('release-lock.json'),home=path.join(root,'game'),payload=path.resolve(process.env.ATHENS_PAYLOAD??path.join(root,'payload'));
assert(!fs.existsSync(home),'Use a new output directory: game already exists. Retain it until reviewed.');
const output=await buildEntry();
const checked=(file,hash)=>{const b=fs.readFileSync(file);assert.equal(sha(b),hash,file);return b;};
const write=(file,b)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,b,{flag:'wx'});};
for(const [name,hash] of Object.entries(lock.controlFiles)) {
  let bytes=checked(path.join(root,'runtime',name),hash);
  if(name==='isolation-runtime/prebuilt-context-handler.mjs') {
    const before="new URL(target,'http://'+(headers.host??'127.0.0.1:5189'))";
    const source=bytes.toString('utf8');assert.equal(source.split(before).length,2);
    bytes=Buffer.from(source.replace(before,"new URL(target,options.publicOrigin??('http://'+(headers.host??'127.0.0.1:5189')))"));
  }
  write(path.join(home,name),bytes);
}
const registry=await import(pathToFileURL(path.join(home,'isolation-runtime/registry.mjs')));
const {selectRegisteredCity}=await import(pathToFileURL(path.join(home,'isolation-runtime/city-transaction.mjs')));
const pins=lock.releases;
for(const pin of pins) {
  const raw=checked(path.join(root,'provenance',pin.app+'-release.json'),pin.manifest);
  const manifest=registry.validateManifest(JSON.parse(raw.toString('utf8')),pin.app,pin.id);
  const releaseRoot=path.join(home,'apps',pin.app,'releases',pin.id);
  write(path.join(releaseRoot,'release.json'),raw);
  const release=registry.readRelease(home,pin.app,pin.id,pin.manifest);
  for(const row of manifest.files) {
    const dst=path.join(row.kind==='build'?path.join(releaseRoot,'build'):path.join(home,'apps',pin.app,'assets',manifest.assetPool,'athens-game-starter'),row.path);
    if(fs.existsSync(dst)){registry.verifyRow(dst,row);continue;}
    const bytes=pin.app==='athens'&&row.path===pin.entry?Buffer.from(output):checked(path.join(payload,'blobs',row.sha256),row.sha256);
    assert.equal(bytes.length,row.size,row.path);assert.equal(sha(bytes),row.sha256,row.path);write(dst,bytes);
  }
  const receipt=selectRegisteredCity({home,app:pin.app,id:pin.id,expectedCurrentSHA256:null,expectedManifestSHA256:pin.manifest,job:'cloud-source-transfer-'+pin.id});
  assert.equal(receipt.state,'committed');
}
const result={passed:true,athens:lock.athens.id,athensEntrySHA256:sha(output),sparta:lock.sparta.id,managedCitySelection:true,installedWindowsGameModified:false};
fs.writeFileSync(path.join(root,'dist/BUILD-VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
