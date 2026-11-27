import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {out,owned,read} from './window.mjs';

const parent=read('PARENT.json'),home=process.env.LOCALAPPDATA+'/Athens-Babylon';
assert.equal(readPointer(home,'athens').sha256,parent.pointerSHA256);
for(const [name,digest] of Object.entries(parent.protected))assert.equal(fileSHA(home+'/'+name),digest);
assert.equal(read('NORTH-SITE.json').compactionParent,parent.selected.id);
const original=fs.readFileSync(parent.entryPath,'utf8');
assert.equal(sha256(original),parent.entrySHA256);
owned();

const esbuild=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json')('esbuild');
const compiled=esbuild.buildSync({entryPoints:[fileURLToPath(new URL('NorthMarket.mjs',out))],
  bundle:true,format:'iife',globalName:'AthensNorthMarket',target:'es2022',
  minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false});
const replacement=compiled.outputFiles[0].text+'\n';
const prior=read('../agora-north-market/prepared/773b06221056/PATCHES.json').prefix;
const patches=[];
let body=original;
function patch(owner,before,after){
  assert.equal(body.split(before).length,2,owner);
  body=body.replace(before,()=>after);
  patches.push({owner,before,after});
}
patch('Rebuild the existing north Agora site owner with the compact layout',prior,replacement);
const council='AthensCivicStage.buildCouncilAccess(new rv(this.scene,"agora-council-access",HU(this.scene,this.baseUrl)),r.getHeightAt),';
patch('Build the fitted entrance before the existing floor and camera capture',council,
  council+'AthensNorthMarket.buildCompactEntrance(new rv(this.scene,"agora-compact-entrance",HU(this.scene,this.baseUrl)),r.getHeightAt),');
const loose='createPlan(mesh2,"bounded loose scenery",box=>[...zeusOccupied,...royalEnvelopes,...roads].some(r=>intersects(box,r)),local)';
patch('Clear loose native scatter from the fitted stone entrance',loose,
  loose.replace(',local)', '||mesh2.name.startsWith("athens_scatter_")&&intersects(box,AthensNorthMarket.entranceScatterClearance),local)'));

let inverse=body;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2);
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
const digest=sha256(body);
esbuild.transformSync(body,{loader:'js',logLevel:'silent'});
const source=Object.fromEntries(['NorthMarket.mjs','NORTH-SITE.json','Entrance.mjs'].map(name=>[name,fileSHA(fileURLToPath(new URL(name,out)))]));
const prep={...parent,home,candidateSHA256:digest,candidateEntry:'assets/babylon-athens-agora-compaction-'+digest.slice(0,12)+'.js',
  nativePatches:patches.length,source,siteAnchor:'Shortened north Agora and council-side entrance',
  compilerVersion:esbuild.version,prefixSHA256:sha256(replacement)};
fs.writeFileSync(new URL('candidate.js',out),body);
fs.writeFileSync(new URL('PREP.json',out),JSON.stringify(prep,null,2)+'\n');
fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix:'',patches},null,2)+'\n');
console.log(JSON.stringify({entry:prep.candidateEntry,parent:parent.selected.id,patches:patches.length,parentInverseExact:true}));
