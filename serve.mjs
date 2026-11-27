import http from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read} from './scripts/build-entry.mjs';
const home=path.join(root,'game');
const {createIsolatedHandler}=await import(pathToFileURL(path.join(home,'isolation-runtime/server-adapter.mjs')));
const {readPointer}=await import(pathToFileURL(path.join(home,'isolation-runtime/registry.mjs')));
for(const pin of read('release-lock.json').releases)assert.equal(readPointer(home,pin.app).pointer.id,pin.id);
const origin=new URL(process.env.ATHENS_PUBLIC_ORIGIN??'http://127.0.0.1:3000');
assert(!origin.username&&!origin.password&&origin.pathname==='/'&&['https:','http:'].includes(origin.protocol));
const port=Number(process.env.PORT??3000);assert(Number.isInteger(port)&&port>0&&port<=65535);
const handle=createIsolatedHandler(home,{publicOrigin:origin.origin,verifyBytes:false});
http.createServer((req,res)=>{
  if(req.url==='/'&&['GET','HEAD'].includes(req.method))res.writeHead(302,{Location:'/athens-game-starter/index.html?engine=babylon&place=propylaia','Cache-Control':'no-store'}).end();
  else handle(req,res);
}).listen(port,'0.0.0.0',()=>console.log('Exact Athens '+read('release-lock.json').athens.id+' serving on '+port));
