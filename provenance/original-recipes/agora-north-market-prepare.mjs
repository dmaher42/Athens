import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {out,owned,read} from './window.mjs';

const parent=read('PARENT.json'),home=process.env.LOCALAPPDATA+'/Athens-Babylon';
assert.equal(readPointer(home,'athens').sha256,parent.pointerSHA256);
for(const [name,digest] of Object.entries(parent.protected))assert.equal(fileSHA(home+'/'+name),digest);
const original=fs.readFileSync(parent.entryPath,'utf8');
assert.equal(sha256(original),parent.entrySHA256);
const patches=[];
let body=original;
function patch(owner,before,after){
  assert.equal(body.split(before).length,2,owner);
  body=body.replace(before,()=>after);
  patches.push({owner,before,after});
}
function wrapCall(owner,needle,receiver) {
  const from=body.indexOf(needle);
  assert(from>=0&&from===body.lastIndexOf(needle),owner);
  let level=1,end=from+needle.length,string=null;
  for(;end<body.length;end++) {
    const c=body[end];
    if(c==='\\'&&string){end++;continue;}
    if(string){if(c===string)string=null;continue;}
    if(c==='"'||c==="'"||c==='`'){string=c;continue;}
    if(c==='(')level++;
    if(c===')'&&--level===0)break;
  }
  assert.equal(level,0,owner);
  const prev=body.slice(from,end+1);
  patch(owner,prev,receiver+'('+prev+')');
}

patch('Seat the north landmarks before native floor and collision capture',
  'return AthensCivicStage.relocate(AthensAgoraMasterLayout.relocateArchitecture(wGeAgoraOriginal(i,e,t,r,s,a)))',
  'return AthensNorthMarket.relocate(AthensCivicStage.relocate(AthensAgoraMasterLayout.relocateArchitecture(wGeAgoraOriginal(i,e,t,r,s,a))))');
patch('Fit the square, stalls and four stone contacts in the existing ground pass',
  'y=Math.fround(grade(x,z,a[1])),value=Math.fround(a[3])',
  'y=Math.fround((applyNorth?AthensNorthMarket.grade(x,z,a[1]):null)??grade(x,z,a[1])),value=Math.fround(a[3])');
patch('Extend the existing local triangle support index',
  'function fitCivicTerrain(p,uv,mask,grouped,nativeHeight,makeHeight){let positions=',
  'function fitCivicTerrain(p,uv,mask,grouped,nativeHeight,makeHeight,applyNorth=true){let effectiveAreas=applyNorth?[...activeAreas,...AthensNorthMarket.terrainAreas]:activeAreas,positions=');
patch('Limit the original and new terrain indexes to their own reviewed areas',
  'if(!activeAreas.some(rect=>intersects(rect,bounds)))',
  'if(!effectiveAreas.some(rect=>intersects(rect,bounds)))');
patch('Keep the old height query available only during the inherited house plot selection',
  'height=(x,z)=>activeAreas.some(area2=>contains(x,z,area2))?',
  'height=(x,z)=>effectiveAreas.some(area2=>contains(x,z,area2))?');
patch('Split only local faces at the new north plot edges',
  'let pieces=split(split([old],0,cuts(minX,maxX,xLimits)),2,cuts(minZ,maxZ,zLimits));',
  'let pieces=split(split([old],0,cuts(minX,maxX,applyNorth?[...xLimits,...AthensNorthMarket.detailCuts(bounds,0)]:xLimits)),2,cuts(minZ,maxZ,applyNorth?[...zLimits,...AthensNorthMarket.detailCuts(bounds,2)]:zLimits));');
patch('Preserve the parent terrain query until existing procedural plot identities are captured',
  'let civicGround=AthensCivicStage.fitCivicTerrain(f,d,g,X,m,PP);',
  'let northParentHeight=AthensCivicStage.fitCivicTerrain(f,d,g,X,m,PP,false).height,civicGround=AthensCivicStage.fitCivicTerrain(f,d,g,X,m,PP);');
patch('Expose only the parent plot sampler during the one inherited generation pass',
  'civicStageGround:{...civicGround.stats,heightAt:m},countryGrade:',
  'civicStageGround:{...civicGround.stats,heightAt:m},northParentHeight,countryGrade:');
patch('Pin the terrain for the old plot eligibility rules before building the northern change',
  'function Fet(i,e,t,r,s,a){let n=new Te("athensRedesignRoot",i);',
  'function Fet(i,e,t,r,s,a){const northTerrain=i.getMeshByName("athensCanonicalTerrain").metadata;const parentPlotHeight=northTerrain.northParentHeight;delete northTerrain.northParentHeight;let n=new Te("athensRedesignRoot",i);');
patch('Preserve the old source market reservations for the procedural house sequence',
  '...fd.map(Ie=>({x:Ie.x,z:Ie.z,w:7,d:7})),...eae.map',
  '...AthensNorthMarket.originalMarketSites(fd).map(Ie=>({x:Ie.x,z:Ie.z,w:7,d:7})),...eae.map');
patch('Keep the original house terrain eligibility while fitting retained local geometry',
  'O=(Ie,qe,Xe,$e)=>{let ut=[[Ie,qe]',
  'O=(Ie,qe,Xe,$e,sample=e)=>{let ut=[[Ie,qe]');
patch('Use the deliberate old or current plot height at the existing point samples',
  'for(let[$t,sr]of ut){let Ar=e($t,sr);if(Ar===null',
  'for(let[$t,sr]of ut){let Ar=sample($t,sr);if(Ar===null');
patch('Keep existing procedural house indices and fit their retained views on current land',
  'Ar=O($e,Xe,$t*.5,sr*.5);if(!Ar.ok||Ar.maxY-Ar.minY>4.2||!P($e,Xe,$t*.5,sr*.5,1.45,Ie.checkReserve))continue;let Pr=',
  'Ar=AthensNorthMarket.originalHouse($e,Xe,ut,st,Mt,It,xe);if(!Ar)continue;if(AthensNorthMarket.touchesTerrain($e,Xe)){let currentHouseSite=O($e,Xe,$t*.5,sr*.5);if(currentHouseSite.ok)Ar=currentHouseSite}let Pr=');
patch('Preserve the exact earlier procedural tree identities before moving square planting',
  'let st=e(qe,Xe);if(st===null||st<1.65||Xe<-4&&st>18)return!1;let Mt=Ie==="olive"?1.8:1.3;return P(qe,Xe,Mt,Mt,.8,ut)?(Ie==="olive"?',
  'let retained=AthensNorthMarket.originalTree(Ie,qe,Xe,$e,Ie==="olive"?De:ke);if(!retained)return!1;let st=AthensNorthMarket.touchesTerrain(qe,Xe)?e(qe,Xe)??retained.y:retained.y;return (Ie==="olive"?');
patch('Finish the original tree branch and check the complete procedural census',
  'ke++),I.push({x:qe,z:Xe,w:3,d:3}),!0):!1},Ae=',
  'ke++),I.push({x:qe,z:Xe,w:3,d:3}),!0)},Ae=');
patch('Keep the earlier foliage density and sequence before the local scene adjustment',
  'ye(Xe?"cypress":"olive",Ie,qe,$e,!0)}let Ne=[],Ge=[],_e=[];',
  'ye(Xe?"cypress":"olive",Ie,qe,$e,!0)}AthensNorthMarket.verifyProceduralCounts(xe,De,ke);let Ne=[],Ge=[],_e=[];');
patch('Preserve the old loose vegetation eligibility and random stream',
  'let ut=e(qe,Xe);if(ut===null||ut<1.3||!P(qe,Xe,.9,.9,.6,!1))continue;',
  'let ut=parentPlotHeight(qe,Xe);if(ut===null||ut<1.3||!P(qe,Xe,.9,.9,.6,!1))continue;');
patch('Seat the same three local terrain-detail batches on the actual ground',
  'AthensCivicStage.rebindSmallDetails(i,e,Ne),n),pn("redesignShrubsBatch",Xt,_,AthensCivicStage.rebindSmallDetails(i,e,Ge),n),pn("redesignGrassBatch",tr,_,AthensCivicStage.rebindSmallDetails(i,e,_e)',
  'AthensCivicStage.rebindSmallDetails(i,e,AthensNorthMarket.seatRetainedDetails(Ne,parentPlotHeight,e)),n),pn("redesignShrubsBatch",Xt,_,AthensCivicStage.rebindSmallDetails(i,e,AthensNorthMarket.seatRetainedDetails(Ge,parentPlotHeight,e)),n),pn("redesignGrassBatch",tr,_,AthensCivicStage.rebindSmallDetails(i,e,AthensNorthMarket.seatRetainedDetails(_e,parentPlotHeight,e))');
patch('Log the precise existing clearance identity if any old plot is affected',
  'throw Error("Surveyed workshop obstruction identity changed")',
  'throw Error("Surveyed workshop obstruction identity changed "+t.id+" "+JSON.stringify(found.map(c=>[c.cx,c.cz])))');
patch('Check the retained Painted Stoa floors at their new location',
  'diagnostics.seatingProbes=[...protectedPainted,...moved]',
  'diagnostics.seatingProbes=[...AthensNorthMarket.paintedChecks(protectedPainted,original),...moved]');
patch('Clear the one planned garden villa from the north public frontage',
  '].map(AthensCivicStage.homeSite).forEach((t,r)=>{let s=t.civicFloor',
  '].map(AthensCivicStage.homeSite).filter(AthensNorthMarket.keepHome).forEach((t,r)=>{let s=t.civicFloor');
patch('Build the original cloth lots at their new addresses before thresholds and roof separation',
  '...DUe,om],n=a.map((C,w)=>{let O=',
  '...DUe.map(AthensNorthMarket.artisanLot),om],n=a.map((C,w)=>{let O=');
patch('Rebuild the complete cloth work area on its new ground samples before migration',
  'LUe(s,r),zUe(s,r);let c={root:s,buildings:n',
  'AthensNorthMarket.clothCourt(LUe,s,r),zUe(s,r);let c={root:s,buildings:n');
patch('Rejoin the retained working areas using their moved footpaths',
  '...PUe,...IUe];async function GUe',
  '...PUe.map(AthensNorthMarket.serviceRoute),...IUe];async function GUe');
patch('Build the wool service yard against its actual new terrain before validating footings',
  'function xet(i,e,t="/athens-game-starter/"){let r=Hfe',
  'function xet(i,e,t="/athens-game-starter/"){e=AthensNorthMarket.woolHeight(e);let r=Hfe');
patch('Publish the matching wool yard, workers, approach and terrain records',
  'else o.status="rejected-terrain";f.metadata=o,i.metadata={...i.metadata,woolServiceYard:o}',
  'else o.status="rejected-terrain";AthensNorthMarket.woolMetadata(f,o);f.metadata=o,i.metadata={...i.metadata,woolServiceYard:o}');
patch('Send wool yard solids to the original packed collision index at their new positions',
  'for(let h of c?.solids??[])u.add(h.a,h.b,h.c,h.name);a.add(u)',
  'for(let h of c?.solids??[])AthensNorthMarket.woolCollision(u,h);a.add(u)');
const fountainStart=body.indexOf('{let Xe=O(-96,94,5.2,3.8)');
const fountainEnd=body.indexOf('{let Xe=O(-26,120',fountainStart);
assert(fountainStart>0&&fountainEnd>fountainStart);
const fountain=body.slice(fountainStart,fountainEnd),[fountainX,fountainZ]=read('NORTH-SITE.json').fountain.to;
assert(fountain.includes('crossroads-fountain-basin')&&fountain.endsWith('J++}}'));
patch('Set the original fountain, basin, columns, steps and solid walls on the western square edge',
  fountain,fountain.replaceAll('-96',String(fountainX)).replace(/\b94\b/g,String(fountainZ))
    .replace(`P(${fountainX},${fountainZ},5.2,3.8,1.5,!1)`,'P(-96,94,5.2,3.8,1.5,!1)')
    .replace(`I.push({x:${fountainX},z:${fountainZ},w:11.4,d:8.6})`,'I.push({x:-96,z:94,w:11.4,d:8.6})'));
patch('Keep the small Royal-edge stall apart from the north wool service entrance',
  'yne=Object.freeze([[-123.5,138],[-109,108]])',
  'yne=Object.freeze([[-126,144],[-109,108]])');
patch('Clear only surveyed generic houses that conflict with the public north layout',
  '...AthensCivicStage.selectFillerHouses(scene,colliders,AthensAgoraMasterLayout.selectFillerHouses(scene,colliders),[...approved.CIRCLED_AGORA_HOUSES,...targets])',
  '...AthensNorthMarket.clearFiller(scene,colliders,AthensCivicStage.selectFillerHouses(scene,colliders,AthensAgoraMasterLayout.selectFillerHouses(scene,colliders),[...approved.CIRCLED_AGORA_HOUSES,...targets]),[...approved.CIRCLED_AGORA_HOUSES,...targets])');
patch('Send the existing stalls, trees, benches and goods to their matching edge plots',
  '].map(AthensAgoraMasterLayout.remapZone)),px=',
  '].map(AthensAgoraMasterLayout.remapZone).map(AthensNorthMarket.zone)),px=');
patch('Keep the original market account and move only its physical transaction locations',
  '].map(AthensAgoraMasterLayout.remapMarketSite),Hw=',
  '].map(AthensAgoraMasterLayout.remapMarketSite).map(AthensNorthMarket.marketSite),Hw=');
patch('Give the market window the correct directions',
  'Figs and linen: north market \\xB7 Pottery and oil: east work lane \\xB7 Lunch orders: south shade.',
  'Figs, linen, pottery and oil are at the north market. Lunch orders go to the south shade.');
patch('Move existing merchant and shopper stops with the market',
  'r=AthensAgoraMasterLayout.remapActorStops(e,r);let d,u,h=[]',
  'r=AthensNorthMarket.actorStops(e,AthensAgoraMasterLayout.remapActorStops(e,r));let d,u,h=[]');
patch('Keep the established Myrine interaction and correct its place qualification',
  'role:"seller-cloth",anchor:{x:-85,y:0,z:70},floorRange:null,bounds:{west:-89,east:-81,south:65.8,north:73.5}',
  'role:"seller-cloth",...AthensNorthMarket.clothBinding()');
patch('Add actual market boards and post bounds to native walking and camera queries',
  'floors:s.metadata.floorPlanes??[]})),r=(s,a,n)=>{let o=a-s.x',
  'floors:s.metadata.floorPlanes??[]})).concat(AthensNorthMarket.counterSupports(i)),r=(s,a,n)=>{let o=a-s.x');
patch('Keep the central square clear of large standing scenery',
  'for(let Ie of AthensCivicStage.moveLooseOrnaments(Ce)){',
  'for(let Ie of AthensNorthMarket.ornaments(AthensCivicStage.moveLooseOrnaments(Ce))){');
patch('Fit retained planting to local earth before capturing walking geometry',
  'AthensCivicStage.moveNeighbouringModelsAndTrees(this.scene,r.getHeightAt),this.walkSupport=oGe',
  'AthensCivicStage.moveNeighbouringModelsAndTrees(this.scene,r.getHeightAt),AthensNorthMarket.plantContact(this.scene,r.getHeightAt),this.walkSupport=oGe');
wrapCall('Mark the crossing and edge walks in the native route owners',
  'AthensCivicStage.civicRoutes(AthensAgoraMasterLayout.remapCivicRoutes(','AthensNorthMarket.addRoutes');
wrapCall('Expose the north walks to the native Agora path detail',
  'AthensCivicStage.civicWalks(AthensAgoraMasterLayout.remapWalks(','AthensNorthMarket.addRoutes');
wrapCall('Align the ground detail exclusion with the relocated landmarks',
  'AthensCivicStage.remapFootprints(AthensAgoraMasterLayout.remapFootprints(','AthensNorthMarket.footprints');
const ownershipFile=new URL('NORTH-RESIDENCY-DELTA.json',out);
if(fs.existsSync(ownershipFile)) {
  const delta=read('NORTH-RESIDENCY-DELTA.json');
  assert.equal(delta.parent,parent.selected.id);
  assert(Object.entries(delta.counts).every(([label,count])=>label.length<200&&Number.isInteger(count)&&count>0&&count<=20));
  patch('Retain the exact reviewed ownership counts of moved local batches',
    '}const enforced=Object.keys(approved).length>0,label=value=>stableBatchName',
    '}for(const[key,count]of Object.entries('+JSON.stringify(delta.counts)+'))approved[key]=(approved[key]??0)+count;const enforced=Object.keys(approved).length>0,label=value=>stableBatchName');
}else {
  patch('Record every unexpected startup resource without waiving ownership enforcement',
    'JSON.stringify(report.unowned.slice(0,8))','JSON.stringify(report.unowned)');
}

let inverse=body;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2,before.slice(0,85));
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
if(process.argv.includes('--source-check')){console.log(JSON.stringify({patches:patches.length,parentInverseExact:true}));process.exit(0);}
owned();
assert(read('NORTH-SITE.json').parentPlots?.houses.length>=60,'Capture the exact selected parent procedural plots first');
const esbuild=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json')('esbuild');
const compiled=esbuild.buildSync({entryPoints:[fileURLToPath(new URL('NorthMarket.mjs',out))],bundle:true,format:'iife',globalName:'AthensNorthMarket',
  target:'es2022',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false});
const prefix=compiled.outputFiles[0].text+'\n',candidate=prefix+body,digest=sha256(candidate);
esbuild.transformSync(candidate,{loader:'js',logLevel:'silent'});
const source=Object.fromEntries(['NorthMarket.mjs','NORTH-SITE.json'].map(name=>[name,fileSHA(fileURLToPath(new URL(name,out)))]));
const prep={...parent,home,candidateSHA256:digest,candidateEntry:'assets/babylon-athens-north-market-'+digest.slice(0,12)+'.js',nativePatches:patches.length,
  source,siteAnchor:'Agora main square and north-east market',compilerVersion:esbuild.version,prefixSHA256:sha256(prefix)};
fs.writeFileSync(new URL('candidate.js',out),candidate);
fs.writeFileSync(new URL('PREP.json',out),JSON.stringify(prep,null,2)+'\n');
fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix,patches},null,2)+'\n');
console.log(JSON.stringify({entry:prep.candidateEntry,parent:parent.selected.id,patches:patches.length,parentInverseExact:true}));
