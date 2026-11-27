import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {AgoraSquareLife} from './AgoraSquareLife.mjs';
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

const atlas='AgoraSquareEdge.paintMask(n,t,r,e);return{pixels:n';
const zone='.map(AthensEastEdge.fitZone)),px=';
const trees='this.walkSupport=oGe(this.scene,r.getHeightAt)';
const seats='AthensEastEdge.benchSupports(i,e)),r=(s,a,n)=>';
const jump='.concat(i.metadata?.agoraEastMeeting?.benches??[]),r=(n,o,l)=>';
const scatter='AgoraSquareEdge.clearances.some(area=>intersects(box,area))),local)';
const decor='for(let Ie of AthensNorthMarket.ornaments(AthensCivicStage.moveLooseOrnaments(Ce)))';
const patches=[
  {owner:'Ground finish for the lane after the square and council approach',before:atlas,
    after:atlas.replace(';return',';AgoraSquareLife.paintLane(n,t,r,e);return')},
  {owner:'Reuse two existing seats and move the existing lane olive',before:zone,
    after:'.map(AthensEastEdge.fitZone).map(AgoraSquareLife.fitZone)),px='},
  {owner:'Seat the three named older olives on the local ground',before:trees,
    after:'AgoraSquareLife.groupOlives(this.scene,r.getHeightAt),'+trees},
  {owner:'Match walking and camera support to the existing seats at their new anchors',before:seats,
    after:seats.replace('i,e))','i,e),AgoraSquareLife.seatSupports(i,e))')},
  {owner:'Match jump landing to the same two seats',before:jump,
    after:jump.replace('??[]),','??[],i.metadata?.agoraSquareShade?.seats??[]),')},
  {owner:'Keep loose native scatter out of the market lane',before:scatter,
    after:scatter.replace('some(area=>intersects(box,area)))','some(area=>intersects(box,area))||AgoraSquareLife.laneBoxes.some(area=>intersects(box,area)))')},
  {owner:'Keep complete loose prop objects out of the walking line',before:decor,
    after:decor.slice(0,-1)+'.filter(AgoraSquareLife.keepOrnament))'},
];
const source=fs.readFileSync(new URL('AgoraSquareLife.mjs',out),'utf8');
assert(source.startsWith('export const AgoraSquareLife'));
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
const entry='assets/babylon-athens-agora-shade-market-lane-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,parentEntrySHA256:parent.entrySHA256,entry,entrySHA256,
  inverseExact:true,nativeSpans:patches.length,source:'AgoraSquareLife.mjs and PATCHES.json',
  build:'node output/playwright/agora-shade-market-lane/prepare.mjs',
  reproduce:'node output/playwright/agora-shade-market-lane/prepare.mjs --reproduce',
  shade:{seats:AgoraSquareLife.seatSites,olives:AgoraSquareLife.olives,movedLaneOlive:AgoraSquareLife.laneOlive},lane:AgoraSquareLife.lane};

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
