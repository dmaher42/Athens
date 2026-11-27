// Preserve original game JS bytes. Old absolute asset URLs resolve using the
// immutable same-origin document/module referrer. Anonymous old clients use
// only the frozen legacy catalog; never a moving global pointer or folder scan.
import {resolveRequest,releaseURL,readRelease,readPointer} from './registry.mjs';
const PUBLIC='/athens-game-starter/',stable=new Set([PUBLIC,PUBLIC+'index.html',PUBLIC+'sparta/',PUBLIC+'sparta/index.html']);
export function resolvePrebuiltRequest(home,target,headers={},options={}){
 const url=new URL(target,'http://'+(headers.host??'127.0.0.1:5189'));let context=null;
 if(headers.referer){try{const ref=new URL(headers.referer),match=/^\/__babylon\/apps\/(athens|sparta)\/releases\/([a-f0-9]{12})\/athens-game-starter\//.exec(ref.pathname);if(match&&ref.origin===url.origin)context={app:match[1],id:match[2]};}catch{}}
 if(context&&url.pathname==='/__babylon/status'){
  try{const release=readRelease(home,context.app,context.id),base=resolveRequest(home,'/__babylon/status',options);if(base.type!=='json')return base;return{...base,body:{...base.body,id:context.id,entry:releaseURL(context.app,context.id,release.manifest.provenance.originalEntry),entrySHA256:release.manifest.provenance.originalEntrySHA256,assetRouting:'pinned-request-context-v1',pageApp:context.app}};}catch{return{type:'error',status:503,message:'Pinned page release unavailable'};}
 }
 if(context&&url.pathname.startsWith(PUBLIC)&&!stable.has(url.pathname)){
  // Pass the original encoded path to the hardened resolver; do not normalize
  // dot segments or encoded separators into a different allowed path.
  const pathOnly=target.split('?')[0];return resolveRequest(home,releaseURL(context.app,context.id)+pathOnly.slice(PUBLIC.length)+(url.search??''),options);
 }
 return resolveRequest(home,target,options);
}
