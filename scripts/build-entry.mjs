import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
export async function buildEntry({write=true}={}) {
  assert.equal(esbuild.version,'0.27.4');
  const lock=read('release-lock.json'),chain=read('source/build-chain.json');
  let code=fs.readFileSync(path.join(root,'source/native-foundation.mjs'),'utf8');
  assert.equal(sha(code),lock.foundation.sha256);
  const stages=[];
  try {
    for(const stage of chain) {
      assert.equal(sha(code),stage.parentSHA256,stage.name+' parent');
      const original=code,dir=path.join(root,stage.directory);
      let patches,prefix='';
      if(stage.method==='chariot-source') {
        patches=[];
        const {finalCandidate}=await import(pathToFileURL(path.join(dir,'final-candidate.mjs')));
        code=finalCandidate(code,row=>patches.push(row));
        assert.equal(patches.length,43);
      } else {
        const recipe=JSON.parse(fs.readFileSync(path.join(dir,'patches.json'),'utf8'));
        prefix=recipe.prefix;patches=recipe.patches;
        for(const spec of stage.compile) {
          const result=await esbuild.build({absWorkingDir:root,entryPoints:[path.resolve(dir,'helper',spec.entry)],bundle:true,
            format:'iife',globalName:spec.globalName,target:'es2022',minifyWhitespace:true,minifySyntax:true,
            minifyIdentifiers:false,write:false,metafile:true,logLevel:'silent'});
          assert(!Object.keys(result.metafile.inputs).some(f=>f.includes('node_modules/')),'Overlay must not bundle a second SDK');
          const compiled=result.outputFiles[0].text+'\n';
          assert([prefix,...patches.map(p=>p.after)].some(s=>s.includes(compiled)),stage.name+' frozen compiler output differs');
        }
        for(const filename of ['AgoraEntranceGround.mjs','AgoraSquareEdge.mjs','AgoraSquareLife.mjs','DipylonView.mjs']) {
          const file=path.join(dir,filename);
          if(fs.existsSync(file)) {
            const source=fs.readFileSync(file,'utf8');assert(source.startsWith('export const '));
            assert.equal(source.slice('export '.length)+'\n',prefix,stage.name+' source prelude');
          }
        }
        for(const p of patches) {
          assert.equal(code.split(p.before).length,2,stage.name+' unique native span');
          assert.equal(code.indexOf(p.before),p.offset,stage.name+' native span position');
          code=code.replace(p.before,()=>p.after);
        }
        code=prefix+code;
      }
      let inverse=code.slice(prefix.length);
      for(const p of patches.toReversed()) {
        assert.equal(inverse.slice(p.offset,p.offset+p.after.length),p.after,stage.name+' inverse span');
        inverse=inverse.slice(0,p.offset)+p.before+inverse.slice(p.offset+p.after.length);
      }
      assert.equal(inverse,original,stage.name+' must preserve every other parent byte');
      assert.equal(sha(code),stage.outputSHA256,stage.name+' selected output');
      stages.push({name:stage.name,release:stage.release,sha256:sha(code),compiledHelpers:stage.compile.length,patches:patches.length});
      console.log(stage.name+': '+stage.outputSHA256);
    }
    assert.equal(sha(code),lock.athens.sha256);
    if(write) {
      const out=path.join(root,'dist',lock.athens.entry);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,code);
      fs.writeFileSync(path.join(root,'dist/ENTRY-VERIFICATION.json'),JSON.stringify({passed:true,foundation:lock.foundation,stages,entrySHA256:sha(code),wholeWorldSourceBuild:false},null,2)+'\n');
    }
    return code;
  } finally {esbuild.stop();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildEntry();
