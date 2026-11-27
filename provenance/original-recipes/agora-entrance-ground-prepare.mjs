import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {AgoraEntranceGround} from './AgoraEntranceGround.mjs';
import {out,read} from './window.mjs';

const parent=read('PARENT.json');
const home=process.env.LOCALAPPDATA+'/Athens-Babylon';
const original=fs.readFileSync(parent.entryPath,'utf8');
assert.equal(sha256(original),parent.entrySHA256);
const reproduce=process.argv.includes('--reproduce');
if(!reproduce){
  assert.equal(readPointer(home,'athens').sha256,parent.pointerSHA256);
  for(const [file,hash] of Object.entries(parent.protected))assert.equal(fileSHA(home+'/'+file),hash);
}

// This is the same fitted vertex for the rendered ground, normals and
// the native height sampler. The former-height reference pass stays exact.
const oldGrade='y=Math.fround((applyNorth?AthensNorthMarket.grade(x,z,a[1]):null)??grade(x,z,a[1]))';
const terrainGrade='base=(applyNorth?AthensNorthMarket.grade(x,z,a[1]):null)??grade(x,z,a[1]),'+
  'y=Math.fround(applyNorth?AgoraEntranceGround.grade(x,z,base):base)';
assert.equal(original.split(oldGrade).length,2);

const source=fs.readFileSync(new URL('AgoraEntranceGround.mjs',out),'utf8');
assert(source.startsWith('export const AgoraEntranceGround'));
const prefix=source.slice('export '.length)+'\n';
const candidate=prefix+original.replace(oldGrade,()=>terrainGrade);
assert.equal(candidate.split(terrainGrade).length,2);
assert.equal(candidate.slice(prefix.length).replace(terrainGrade,()=>oldGrade),original);

const entrySHA256=sha256(candidate);
const entry='assets/babylon-athens-agora-entrance-ground-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,parentEntrySHA256:parent.entrySHA256,entry,entrySHA256,
  inverseExact:true,nativeSpans:1,source:'AgoraEntranceGround.mjs and PATCHES.json',
  build:'node output/playwright/agora-entrance-ground/prepare.mjs',
  reproduce:'node output/playwright/agora-entrance-ground/prepare.mjs --reproduce',
  bounds:AgoraEntranceGround.bounds};

if(reproduce){
  const installed=read('INSTALL-COMPLETION.json');
  assert.equal(entrySHA256,installed.entrySHA256);
  assert.equal(candidate,fs.readFileSync(home+'/apps/athens/releases/'+installed.selected+'/build/'+entry,'utf8'));
}else{
  fs.writeFileSync(new URL('candidate.mjs',out),candidate);
  fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix,before:oldGrade,after:terrainGrade},null,2)+'\n');
  fs.writeFileSync(new URL('SOURCE-RECIPE.json',out),JSON.stringify(recipe,null,2)+'\n');
}
console.log(JSON.stringify(recipe));
