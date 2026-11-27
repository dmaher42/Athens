import fs from 'node:fs';
import {assertAthensFullLook,assertRegisteredAthensLook} from './athens-look-contract.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import {appName,appRoot,inside,pointerPath,rawFile,fileSHA,sha256,canonical,invariant,validateHome,validateManifest,readRelease,physicalFile,verifyRow,assertNoLinks} from './registry.mjs';

function writeAtomic(file, bytes) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp-'+crypto.randomUUID();
  let fd;
  try {
    fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temporary,file);
  } catch(error) {
    if(fd!==undefined)fs.closeSync(fd);
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
    throw error;
  }
}
function jsonBytes(data){return Buffer.from(JSON.stringify(data,null,2)+'\n');}
function ensureNoLinks(root) {
  assertNoLinks(root);
}
function inventory(root, prefix='') {
  if(!fs.existsSync(root))return [];
  const result=[];
  for(const name of fs.readdirSync(root).sort()){
    const file=path.join(root,name), relative=prefix?prefix+'/'+name:name, stat=fs.lstatSync(file);
    invariant(!stat.isSymbolicLink(),'Symlink in staged/installed inventory');
    if(stat.isDirectory())result.push(...inventory(file,relative));
    else {invariant(stat.isFile(),'Non-file release member');result.push(relative);}
  }
  return result;
}
function verifyDirectory(root, rows) {
  ensureNoLinks(root);
  const expected=rows.map(r=>r.path).sort(), actual=inventory(root).sort();
  invariant(canonical(actual)===canonical(expected),'Unmanifested or missing release files');
  for(const row of rows)verifyRow(inside(root,row.path),row);
}
function copyRows(from, to, rows){
  fs.mkdirSync(to,{recursive:true});
  for(const row of rows){
    const source=inside(from,row.path), target=inside(to,row.path);
    const bytes=verifyRow(source,row);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});
  }
}
function token(value){invariant(typeof value==='string'&&/^[a-z0-9-]{8,80}$/.test(value),'Invalid transaction token');return value;}
function withCityLock(home,app,job,operation){
  validateHome(home);appName(app);token(job);ensureNoLinks(home);
  invariant(!fs.existsSync(inside(home,'install.lock')),'Service migration holds the common install lock');
  const own=appRoot(home,app);ensureNoLinks(own);fs.mkdirSync(own,{recursive:true});
  const lock=inside(own,'install.lock'), lockBytes=jsonBytes({schemaVersion:1,app,job,pid:process.pid});
  const fd=fs.openSync(lock,'wx');try{fs.writeFileSync(fd,lockBytes);}finally{fs.closeSync(fd);}
  try{invariant(!fs.existsSync(inside(home,'install.lock')),'Service migration started while acquiring city lock');return operation(own);}finally{
    // Never delete a lock if someone replaced its ownership bytes.
    if(fileSHA(lock)===sha256(lockBytes))fs.unlinkSync(lock);
  }
}
function stageManifest(stage,app){
  ensureNoLinks(stage);
  const raw=fs.readFileSync(inside(stage,'release.json')), manifest=JSON.parse(raw.toString('utf8'));
  validateManifest(manifest,app,manifest.id);
  verifyDirectory(inside(stage,'build'),manifest.files.filter(f=>f.kind==='build'));
  verifyDirectory(inside(stage,'assets'),manifest.files.filter(f=>f.kind==='asset'));
  return {manifest,raw,manifestSHA256:sha256(raw)};
}
function verifyInstalled(home,app,id,manifestSHA){
  const release=readRelease(home,app,id,manifestSHA), rows=release.manifest.files;
  verifyDirectory(inside(release.root,'build'),rows.filter(f=>f.kind==='build'));
  verifyDirectory(inside(appRoot(home,app),'assets',release.manifest.assetPool,'athens-game-starter'),rows.filter(f=>f.kind==='asset'));
  for(const row of rows)verifyRow(physicalFile(home,app,release,row),row);
  return release;
}
function assertPointer(pointerBytes,app){
  const pointer=JSON.parse(pointerBytes.toString('utf8'));
  invariant(pointer.schemaVersion===1&&pointer.app===app&&/^[a-f0-9]{12}$/.test(pointer.id)&&/^[a-f0-9]{64}$/.test(pointer.manifestSHA256),'Invalid previous city pointer');
  return pointer;
}

// The only writable root is apps/<app>; neither legacy current.json nor another app is a write target.
// All compliant writers must use this scoped lock. Unmanaged direct writes are outside the lock contract.
export function promoteCity({home,app,stage,expectedCurrentSHA256,expectedManifestSHA256,job}){
  return withCityLock(home,app,job,own=>{
    invariant(expectedCurrentSHA256===null||/^[a-f0-9]{64}$/.test(expectedCurrentSHA256),'Explicit current pointer digest required');
    invariant(/^[a-f0-9]{64}$/.test(expectedManifestSHA256),'Explicit staged manifest digest required');
    const current=pointerPath(home,app), before=rawFile(current);
    invariant((before===null?null:sha256(before))===expectedCurrentSHA256,'City pointer CAS changed before preparation');
    if(before!==null){const p=assertPointer(before,app);verifyInstalled(home,app,p.id,p.manifestSHA256);}
    const staged=stageManifest(path.resolve(stage),app), {manifest,raw,manifestSHA256}=staged;
    invariant(manifestSHA256===expectedManifestSHA256,'Staged manifest pin changed');
    assertAthensFullLook({home,app,manifest,buildRoot:inside(stage,'build'),assetRoot:inside(stage,'assets')});
    const release=inside(own,'releases',manifest.id), pool=inside(own,'assets',manifest.assetPool,'athens-game-starter');
    const buildRows=manifest.files.filter(f=>f.kind==='build'), assetRows=manifest.files.filter(f=>f.kind==='asset');
    if(fs.existsSync(pool))verifyDirectory(pool,assetRows);
    else {
      const incoming=inside(own,'assets',manifest.assetPool+'.incoming-'+job);
      invariant(!fs.existsSync(incoming),'Asset stage already exists; inspect the previous transaction');
      copyRows(inside(stage,'assets'),inside(incoming,'athens-game-starter'),assetRows);
      verifyDirectory(inside(incoming,'athens-game-starter'),assetRows);
      const poolParent=inside(own,'assets',manifest.assetPool);invariant(!fs.existsSync(poolParent),'Asset destination appeared');
      fs.renameSync(incoming,poolParent);
    }
    if(fs.existsSync(release))verifyInstalled(home,app,manifest.id,manifestSHA256);
    else {
      const incoming=inside(own,'releases',manifest.id+'.incoming-'+job);
      invariant(!fs.existsSync(incoming),'Release stage already exists; inspect the previous transaction');
      copyRows(inside(stage,'build'),inside(incoming,'build'),buildRows);
      fs.writeFileSync(inside(incoming,'release.json'),raw,{flag:'wx'});
      verifyDirectory(inside(incoming,'build'),buildRows);
      invariant(!fs.existsSync(release),'Release destination appeared');fs.renameSync(incoming,release);
    }
    verifyInstalled(home,app,manifest.id,manifestSHA256);
    const next=jsonBytes({schemaVersion:1,app,id:manifest.id,manifestSHA256}), afterSHA256=sha256(next);
    const journal=inside(own,'transactions',job+'.json');
    invariant(!fs.existsSync(journal),'Transaction already recorded; do not repeat blindly');
    const record={schemaVersion:1,app,job,state:'prepared',beforePointerBase64:before?.toString('base64')??null,beforePointerSHA256:expectedCurrentSHA256,afterPointerBase64:next.toString('base64'),afterPointerSHA256:afterSHA256,releaseId:manifest.id,manifestSHA256};
    fs.mkdirSync(path.dirname(journal),{recursive:true});fs.writeFileSync(journal,jsonBytes(record),{flag:'wx'});
    // Exact final guard, under this app's exclusive lock. An old global producer cannot select this app.
    invariant(fileSHA(current)===expectedCurrentSHA256,'City pointer CAS changed before commit');
    if(before!==null)writeAtomic(inside(own,'previous.json'),before);
    writeAtomic(current,next);
    invariant(fileSHA(current)===afterSHA256,'Committed pointer readback failed; inspect journal');
    record.state='committed';writeAtomic(journal,jsonBytes(record));
    return {app,id:manifest.id,pointerSHA256:afterSHA256,manifestSHA256,journal,state:'committed'};
  });
}

export function rollbackCity({home,app,transactionJob,expectedCurrentSHA256,job}){
  return withCityLock(home,app,job,own=>{
    token(transactionJob);
    const journal=inside(own,'transactions',transactionJob+'.json'), record=JSON.parse(fs.readFileSync(journal,'utf8'));
    invariant(record.schemaVersion===1&&record.app===app&&record.job===transactionJob&&record.state==='committed','Not this city committed transaction');
    invariant(expectedCurrentSHA256===record.afterPointerSHA256,'Rollback must name the installed pointer bytes');
    const current=pointerPath(home,app);invariant(fileSHA(current)===expectedCurrentSHA256,'Rollback CAS changed');
    const installed=rawFile(current);assertPointer(installed,app);
    const previous=record.beforePointerBase64===null?null:Buffer.from(record.beforePointerBase64,'base64');
    invariant((previous===null?null:sha256(previous))===record.beforePointerSHA256,'Rollback history bytes changed');
    if(previous!==null){const p=assertPointer(previous,app);assertRegisteredAthensLook({home,app,id:p.id,manifestSHA256:p.manifestSHA256});verifyInstalled(home,app,p.id,p.manifestSHA256);}
    const rollbackFile=inside(own,'transactions',job+'.json');invariant(!fs.existsSync(rollbackFile),'Rollback job already recorded');
    const receipt={schemaVersion:1,app,job,transactionJob,state:'prepared',fromSHA256:expectedCurrentSHA256,toSHA256:record.beforePointerSHA256};
    fs.writeFileSync(rollbackFile,jsonBytes(receipt),{flag:'wx'});
    invariant(fileSHA(current)===expectedCurrentSHA256,'Rollback final CAS changed');
    writeAtomic(inside(own,'previous.json'),installed);
    if(previous===null)fs.renameSync(current,inside(own,'transactions',job+'.removed-pointer.json'));
    else writeAtomic(current,previous);
    invariant(fileSHA(current)===record.beforePointerSHA256,'Rollback readback failed; inspect receipt');
    receipt.state='committed';writeAtomic(rollbackFile,jsonBytes(receipt));
    return {...receipt,receipt:rollbackFile};
  });
}

export function validateStagedCity(stage,app){return stageManifest(path.resolve(stage),app);}

// Select a previously registered immutable package without duplicating a 400MB
// asset pool into a temporary stage. Uses the same scoped lock/journal/CAS and
// rollback record format as promoteCity. Registration itself changes no pointer.
export function selectRegisteredCity({home,app,id,expectedCurrentSHA256,expectedManifestSHA256,job}){
 return withCityLock(home,app,job,own=>{
  invariant(expectedCurrentSHA256===null||/^[a-f0-9]{64}$/.test(expectedCurrentSHA256),'Explicit current city hash required');
  const current=pointerPath(home,app),before=rawFile(current);invariant(fileSHA(current)===expectedCurrentSHA256,'City pointer CAS changed');
  if(before!==null){const p=assertPointer(before,app);verifyInstalled(home,app,p.id,p.manifestSHA256);}
  assertRegisteredAthensLook({home,app,id,manifestSHA256:expectedManifestSHA256});
  verifyInstalled(home,app,id,expectedManifestSHA256);
  const next=jsonBytes({schemaVersion:1,app,id,manifestSHA256:expectedManifestSHA256}),afterSHA256=sha256(next),journal=inside(own,'transactions',job+'.json');invariant(!fs.existsSync(journal),'Do not reuse transaction token');
  const record={schemaVersion:1,app,job,state:'prepared',beforePointerBase64:before?.toString('base64')??null,beforePointerSHA256:expectedCurrentSHA256,afterPointerBase64:next.toString('base64'),afterPointerSHA256:afterSHA256,releaseId:id,manifestSHA256:expectedManifestSHA256};fs.mkdirSync(path.dirname(journal),{recursive:true});fs.writeFileSync(journal,jsonBytes(record),{flag:'wx'});
  invariant(fileSHA(current)===expectedCurrentSHA256,'City pointer CAS changed before commit');if(before!==null)writeAtomic(inside(own,'previous.json'),before);writeAtomic(current,next);invariant(fileSHA(current)===afterSHA256,'Committed pointer readback failed');record.state='committed';writeAtomic(journal,jsonBytes(record));return{app,id,pointerSHA256:afterSHA256,manifestSHA256:expectedManifestSHA256,journal,state:'committed'};
 });
}

// Read-only recovery diagnosis: never silently replay a transaction after a crash/uncertain write.
export function inspectTransaction({home,app,transactionJob}){
  validateHome(home);appName(app);token(transactionJob);
  const own=appRoot(home,app), journal=inside(own,'transactions',transactionJob+'.json');
  const record=JSON.parse(fs.readFileSync(journal,'utf8'));
  invariant(record.app===app&&record.job===transactionJob&&record.schemaVersion===1,'Transaction identity mismatch');
  const currentSHA256=fileSHA(pointerPath(home,app));
  const observedState=currentSHA256===record.afterPointerSHA256?'after-pointer-active':currentSHA256===record.beforePointerSHA256?'before-pointer-active':'different-pointer-active';
  return {app,transactionJob,recordedState:record.state,currentSHA256,observedState,journal};
}
