import fs from 'node:fs';
/** Serve the pinned immutable file, including the newer Sparta video contract.
 * This does not choose a release, resolve a path or retain file bytes. */
export function sendPinnedFile(req,res,result){
 const size=result.bytes!==null?result.bytes.length:fs.statSync(result.file).size;
 res.setHeader('Accept-Ranges','bytes');
 // Retain the observed existing service contract, including HEAD Range and its
 // unconditional byte ranges. This is compatibility, not a new media policy.
 const raw=req.headers.range;
 const apply=typeof raw==='string';
 let start=0,end=size-1,status=200;
 if(apply){
  const m=/^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
  if(m[1]){start=Number(m[1]);end=m[2]?Number(m[2]):size-1;}
  else{const suffix=Number(m[2]);start=Math.max(0,size-suffix);end=size-1;if(!Number.isSafeInteger(suffix)||suffix<=0)start=size;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
  status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
 }
 res.setHeader('Content-Length',String(status===206?end-start+1:size));res.writeHead(status);
 if(req.method==='HEAD'||size===0){res.end();return;}
 if(result.bytes!==null){res.end(status===206?result.bytes.subarray(start,end+1):result.bytes);return;}
 fs.createReadStream(result.file,status===206?{start,end}:undefined).on('error',()=>res.destroy()).pipe(res);
}
