import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {out,read} from './window.mjs';

const parent=read('PARENT.json');
const home=process.env.LOCALAPPDATA+'/Athens-Babylon';
const original=fs.readFileSync(parent.entryPath,'utf8');
assert.equal(sha256(original),parent.entrySHA256);
if(!process.argv.includes('--reproduce')) {
  assert.equal(readPointer(home,'athens').sha256,parent.pointerSHA256);
  for(const [file,hash] of Object.entries(parent.protected))assert.equal(fileSHA(home+'/'+file),hash);
}

// Keep any shared materials and the existing native mesh allocation sequence.
// Remove the Old Council before the neighbouring districts collect collision.
const civic='else wGe(i,r,M,C,s,e)}let g=new xv(i,t,!0);';
const steps='AthensNorthMarket.buildCompactEntrance(new rv(this.scene,"agora-compact-entrance",HU(this.scene,this.baseUrl)),r.getHeightAt),';
const trees='AthensNorthMarket.plantContact(this.scene,r.getHeightAt),this.walkSupport=oGe(this.scene,r.getHeightAt)';
const patches=[
  {owner:'Old Council, the small hall directly ahead',before:civic,
    after:'else{let building=wGe(i,r,M,C,s,e);if(M.id==="old-council")building.dispose(!1,!1)}'+'}let g=new xv(i,t,!0);'},
  {owner:'Former eight-step square entrance and both masonry sides',before:steps,after:''},
  {owner:'Single low-poly cypress beside the steps',before:trees,
    after:trees.replace('this.walkSupport=', 'this.scene.getMeshByName("cypress_redesign_cypress_40")?.dispose(!1,!1),this.walkSupport=')},
];

let candidate=original;
const spans=patches.map(({owner,before,after})=>{
  assert.equal(candidate.split(before).length,2,owner);
  const offset=candidate.indexOf(before);
  candidate=candidate.slice(0,offset)+after+candidate.slice(offset+before.length);
  return {owner,before,after,offset};
});
let inverse=candidate;
for(const {before,after,offset} of spans.toReversed()){
  assert.equal(inverse.slice(offset,offset+after.length),after);
  inverse=inverse.slice(0,offset)+before+inverse.slice(offset+after.length);
}
assert.equal(inverse,original);
const entrySHA256=sha256(candidate);
const entry='assets/babylon-athens-agora-entrance-clearing-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,parentEntrySHA256:parent.entrySHA256,entry,entrySHA256,
  inverseExact:true,nativeSpans:spans.length,source:'prepare.mjs and PATCHES.json',
  build:'node output/playwright/agora-entrance-clearing/prepare.mjs',
  reproduce:'node output/playwright/agora-entrance-clearing/prepare.mjs --reproduce',
  targets:{building:'architecture_old-council at [-124, 2.4, 72]',
    stair:'architecture_agora-compact-entrance',tree:'cypress_redesign_cypress_40 at [-99, 73]'},
};

if(process.argv.includes('--reproduce')){
  const installed=read('INSTALL-COMPLETION.json');
  assert.equal(entrySHA256,installed.entrySHA256);
  assert.equal(candidate,fs.readFileSync(home+'/apps/athens/releases/'+installed.selected+'/build/'+entry,'utf8'));
}else{
  fs.writeFileSync(new URL('candidate.mjs',out),candidate);
  fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify(spans,null,2)+'\n');
  fs.writeFileSync(new URL('SOURCE-RECIPE.json',out),JSON.stringify(recipe,null,2)+'\n');
}
console.log(JSON.stringify(recipe));
