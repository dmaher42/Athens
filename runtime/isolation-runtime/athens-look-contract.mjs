// Athens-only release gate. Runs on promotion/selection/rollback, never per frame
// or per HTTP request. Missing support fails closed; do not waive it for a rebuild.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {sha256,verifyRow,relativeFile,assertNoLinks,readRelease,canonical} from './registry.mjs';

const installedHome=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=message=>{throw new Error('Athens full-look preservation: '+message);};
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();

// These two small owners contain no regexp literals. Skip quoted strings,
// comments and template text while matching their parameter/body delimiters.
// Unknown compiler structure is rejected rather than treated as approval.
function closing(text,start,open,close){
 let level=0;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(c==='"'||c==="'"||c==='`'){const q=c;for(i++;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]===q)break;}continue;}
  if(c==='/'&&text[i+1]==='/'){i=text.indexOf('\n',i+2);if(i<0)return -1;continue;}
  if(c==='/'&&text[i+1]==='*'){i=text.indexOf('*/',i+2);if(i<0)return -1;i++;continue;}
  if(c===open)level++;if(c===close&&--level===0)return i;
 }
 return -1;
}
function ownerAt(code,marker){
 // Identify the actual DOM control owner, not references from editor CSS or DOM queries.
 const matches=[...code.matchAll(/\.id\s*=\s*(["'])(athens-ground-look|athens-grade-preview)\1/g)].filter(x=>x[2]===marker);
 if(matches.length!==1)fail(matches.length?'ambiguous control owner '+marker:'active entry is missing '+marker);
 const at=matches[0].index;
 const offset=Math.max(0,at-40000),candidates=[...code.slice(offset,at).matchAll(/\bfunction\s+([\w$]+)\s*\(/g)].reverse();
 for(const match of candidates){const start=offset+match.index,param=code.indexOf('(',start),paramsEnd=closing(code,param,'(',')');if(paramsEnd<0)continue;let body=paramsEnd+1;while(/\s/.test(code[body]??''))body++;if(code[body]!=='{')continue;const end=closing(code,body,'{','}');if(body<at&&end>at)return{name:match[1],start,end:end+1,text:code.slice(start,end+1)};}
 fail('cannot identify the active '+marker+' owner; adapt and retest the gate before installing');
}
function runtimeChecks(art,lut){
 const harness=`
 const nodes=[],events=new Map(),pending=[];let loadCallback,meshEnabled=false;
 function queueMicrotask(fn){pending.push(fn)}
 class Element{constructor(tag){this.tag=tag;this.children=[];this.handlers=new Map();this.style={};nodes.push(this)}append(...x){this.children.push(...x)}setAttribute(k,v){this[k]=v}addEventListener(k,f){this.handlers.set(k,f)}removeEventListener(k,f){if(this.handlers.get(k)===f)this.handlers.delete(k)}blur(){}remove(){this.removed=true}}
 const document={createElement:t=>new Element(t),createTextNode:t=>({textContent:t}),body:new Element('body'),getElementById:id=>nodes.find(n=>n.id===id&&!n.removed),querySelector:()=>nodes.find(n=>n.tag==='button'&&!n.removed)};
 const window={addEventListener(k,f){if(!events.has(k))events.set(k,new Set());events.get(k).add(f)},removeEventListener(k,f){events.get(k)?.delete(f)}};
 const observable=()=>({add:f=>f,addOnce:f=>f,remove(){}});
 class Texture{constructor(url,scene,a,b,c,ready){loadCallback=ready;this.url=url}getSize(){return{width:1024,height:32}}dispose(){}}
 const config={colorCurvesEnabled:true,colorGradingEnabled:false,exposure:1.04,contrast:1.24,toneMappingType:1,toneMappingEnabled:true};
 const scene={metadata:{},meshes:[{metadata:{athensArtDirectionOnly:true},setEnabled:v=>meshEnabled=v}],materials:[],onNewMaterialAddedObservable:observable(),onDisposeObservable:observable()};
 const pipeline={imageProcessing:{imageProcessingConfiguration:config},bloomEnabled:true,bloomWeight:.15};
 const ensure=(test,message)=>{if(!test)throw Error(message)};
 const api=${art.name}({scene,pipeline,baseUrl:'/athens-game-starter/',Texture});
 const checkbox=document.getElementById('athens-ground-look');ensure(checkbox?.checked&&checkbox.defaultChecked,'ground checkbox must start checked');
 loadCallback();while(pending.length)pending.shift()();
 ensure(api.getState().mode==='lut'&&meshEnabled&&scene.metadata.athensArtDirection.enabled,'fresh open must select full look');
 ensure(config.colorGradingEnabled&&!config.colorCurvesEnabled,'LUT and original curves must stay mutually exclusive');
 ensure(api.getState().url.endsWith('/textures/grading/mediterranean-luminous-32.png'),'approved local LUT required');
 checkbox.checked=false;checkbox.handlers.get('change')();ensure(!meshEnabled,'ground comparison control must work');api.select('current');ensure(config.colorCurvesEnabled&&!config.colorGradingEnabled,'original grade comparison must work');
 ensure(events.get('pageshow')?.size===1,'exactly one cached-page reset required');for(const fn of events.get('pageshow'))fn({persisted:true});
 ensure(checkbox.checked&&meshEnabled&&api.getState().mode==='lut','cached reopen must restore full look');
 ensure(config.colorGradingEnabled&&!config.colorCurvesEnabled,'cached reopen must restore LUT without curves');
 ensure(config.exposure===1.04&&config.contrast===1.24&&config.toneMappingType===1&&config.toneMappingEnabled&&pipeline.bloomEnabled&&pipeline.bloomWeight===.15,'grade switching changed photometry');
 api.dispose();ensure(events.get('pageshow').size===0&&events.get('keydown').size===0,'owner disposal leaked listeners');
 ({freshOpen:true,cachedOpen:true,comparisons:true,curvesExclusive:true,photometryPreserved:true,disposal:true});`;
 try{return vm.runInNewContext(lut.text+'\n'+art.text+'\n'+harness,Object.create(null),{timeout:1000});}catch(e){fail('active grade/default behaviour failed: '+e.message);}
}

export function assertAthensFullLook({home,app,manifest,buildRoot,assetRoot}){
 if(app!=='athens')return{app,required:false};
 const policyFile=path.join(home,'apps/athens/full-look-contract.json');
 // Temporary migration/test registries opt in explicitly. The real installation
 // always requires its contract; deleting the policy must not disable the check.
 if(!samePath(home,installedHome)&&!fs.existsSync(policyFile))return{app,required:false,privateRegistry:true};
 if(!fs.existsSync(policyFile))fail('required Athens contract is missing');assertNoLinks(policyFile);
 const policyBytes=fs.readFileSync(policyFile),policy=JSON.parse(policyBytes);
 if(policy.schemaVersion!==1||policy.required!==true)fail('invalid or disabled contract');
 const rows=new Map(manifest.files.map(r=>[r.path,r]));
 const read=relative=>{relativeFile(relative);const row=rows.get(relative);if(!row)fail('selected resource absent from manifest: '+relative);const root=row.kind==='build'?buildRoot:assetRoot;if(!root)fail('asset location missing');const file=path.join(root,relative);assertNoLinks(file);return verifyRow(file,row);};
 const html=read(manifest.entry).toString(),scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)];
 if(scripts.length!==1)fail('expected one active Athens entry; adapt graph validation before changing entry structure');
 const url=new URL(scripts[0][1],'http://athens.invalid/athens-game-starter/index.html');
 if(url.origin!=='http://athens.invalid'||url.search||url.hash)fail('entry must be locally bundled');
 const prefix='/athens-game-starter/',at=url.pathname.indexOf(prefix);if(at<0)fail('invalid entry URL');const entry=url.pathname.slice(at+prefix.length);relativeFile(entry);
 const bytes=read(entry),code=bytes.toString();
 if(policy.activeProfile==='approved-native-townwide'){
  const profile=policy.nativeVisualProfile,digest=sha256(bytes);
  if(!profile||!Array.isArray(profile.approvedEntrySHA256)||!profile.approvedEntrySHA256.includes(digest))fail('active entry differs from the approved native visual program; preserve its visual owners and provide a verified update recipe');
  if(manifest.assetPool!==profile.assetPool)fail('approved visual asset pool changed');
  const retained=manifest.files.filter(r=>r.path!==manifest.entry&&r.path!==entry).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  if(sha256(canonical(retained))!==profile.retainedInventorySHA256)fail('approved visual textures, models or supporting files changed');
  return{app,required:true,passed:true,profile:policy.activeProfile,contractSHA256:sha256(policyBytes),entry,entrySHA256:digest,approvedReferenceRelease:profile.referenceRelease,checks:{approvedNativeFullLook:true,visualProgramRetained:true,visualAssetsRetained:true,editorOnlyVariation:digest!==profile.referenceEntrySHA256}};
 }
 if(policy.activeProfile&&policy.activeProfile!=='mediterranean-v2')fail('unknown preservation profile');
 const art=ownerAt(code,'athens-ground-look'),lut=ownerAt(code,'athens-grade-preview');
 // A stored, uncalled old owner is not enough. The selected program must invoke
 // the art owner, and that owner must invoke this LUT owner.
 const calls=(text,name)=>[...text.matchAll(new RegExp('(?:^|[^\\w$])'+name.replace(/\$/g,'\\$')+'\\s*\\(','g'))].length;
 if(!calls(code.slice(0,art.start)+code.slice(art.end),art.name)||!calls(art.text,lut.name))fail('approved grade owner is present but not invoked by active entry');
 for(const token of policy.requiredIntegrationTokens)if(!code.includes(token))fail('active entry lost ground/foliage integration: '+token);
 const lutBytes=read(policy.lut.path);if(sha256(lutBytes)!==policy.lut.sha256)fail('approved local LUT changed; owner approval and contract review required');
 const checks=runtimeChecks(art,lut);
 return{app,required:true,passed:true,contractSHA256:sha256(policyBytes),entry,entrySHA256:sha256(bytes),lutSHA256:sha256(lutBytes),checks};
}

export function assertRegisteredAthensLook({home,app,id,manifestSHA256}){
 if(app!=='athens')return{app,required:false};
 const release=readRelease(home,app,id,manifestSHA256);
 return assertAthensFullLook({home,app,manifest:release.manifest,buildRoot:path.join(release.root,'build'),assetRoot:path.join(home,'apps/athens/assets',release.manifest.assetPool,'athens-game-starter')});
}
