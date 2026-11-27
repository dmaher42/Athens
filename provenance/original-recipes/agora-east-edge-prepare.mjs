import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {out,owned,read} from './window.mjs';

const parent=read('PARENT.json'),site=read('EAST-SITE.json'),home=process.env.LOCALAPPDATA+'/Athens-Babylon';
assert.equal(site.parent,parent.selected.id);
assert.equal(readPointer(home,'athens').sha256,parent.pointerSHA256);
for(const [name,digest] of Object.entries(parent.protected))assert.equal(fileSHA(home+'/'+name),digest);
const original=fs.readFileSync(parent.entryPath,'utf8'),patches=[];
assert.equal(sha256(original),parent.entrySHA256);
let body=original;
function patch(owner,before,after){
  assert.equal(body.split(before).length,2,owner);
  body=body.replace(before,()=>after);
  patches.push({owner,before,after});
}
function wrap(owner,needle,receiver){
  const from=body.indexOf(needle);
  assert(from>=0&&from===body.lastIndexOf(needle),owner);
  let level=1,end=from+needle.length,string=null;
  for(;end<body.length;end++){
    const c=body[end];
    if(c==='\\'&&string){end++;continue;}
    if(string){if(c===string)string=null;continue;}
    if(c==='"'||c==="'"||c==='`'){string=c;continue;}
    if(c==='(')level++;
    if(c===')'&&--level===0)break;
  }
  assert.equal(level,0,owner);
  const before=body.slice(from,end+1);
  patch(owner,before,receiver+'('+before+')');
}
patch('Arrange the existing east-side olive shade and stone seats before native construction',
  '.map(AthensNorthMarket.zone)),px=','.map(AthensNorthMarket.zone).map(AthensEastEdge.fitZone)),px=');
wrap('Give the existing terrain material the measured foot route','AthensNorthMarket.addRoutes(AthensCivicStage.civicRoutes(','AthensEastEdge.addRoutes');
wrap('Connect the native pedestrian plan to the east meeting area','AthensNorthMarket.addRoutes(AthensCivicStage.civicWalks(','AthensEastEdge.addRoutes');
wrap('Keep the foot-worn meeting ground clear of high grass','AthensNorthMarket.footprints(AthensCivicStage.remapFootprints(','AthensEastEdge.addFootprint');
patch('Use the real east stone seats in native walking and camera support',
  '.concat(AthensNorthMarket.counterSupports(i)),r=(s,a,n)=>',
  '.concat(AthensNorthMarket.counterSupports(i),AthensEastEdge.benchSupports(i,e)),r=(s,a,n)=>');
patch('Use the same stone seats in the native jump landing query',
  'floors:n.metadata.floorPlanes??[],boxes:n.metadata.collisionBoxes??[]})),r=(n,o,l)=>',
  'floors:n.metadata.floorPlanes??[],boxes:n.metadata.collisionBoxes??[]})).concat(i.metadata?.agoraEastMeeting?.benches??[]),r=(n,o,l)=>');

let inverse=body;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2,before.slice(0,85));
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
if(process.argv.includes('--source-check')){console.log(JSON.stringify({patches:patches.length,parentInverseExact:true}));process.exit(0);}
owned();
const esbuild=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json')('esbuild');
const compiled=esbuild.buildSync({entryPoints:[fileURLToPath(new URL('EastEdge.mjs',out))],bundle:true,format:'iife',
  globalName:'AthensEastEdge',target:'es2022',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false});
const prefix=compiled.outputFiles[0].text+'\n',candidate=prefix+body,digest=sha256(candidate);
esbuild.transformSync(candidate,{loader:'js',logLevel:'silent'});
const source=Object.fromEntries(['EastEdge.mjs','EAST-SITE.json'].map(name=>[name,fileSHA(fileURLToPath(new URL(name,out)))]));
const prep={...parent,home,candidateSHA256:digest,candidateEntry:'assets/babylon-athens-east-edge-'+digest.slice(0,12)+'.js',
  nativePatches:patches.length,source,siteAnchor:'Agora east shaded meeting edge',compilerVersion:esbuild.version,prefixSHA256:sha256(prefix)};
fs.writeFileSync(new URL('candidate.js',out),candidate);
fs.writeFileSync(new URL('PREP.json',out),JSON.stringify(prep,null,2)+'\n');
fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix,patches},null,2)+'\n');
console.log(JSON.stringify({entry:prep.candidateEntry,parent:parent.selected.id,patches:patches.length,parentInverseExact:true}));
