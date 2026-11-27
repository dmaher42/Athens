import http from 'node:http';
import {sendPinnedFile} from './range-response.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {resolveRequest} from './registry.mjs';
import {resolvePrebuiltRequest} from './prebuilt-context-handler.mjs';

export const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary','.hdr':'application/octet-stream','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon'};

// No listen(), process spawning, live path default, global pointer fallback or side effects at import.
export function createIsolatedHandler(home, options={}) {
  return (req,res)=>{
    if (req.method!=='GET' && req.method!=='HEAD') {res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const result=resolvePrebuiltRequest(home,req.url,req.headers??{},options);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    if(result.type==='redirect'){res.writeHead(result.status,{Location:result.location}).end();return;}
    if(result.type==='json'){
      res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead(result.status);
      res.end(req.method==='HEAD'?undefined:JSON.stringify(result.body));return;
    }
    if(result.type==='file'){
      if(result.app)res.setHeader('X-Babylon-Game',result.app);
      if(result.id)res.setHeader('X-Babylon-Release',result.id);
      res.setHeader('Content-Type',MIME[path.extname(result.relative).toLowerCase()]??'application/octet-stream');
      res.setHeader('ETag',`"sha256-${result.sha256}"`);
      sendPinnedFile(req,res,result);return;
    }
    res.setHeader('Content-Type','text/plain; charset=utf-8');res.writeHead(result.status);
    res.end(req.method==='HEAD'?undefined:result.message);
  };
}

// A migration coordinator must explicitly choose when/where to listen; importing this starts no server.
export function createUnboundIsolatedServer(home, options={}) {
  return http.createServer(createIsolatedHandler(home,options));
}
