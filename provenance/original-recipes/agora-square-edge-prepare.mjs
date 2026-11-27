import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {AgoraSquareEdge} from './AgoraSquareEdge.mjs';
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

const atlas='}return{pixels:n,width:t,height:r,bounds:e,metadata:{algorithm:"bounded-segment-and-tree-stamps;scanline-landscape"';
const build='this.scene.getMeshByName("cypress_redesign_cypress_40")?.dispose(!1,!1),this.walkSupport=oGe(this.scene,r.getHeightAt)';
const scatter='intersects(box,AthensNorthMarket.entranceScatterClearance),local)';
const patches=[
  {owner:'Fitted square and council approach in the existing ground atlas',before:atlas,
    after:atlas.replace('}return','}AgoraSquareEdge.paintMask(n,t,r,e);return')},
  {owner:'Low limestone edging before walking support is captured',before:build,
    after:build.replace('this.walkSupport=', 'AgoraSquareEdge.buildEdging(new rv(this.scene,"agora-square-low-edging",HU(this.scene,this.baseUrl)),r.getHeightAt),this.walkSupport=')},
  {owner:'Keep loose scatter out of the square and the approach',before:scatter,
    after:'(intersects(box,AthensNorthMarket.entranceScatterClearance)||AgoraSquareEdge.clearances.some(area=>intersects(box,area))),local)'},
];

const source=fs.readFileSync(new URL('AgoraSquareEdge.mjs',out),'utf8');
assert(source.startsWith('export const AgoraSquareEdge'));
const prefix=source.slice('export '.length)+'\n';
let candidate=original;
for(const {before,after,owner} of patches){
  assert.equal(candidate.split(before).length,2,owner);
  candidate=candidate.replace(before,()=>after);
}
let inverse=candidate;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2);
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
candidate=prefix+candidate;

const entrySHA256=sha256(candidate);
const entry='assets/babylon-athens-agora-square-edge-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,parentEntrySHA256:parent.entrySHA256,entry,entrySHA256,
  inverseExact:true,nativeSpans:patches.length,source:'AgoraSquareEdge.mjs and PATCHES.json',
  build:'node output/playwright/agora-square-edge/prepare.mjs',
  reproduce:'node output/playwright/agora-square-edge/prepare.mjs --reproduce',
  square:AgoraSquareEdge.square,approach:AgoraSquareEdge.approach,stoneRuns:AgoraSquareEdge.stoneRuns};

if(reproduce){
  const installed=read('INSTALL-COMPLETION.json');
  assert.equal(entrySHA256,installed.entrySHA256);
  assert.equal(candidate,fs.readFileSync(home+'/apps/athens/releases/'+installed.selected+'/build/'+entry,'utf8'));
}else{
  fs.writeFileSync(new URL('candidate.mjs',out),candidate);
  fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix,patches},null,2)+'\n');
  fs.writeFileSync(new URL('SOURCE-RECIPE.json',out),JSON.stringify(recipe,null,2)+'\n');
}
console.log(JSON.stringify(recipe));
