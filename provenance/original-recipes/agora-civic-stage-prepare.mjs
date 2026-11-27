import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fileSHA,readPointer,sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
import {out,owned,read} from './window.mjs';

const parent=read('PARENT.json');
const home=process.env.LOCALAPPDATA+'/Athens-Babylon';
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
  assert(level===0,owner);
  const prev=body.slice(from,end+1);
  patch(owner,prev,receiver+'('+prev+')');
}

patch('Build the six civic monuments at their fitted sites before collision captures their transforms',
  'return AthensAgoraMasterLayout.relocateArchitecture(wGeAgoraOriginal(i,e,t,r,s,a))',
  'return AthensCivicStage.relocate(AthensAgoraMasterLayout.relocateArchitecture(wGeAgoraOriginal(i,e,t,r,s,a)))');
patch('Fit civic surfaces with the existing native render and support buffers',
  'X.indices=westGround.indices,X.groups=westGround.groups;D.positions=f',
  'X.indices=westGround.indices,X.groups=westGround.groups;let civicGround=AthensCivicStage.fitCivicTerrain(f,d,g,X,m,PP);'+
  'f=civicGround.positions,d=civicGround.uvs,g=civicGround.mask,m=civicGround.height,c=f.length/3;'+
  'X.indices=civicGround.indices,X.groups=civicGround.groups;D.positions=f');
patch('Expose both original workshop and civic raw terrain samplers',
  'potteryWestGround:{...westGround.stats,heightAt:m},countryGrade:',
  'potteryWestGround:{...westGround.stats,heightAt:westGround.height},civicStageGround:{...civicGround.stats,heightAt:m},countryGrade:');
patch('Live Council courtyard and paired public stairs',
  'AthensAgoraMasterLayout.createCouncilAccess(new rv(this.scene,"agora-council-access",HU(this.scene,this.baseUrl)))',
  'AthensCivicStage.buildCouncilAccess(new rv(this.scene,"agora-council-access",HU(this.scene,this.baseUrl)),r.getHeightAt)');
patch('Keep existing residences intact and move foliage off the new paths before player support is constructed',
  'AthensAgoraMasterLayout.moveClashingTrees(this.scene,r.getHeightAt),this.walkSupport=oGe',
  'AthensAgoraMasterLayout.moveClashingTrees(this.scene,r.getHeightAt),AthensCivicStage.moveNeighbouringModelsAndTrees(this.scene,r.getHeightAt),this.walkSupport=oGe');
const homes=body.slice(body.indexOf('createResidentialCourtyardHomes(){'),body.indexOf('createAgoraMarketStalls(){'));
assert(homes.startsWith('createResidentialCourtyardHomes(){')&&homes.includes('WU(this.scene,this.root,t,s,this.baseUrl,r,n)'));
patch('Build neighbouring houses at their measured new addresses and fit their existing footings there',homes,homes
  .replace('}].forEach((t,r)=>{let s=this.getHeightAt(t.x,t.z)??2.5,a=[];',
    '}].map(AthensCivicStage.homeSite).forEach((t,r)=>{let s=t.civicFloor??this.getHeightAt(t.x,t.z)??2.5,a=[];')
  .replace('a.push(this.getHeightAt(c,f)??s)','a.push((t.civicFloor===void 0?this.getHeightAt(c,f):this.scene.getMeshByName("athensCanonicalTerrain").metadata.civicStageGround.heightAt(c,f))??s)'));
const oldWeaverSiteGuard=body.slice(body.indexOf('function moveClashingTrees(scene,height){'),body.indexOf('let matches=[...scene.meshes,...scene.transformNodes].filter(n=>/olive|fig|cypress|tree|planted/i',body.indexOf('function moveClashingTrees(scene,height){')));
assert(oldWeaverSiteGuard.includes('support.preservation.rootPinPending=!1;'));
patch('Validate the actual new house positions before performing the existing tree placement pass',
  oldWeaverSiteGuard,'function moveClashingTrees(scene,height){AthensCivicStage.verifyHomes(scene);');
patch('Use measured original Royal Stoa site height before the normal construction sampler closes',
  'royalCaptured=AthensAgoraMasterLayout.royalCaptureSiteHeights(height2)',
  'royalCaptured=AthensCivicStage.captureRoyal(height2)');
patch('Run construction-height seating checks at the real new civic floor positions',
  'context.report.nativeHeightAt=actualDelegate;let wrapper=',
  'context.report.nativeHeightAt=actualDelegate;AthensCivicStage.updateConstructionChecks(diagnostics,context.originalSampler);let wrapper=');
patch('Build the new Royal frontage on actual ground with the existing resource owner',
  'let{root,report}=AthensAgoraMasterLayout.royalBuildAccess(',
  'let{root,report}=AthensCivicStage.buildRoyalAccess(');
patch('Extend the existing complete-object filler clearance only into the new civic footprints',
  '...AthensAgoraMasterLayout.selectFillerHouses(scene,colliders)]',
  '...AthensCivicStage.selectFillerHouses(scene,colliders,AthensAgoraMasterLayout.selectFillerHouses(scene,colliders),[...approved.CIRCLED_AGORA_HOUSES,...targets])]');
patch('Move the original Temple retaining wall render after its existing clearance pass',
  'AthensZeusStoaV1.clearZeusRedesign(i);AthensKerameikosStage5.clearWorkshopOverlaps(',
  'AthensZeusStoaV1.clearZeusRedesign(i);AthensCivicStage.moveTemenos(i);AthensKerameikosStage5.clearWorkshopOverlaps(');
patch('Move the same Temple retaining wall collision triangles before registration',
  'const zeusAdjustedCollider=AthensZeusStoaV1.adjustZeusCollider(qe,i);',
  'const zeusAdjustedCollider=AthensCivicStage.moveTemenosCollider(AthensZeusStoaV1.adjustZeusCollider(qe,i));');
patch('Move only the plaza stall that overlaps the new Royal Stoa',
  'Object.freeze([[-145,132],[-109,108]])','Object.freeze([[-123.5,138],[-109,108]])');
patch('Reseat the existing plane tree outside the north civic approach',
  'Object.freeze([[-137,127,1],[-127,129,.92],[-116,127,.86]])','Object.freeze([[-124,131,1],[-127,129,.92],[-116,127,.86]])');
patch('Recognize the extra static plaza mesh in the reviewed destination cell',
  '"meshes:gateDistrict-batch--8,8|<runtime-id>":6,',
  '"meshes:gateDistrict-batch--8,8|<runtime-id>":7,');
patch('Build entire civic scenery pieces outside the new floors and seat them to local terrain',
  'for(let Ie of Ce){let qe=e(Ie.x,Ie.z);',
  'for(let Ie of AthensCivicStage.moveLooseOrnaments(Ce)){let qe=AthensCivicStage.sceneryHeight(i,e,Ie.x,Ie.z);');
patch('Fit original rocks, shrubs and tufts to the revised civic edge before the existing batching step',
  'pn("redesignRocksBatch",Nt,g,Ne,n),pn("redesignShrubsBatch",Xt,_,Ge,n),pn("redesignGrassBatch",tr,_,_e,n,!1)',
  'pn("redesignRocksBatch",Nt,g,AthensCivicStage.rebindSmallDetails(i,e,Ne),n),pn("redesignShrubsBatch",Xt,_,AthensCivicStage.rebindSmallDetails(i,e,Ge),n),pn("redesignGrassBatch",tr,_,AthensCivicStage.rebindSmallDetails(i,e,_e),n,!1)');
wrapCall('Use the new civic paths in the native ground and foliage route graph','AthensAgoraMasterLayout.remapCivicRoutes(AthensNewBouleuterionV1.newBouleuterionRoutes(','AthensCivicStage.civicRoutes');
wrapCall('Reserve the updated western precinct pedestrian paths','AthensAgoraMasterLayout.remapWalks(AthensZeusStoaV1.zeusAgoraWalks(','AthensCivicStage.civicWalks');
wrapCall('Move the ground-detail footprint masks with the six civic buildings','AthensAgoraMasterLayout.remapFootprints(AthensZeusStoaV1.zeusMarginFootprints(','AthensCivicStage.remapFootprints');

let inverse=body;
for(const {before,after} of patches.toReversed()){
  assert.equal(inverse.split(after).length,2,before.slice(0,85));
  inverse=inverse.replace(after,()=>before);
}
assert.equal(inverse,original);
if(process.argv.includes('--source-check')){console.log(JSON.stringify({patches:patches.length,parentInverseExact:true}));process.exit(0);}
owned();
const esbuild=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json')('esbuild');
const generated=esbuild.buildSync({entryPoints:[fileURLToPath(new URL('CivicStage.mjs',out))],bundle:true,format:'iife',globalName:'AthensCivicStage',
  target:'es2022',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false});
const prefix=generated.outputFiles[0].text+'\n';
const candidate=prefix+body,digest=sha256(candidate);
esbuild.transformSync(candidate,{loader:'js',logLevel:'silent'});
const source=Object.fromEntries(['CivicStage.mjs','CivicSite.mjs','CivicGround.mjs','CIVIC-SITE.json'].map(name=>[name,fileSHA(fileURLToPath(new URL(name,out)))]));
const prep={...parent,home,candidateSHA256:digest,candidateEntry:'assets/babylon-athens-civic-stage-'+digest.slice(0,12)+'.js',nativePatches:patches.length,
  source,siteAnchor:'Civic court and western monuments',compilerVersion:esbuild.version,prefixSHA256:sha256(prefix)};
fs.writeFileSync(new URL('candidate.js',out),candidate);
fs.writeFileSync(new URL('PREP.json',out),JSON.stringify(prep,null,2)+'\n');
fs.writeFileSync(new URL('PATCHES.json',out),JSON.stringify({prefix,patches},null,2)+'\n');
console.log(JSON.stringify({entry:prep.candidateEntry,parent:parent.selected.id,patches:patches.length,parentInverseExact:true}));
