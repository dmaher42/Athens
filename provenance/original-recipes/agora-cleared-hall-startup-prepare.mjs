import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sha256} from 'file:///C:/Users/dmahe/AppData/Local/Athens-Babylon/isolation-runtime/registry.mjs';

const out=new URL('.',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,out)));
const parent=read('PARENT.json');
const original=fs.readFileSync(parent.entryPath,'utf8');
assert.equal(sha256(original),parent.entrySHA256);
const before='moved=sites.flatMap(site=>{let{west,east,south,north}=site.bounds;';
const after=before.replace('sites.flatMap','sites.filter(site=>site.id!=="old-council").flatMap');
assert.equal(original.split(before).length,2);
const candidate=original.replace(before,()=>after),entrySHA256=sha256(candidate);
assert.equal(candidate.replace(after,()=>before),original);
const entry='assets/babylon-athens-agora-cleared-hall-startup-'+entrySHA256.slice(0,12)+'.js';
const recipe={parent:parent.selected,entry,entrySHA256,inverseExact:true,nativeSpans:1,source:'prepare.mjs',
  build:'node output/playwright/agora-dipylon-view/startup-repair/prepare.mjs',
  scope:'Retire only the obsolete ceiling probes of the previously deleted Old Council'};
fs.writeFileSync(new URL('candidate.mjs',out),candidate);
fs.writeFileSync(new URL('SOURCE-RECIPE.json',out),JSON.stringify(recipe,null,2)+'\n');
console.log(JSON.stringify(recipe));
