import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {AgoraDipylonView as plan} from './DipylonView.mjs';
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

const patches=[];
let candidate=original;
function change(owner,before,after) {
  assert.equal(candidate.split(before).length,2,owner);
  candidate=candidate.replace(before,()=>after);
  patches.push({owner,before,after});
}
const terrainFormula='y=Math.fround(applyNorth?AgoraEntranceGround.grade(x,z,base):base)';
change('Fit all three buildings to the actual rendered and walked terrain',
  terrainFormula,terrainFormula.replace('AgoraEntranceGround.grade(x,z,base)','AgoraDipylonView.grade(x,z,AgoraEntranceGround.grade(x,z,base),a[1])'));
change('Use the existing terrain fitter for the three measured sites',
  'applyNorth?[...activeAreas,...AthensNorthMarket.terrainAreas]:activeAreas',
  'applyNorth?[...activeAreas,...AthensNorthMarket.terrainAreas,...AgoraDipylonView.areas]:activeAreas');
change('Fit terrain vertices at the measured east and west edges',
  '...AthensNorthMarket.detailCuts(bounds,0)]:xLimits',
  '...AthensNorthMarket.detailCuts(bounds,0),...AgoraDipylonView.detailCuts(bounds,0)]:xLimits');
change('Fit terrain vertices at the measured north and south edges',
  '...AthensNorthMarket.detailCuts(bounds,2)]:zLimits',
  '...AthensNorthMarket.detailCuts(bounds,2),...AgoraDipylonView.detailCuts(bounds,2)]:zLimits');
const relocate='return AthensNorthMarket.relocate(AthensCivicStage.relocate(AthensAgoraMasterLayout.relocateArchitecture(wGeAgoraOriginal(i,e,t,r,s,a))))';
change('Move the three whole civic buildings with their native local supports',relocate,
  'return AgoraDipylonView.relocate('+relocate.slice('return '.length)+')');
const probes='diagnostics.seatingProbes=[...AthensNorthMarket.paintedChecks(protectedPainted,original),...moved]';
change('Check the three buildings at their new sites',probes,probes.replace('=[',' =AgoraDipylonView.refitProbes([')+',original)');

const oldCourt='accessBuilder(k,{x:-148,z:52},actual,k.p.marble);access.solid("Shared civic court",court,k.p.pavement??k.p.marble),steps.forEach((rect,i)=>access.solid("Council public stair "+(i+1),rect)),doorLandings.forEach(rect=>access.solid("Council threshold landing",rect));';
change('Fit the council forecourt, stair flights and threshold landings to its new building anchor',oldCourt,
  oldCourt.replace('{x:-148,z:52}','AgoraDipylonView.councilOrigin').replace('court,k.p','AgoraDipylonView.councilCourt(court),k.p')
    .replaceAll(',rect)',',AgoraDipylonView.shiftCouncil(rect))'));
change('Use the moved council doorway coordinates in the native route mask',
  'doorways:[43.4,60.6],floor:3.2,residencyOwner:id',
  'doorways:AgoraDipylonView.councilDoors,floor:AgoraDipylonView.councilFloor,residencyOwner:id');
const oldRoutes='...paths.map(path=>({...path,type:"path",role:"civic"})),...[43.4,60.6].map(z=>({id:`civic-council-door-${z}`,width:3.6,type:"path",role:"civic",points:[[-125,z],[-137,z],[-139.3,z]]}))';
change('Route the public path in front of Zeus and to both council doors',oldRoutes,
  oldRoutes.replace('paths.map(path','paths.map(AgoraDipylonView.civicPath).map(path').replace('...[43.4,60.6]','...AgoraDipylonView.councilDoors')
    .replace('[[-125,z],[-137,z],[-139.3,z]]','[[-139.5,z],[-146.5,z],[-148.8,z]]'));
change('Clear the native planting mask using the new whole-building footprints',
  'function addFootprint(rows){let b=EAST_SITE_default.court;return[...rows,',
  'function addFootprint(rows){let b=EAST_SITE_default.court;return[...AgoraDipylonView.remapFootprints(rows),');
change('Keep the approved shade trees and move only the three near the Painted Stoa pad',
  '.map(AgoraSquareLife.fitZone)),px=','.map(AgoraSquareLife.fitZone).map(AgoraDipylonView.fitZone)),px=');
const walk='const approach = [\r\n    [-129, 62], [-125.5, 64], [-121.5, 67.5], [-117, 71],\r\n    [-111.5, 74.75], [-104, 79.5], [-102.5, 82.4],\r\n  ];';
const exactWalk=original.includes(walk)?walk:walk.replaceAll('\r\n','\n');
change('Join the established square entrance to the moved council court',exactWalk,'const approach = AgoraDipylonView.councilWalk;');
change('Start the reused gravel finish at the new north council doorway',
  '((61.3 - extent.south) / stepZ)','((58.5 - extent.south) / stepZ)');
change('Feather the council gravel finish off the actual frontage','smooth(61.3, 64.2, z) * (1 - court)',
  'smooth(58.5, 62, z) * (1 - court)');
change('Include both ends of the local council approach on the existing ground mask',
  '((-133 - extent.west) / stepX)','((-149 - extent.west) / stepX)');
change('Relocate the one olive previously inside the new council outline',
  'this.walkSupport=oGe(this.scene,r.getHeightAt)','AgoraDipylonView.reseatCouncilOlive(this.scene,r.getHeightAt),this.walkSupport=oGe(this.scene,r.getHeightAt)');
const oldMarket='const lane = [\r\n    [-91.9, 104.9], [-90, 106], [-82, 111], [-79, 119],\r\n    [-76.5, 128], [-76, 130.85], [-61, 130.85],\r\n  ];';
change('Keep the market lane clear around the relocated Painted Stoa',
  original.includes(oldMarket)?oldMarket:oldMarket.replaceAll('\r\n','\n'),'const lane = AgoraDipylonView.marketLane;');
change('Keep the existing shopper around the new front of the stoa',
  'function actorStops(id,rows){let waypoints=NORTH_SITE_default.actors[id];',
  'function actorStops(id,rows){let waypoints=AgoraDipylonView.shopperStops(id,NORTH_SITE_default.actors[id]);');

let inverse=candidate;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2);
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
const source=fs.readFileSync(new URL('DipylonView.mjs',out),'utf8');
assert(source.startsWith('export const AgoraDipylonView'));
const prefix=source.slice('export '.length)+'\n';
candidate=prefix+candidate;
const entrySHA256=sha256(candidate),entry='assets/babylon-athens-agora-dipylon-view-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,parentEntrySHA256:parent.entrySHA256,entry,entrySHA256,
  inverseExact:true,nativeSpans:patches.length,source:'DipylonView.mjs and PATCHES.json',
  build:'node output/playwright/agora-dipylon-view/prepare.mjs',
  reproduce:'node output/playwright/agora-dipylon-view/prepare.mjs --reproduce',sites:plan.sites};
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
