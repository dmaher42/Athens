import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const world=path.resolve(here,'../..');
const helperName='AthensRecessedAcropolisEntrance';
const helper=path.join(here,'AcropolisRecessedEntrance.mjs');
const compile=createRequire('C:/Users/dmahe/Documents/Antigravity/Athens-Sandbox/world-source/package.json');

export function once(text,before,after){
  assert.equal(text.split(before).length,2,'Expected one exact lower-ascent owner span: '+before.slice(0,110));
  return text.replace(before,()=>after);
}

export function nativeChanges(original,{inspect=false}={}){
  assert(!original.includes('var '+helperName+'='),'The recessed ascent is already present');
  const grade='let stats={version:1,stage,changedVertices:changes.length,maximumCut:maxCut,summitVerticesChanged:0';
  const mesh='for(let j=0;j<p2.count;j++)p2.setY(j,fit.footY+(p2.getY(j)-fit.footY)*fit.ratio);p2.needsUpdate=';
  const marker='o.position.y=fit.footY+(o.position.y-fit.footY)*fit.ratio,furniture++';
  const metadata='steps:132,routeXZUnchanged:!0,majorMonumentsMoved:0,landingFurnitureSeated:';
  const spans=[
    {before:grade,after:'let recessedEntrance=stage>=3?'+helperName+'.gradeRecessedStairEntrance(positions,indices,indexHeight,ascentAPI.ascent,ascentFit):null;'+grade.replace('stage,','stage,recessedEntrance,')},
    {before:mesh,after:'for(let j=0;j<p2.count;j++){let y2=fit.footY+(p2.getY(j)-fit.footY)*fit.ratio,z2=p2.getZ(j);if(z2>'+helperName+'.entrance.upperJoinZ){let [u2,v2]='+helperName+'.recessedStairPoint(p2.getX(j),z2);p2.setXYZ(j,u2,y2,v2)}else p2.setY(j,y2)}p2.needsUpdate='},
    {before:marker,after:marker.replace(',furniture++',','+helperName+'.seatRecessedLandingProp(o),furniture++')},
    {before:metadata,after:metadata.replace('routeXZUnchanged:!0,','routeXZUnchanged:!1,upperRouteXZUnchanged:!0,lowerEntranceRecessed:!0,')},
  ];
  const patched=spans.reduce((all,{before,after})=>once(all,before,after),original);
  assert.equal(spans.toReversed().reduce((all,{before,after})=>once(all,after,before),patched),original);
  if(inspect)return {spans};
  const result=compile('esbuild').buildSync({
    entryPoints:[helper],bundle:true,format:'iife',globalName:helperName,target:'es2022',
    minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,write:false,metafile:true,
  });
  assert.equal(Object.keys(result.metafile.inputs).length,1,'The stair correction is an SDK-free helper');
  const prefix=result.outputFiles[0].text+'\n';
  return {update:prefix+patched,spans,prefix};
}

export function canonicalChanges(){
  const relative='src/sanctuary/AcropolisTerrainUpgrade.mjs';
  const file=path.join(world,relative),before=fs.readFileSync(file,'utf8');
  let after=once(before,"import {finishAcropolisDecorations} from './AcropolisDecorations.mjs';",
    "import {finishAcropolisDecorations} from './AcropolisDecorations.mjs';\nimport {entrance,gradeRecessedStairEntrance,recessedStairPoint,seatRecessedLandingProp} from './AcropolisRecessedEntrance.mjs';");
  const grade=' const stats={version:1,stage,changedVertices:';
  after=once(after,grade,' const recessedEntrance=stage>=3?gradeRecessedStairEntrance(positions,indices,indexHeight,ascentAPI.ascent,ascentFit):null;\n'+grade.replace('stage,','stage,recessedEntrance,'));
  const fit='for(let j=0;j<p.count;j++)p.setY(j,fit.footY+(p.getY(j)-fit.footY)*fit.ratio);p.needsUpdate=';
  after=once(after,fit,'for(let j=0;j<p.count;j++){const y=fit.footY+(p.getY(j)-fit.footY)*fit.ratio,z=p.getZ(j);if(z>entrance.upperJoinZ){const [x,nextZ]=recessedStairPoint(p.getX(j),z);p.setXYZ(j,x,y,nextZ);}else p.setY(j,y);}p.needsUpdate=');
  after=once(after,'o.position.y=fit.footY+(o.position.y-fit.footY)*fit.ratio;furniture++;',
    'o.position.y=fit.footY+(o.position.y-fit.footY)*fit.ratio;seatRecessedLandingProp(o);furniture++;');
  after=once(after,'steps:132,routeXZUnchanged:true,majorMonumentsMoved:',
    'steps:132,routeXZUnchanged:false,upperRouteXZUnchanged:true,lowerEntranceRecessed:true,majorMonumentsMoved:');
  const href='src/sanctuary/AcropolisRecessedEntrance.mjs',target=path.join(world,href);
  assert(!fs.existsSync(target));
  return [{relative,file,before,after},{relative:href,file:target,before:null,after:fs.readFileSync(helper,'utf8')}];
}
