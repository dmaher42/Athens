import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createRequire}from'node:module';
import{readPointer,sha256,fileSHA}from'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';
const d='output/playwright/dialogue-flow',p=JSON.parse(fs.readFileSync(d+'/PARENT.json')),claim=JSON.parse(fs.readFileSync(d+'/CLAIM.json')),coord=JSON.parse(fs.readFileSync('C:/Users/dmahe/Documents/Codex/2026-11-15/task-5/CITY-COORDINATION.json'));
assert.equal(coord.gpu.reservationToken,claim.token);assert(coord.gpu.heavyCpuActive&&!coord.gpu.activeBrowser);assert.equal(readPointer(p.home,'athens').sha256,p.pointerSHA256);
let body=fs.readFileSync(p.entryPath,'utf8');assert.equal(sha256(body),p.baselineEntrySHA256);const original=body,patches=[];
const add=(owner,before,after)=>{assert.equal(body.split(before).length-1,1,owner+' source unique');body=body.replace(before,()=>after);assert.equal(body.split(after).length-1,1,owner+' result unique');patches.push({owner,before,after});};
const es=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json')('esbuild'),opts={bundle:true,format:'iife',target:'es2022',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false,metafile:true};
const flow=es.buildSync({...opts,entryPoints:['src/core/AthensDialogueFlow.ts'],globalName:'AthensDialogueFlow'}),farm=es.buildSync({...opts,entryPoints:['src/core/BabylonFarm2Encounter.ts'],globalName:'AthensFarm2Reactive'});
assert.equal(Object.keys(flow.metafile.inputs).length,1);assert.equal(Object.keys(farm.metafile.inputs).length,3);
const oldFarm=JSON.parse(fs.readFileSync('output/playwright/natural-conversations/PATCHES.json')).patches[0].after;
add('Existing farm provider: direct E collect/deliver and caption-only acknowledgements',oldFarm,farm.outputFiles[0].text+'\n');
const init='this.createPromptUI(),this.createModalUI(),window.addEventListener("keydown",this.onKeyDown)';
add('Install input/presentation adapter on the existing native dialogue instance',init,init+',AthensDialogueFlow.installDialogueFlow(this,AthensNpcDialogue.nodeFor)');
const validation='t.status==="complete"&&t.options.length!==0)throw new Error("Invalid conversation view")';
add('Validate optional caption presentation only for completed, choice-free replies',validation,'t.status==="complete"&&t.options.length!==0||t.presentation!==void 0&&(t.presentation!=="caption"||t.status!=="complete"))throw new Error("Invalid conversation view")');
add('Preserve validated caption metadata in existing immutable view','options:Object.freeze(a),status:t.status})}isSessionCurrent','options:Object.freeze(a),status:t.status,presentation:t.presentation})}isSessionCurrent');
const gate='(!this.appearanceEditor||this.appearanceNavigationEnabled)&&!this.dialogueBridge.isOpen&&!this.market?.isOpen&&!this.journey?.roadPaused';
add('Walking during normal dialogue; other game input and transaction gates retained',gate,gate.replace('dialogueBridge.isOpen','dialogueBridge.blocksMovement'));
const text='window.render_game_to_text=()=>JSON.stringify({engine:"babylon",';
add('Expose visible conversation choices, pending state and captions in existing text state',text,text+'dialogueFlow:this.dialogueBridge.getFlowState?.(),');
for(const [before,after]of[
 ['anchor:{x:-185,y:5.15,z:65.8},floorRange:[4.85,5.65],bounds:{west:-191,east:-179,south:60,north:84}','anchor:{x:-205,y:5.15,z:65.8},floorRange:[4.85,5.65],bounds:{west:-211,east:-199,south:60,north:84}'],
 ['anchor:{x:-197.55,y:6.25,z:77.7},floorRange:[5.95,6.75],bounds:{west:-201,east:-191,south:60,north:86}','anchor:{x:-217.55,y:6.25,z:77.7},floorRange:[5.95,6.75],bounds:{west:-221,east:-211,south:60,north:86}'],
 ['anchor:{x:-208,y:7.55,z:62.5},floorRange:[7.4,7.9],bounds:{west:-208.6,east:-207.6,south:61.6,north:64}','anchor:{x:-228,y:7.55,z:62.5},floorRange:[7.4,7.9],bounds:{west:-228.6,east:-227.6,south:61.6,north:64}'],
])add('Move existing story qualification volume with the approved workshop, retaining size/floor/identity',before,after);
add('Follow the approved Agora cloth-market translation, retaining original qualification guard and volume size','anchor:{x:-85,y:0,z:59},floorRange:null,bounds:{west:-89,east:-81,south:54.8,north:62.5}','anchor:{x:-85,y:0,z:70},floorRange:null,bounds:{west:-89,east:-81,south:65.8,north:73.5}');
const prefix=flow.outputFiles[0].text+'\n',candidate=prefix+body;let inverse=body;for(const patch of [...patches].reverse()){assert.equal(inverse.split(patch.after).length-1,1);inverse=inverse.replace(patch.after,()=>patch.before);}assert.equal(inverse,original);es.transformSync(candidate,{loader:'js',logLevel:'silent'});
const source={};for(const f of new Set([...Object.keys(flow.metafile.inputs),...Object.keys(farm.metafile.inputs)])){source[f]=fileSHA(f);const target=d+'/frozen-'+f;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f,target);}
for(const f of ['src/core/BabylonDialogueBridge.ts','src/core/BabylonApplication.ts','src/living/AthensNeighbourhood.ts']){const target=d+'/approved-source/'+f;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f,target);source[f]=fileSHA(f);}
fs.writeFileSync(d+'/candidate.js',candidate);fs.writeFileSync(d+'/PATCHES.json',JSON.stringify({prefix,patches,inverseSHA256:sha256(original)},null,2));fs.writeFileSync(d+'/PREP.json',JSON.stringify({...p,source,compilerVersion:es.version,candidateSHA256:sha256(candidate),entry:'assets/babylon-athens-dialogue-flow-'+sha256(candidate).slice(0,12)+'.js',wholeWorldBuild:false,SDKImports:0},null,2));
// Unit-only DOM bridge. The served game uses its original native Vector3/SDK.
const unit=await es.build({...opts,entryPoints:['src/core/BabylonDialogueBridge.ts'],globalName:'AthensDialogueUnit',plugins:[{name:'unit-only-vector-distance',setup(b){b.onResolve({filter:/@babylonjs\/core\/Maths\/math\.vector\.js/},()=>({path:'vector-distance',namespace:'unit'}));b.onLoad({filter:/.*/,namespace:'unit'},()=>({contents:'export const Vector3={Distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)};'}));}}]});
fs.writeFileSync(d+'/unit-bridge.js',unit.outputFiles[0].text);
console.log(JSON.stringify({parent:p.baseline.id,entrySHA256:sha256(candidate),patches:patches.length,inverseExact:true,SDKImports:0}));
