// Single site contract for the authorised layout pass. No model reconstruction.
export const AGORA_MASTER_SITES=Object.freeze({
 'new-council':{from:[-149,1.5,49.9],to:[-156,3,46.5]},
 'zeus-stoa':{from:[-129.5785,1.5,56],to:[-127.5785,1.5,83]},
 'royal-stoa':{from:[-128.5,2.4,94],to:[-166,7.8,110]},
 'painted-stoa':{from:[-97,1.5,69],to:[-97,1.5,80]},
 'old-council':{from:[-150,1.5028880834579468,68],to:[-150,3.15,68]},
});
export const COUNCIL_SITE=Object.freeze({west:-164.75,east:-147.25,south:35.25,north:57.75,ground:3,floor:3.05,doors:[37.9,55.1],stairEast:-138.5,stairWest:-143.8,stairWidth:6,low:1.5});
export const AGORA_AVENUE=Object.freeze([[-181,30],[-173,31.5],[-165,31.5],[-146,31.5],[-143,29],[-138,28],[-118,28],[-105,36]].map(Object.freeze));
export const ZEUS_OCCUPIED=Object.freeze([
 {west:-136.917,east:-124.083,south:59.762,north:106.238},
 {west:-124.083,east:-118.24,south:59.762,north:72.421},
 {west:-124.083,east:-118.24,south:93.579,north:106.238},
]);
export const AGORA_RESERVED=Object.freeze([
 {id:'new-council-foundation',...COUNCIL_SITE},
 {id:'council-public-arrival',west:-147.55,east:-116,south:35,north:58.2},
 {id:'western-civic-public-lane',west:-142,east:-137,south:58.2,north:105.5},
 {id:'royal-relocated-body-and-terrace',west:-170.5,east:-153,south:100.8,north:119.2},
 {id:'royal-east-public-arrival',west:-153.2,east:-139.5,south:102.2,north:105.8},
 {id:'royal-north-public-walk',west:-157.2,east:-153.8,south:118.2,north:123.2},
 ...ZEUS_OCCUPIED.map((p,i)=>({id:'zeus-pi-'+i,...p})),
 {id:'painted-stoa',west:-111.6,east:-82.4,south:76.1,north:84},
]);
export function delta(id){const p=AGORA_MASTER_SITES[id];return p?p.to.map((v,i)=>v-p.from[i]):null;}
const shifted=(points,dx,dz)=>points.map(p=>[p[0]+dx,p[1]+dz,...p.slice(2)]);
export function remapRoads(routes){return routes.map(route=>{
 if(route.id!=='dipylon-agora-avenue')return route;
 const endpoint=route.points.at(-1);
 if(!endpoint||Math.hypot(endpoint[0]+105,endpoint[1]-36)>.001)throw Error('Re-survey changed Dipylon connection: '+JSON.stringify({first:route.points[0],last:endpoint}));
 const prefix=route.points.filter(p=>p[0]<-181),tail=prefix.length?AGORA_AVENUE:AGORA_AVENUE.filter(p=>p[0]>route.points[0][0]);
 const points=[...(prefix.length?prefix:[route.points[0]]),...tail];points[points.length-1]=endpoint;
 return{...route,width:7,startWidth:7,endWidth:7,points};
});}
export function remapCivicRoutes(routes){
 const result=routes.filter(r=>!r.id?.startsWith('new-council-')).map(r=>{
  if(['council-agora-approach','council-east-walk'].includes(r.id))return{...r,width:3,points:[[-105,36],[-118,28],[-135,28],[-135,37.9],[-138.5,37.9],[-143.8,37.9],[-148.55,37.9]]};
  return r;
 });
 return[...result,
  {id:'new-council-east-through-lane',width:2.4,type:'path',role:'civic',points:[[-135,28],[-135,37.9],[-135,55.1],[-139,58.5],[-139,63]]},
  ...COUNCIL_SITE.doors.map((z,i)=>({id:'new-council-'+(i?'northeast':'southeast')+'-threshold',width:2.4,type:'path',role:'civic',points:[[-135,z],[-138.5,z],[-143.8,z],[-147.55,z],[-148.55,z]]})),
  // Existing terrain passage outside the retained precinct wall. These rows
  // reserve native living/foliage margins; they do not draw a new road surface.
  {id:'new-council-royal-pedestrian-connector',width:1.5,type:'path',role:'civic',points:[[-139,76],[-138,82],[-138,104.75],[-139.7,104.75]]},
 ];
}
export function remapWalks(routes){return routes.map(r=>{
 if(r.id==='agora-west-civic')return{...r,width:1.5,points:[[-135,31.5],[-135,45],[-139,58.5],[-139,76],[-138,82],[-138,104.75],[-139.7,104.75]]};
 let d;
 if(r.id?.includes('painted'))d=delta('painted-stoa');
 else if(r.id?.includes('royal'))d=delta('royal-stoa');
 else if(r.id?.includes('zeus'))d=delta('zeus-stoa');
 return d?{...r,points:shifted(r.points,d[0],d[2])}:r;
});}
export function remapZone(zone){
 if(zone.id!=='painted-market')return zone;
 const d=delta('painted-stoa'),result={...zone};
 for(const key of ['trees','arbours','stalls','benches','goods'])result[key]=zone[key].map(p=>({...p,x:p.x+d[0],z:p.z+d[2],...(key==='trees'?{agoraOriginalAnchor:{x:p.x,z:p.z}}:{})}));
 return result;
}
export function remapMarketSite(site){
 if(!['figs','cloth'].includes(site.id))return site;
 const d=delta('painted-stoa');return{...site,x:site.x+d[0],z:site.z+d[2],buyerX:site.buyerX+d[0],buyerZ:site.buyerZ+d[2]};
}
export function remapActorStops(id,stops){
 // seller-cloth is generated from the already moved MARKET_SITES row.
 if(!['fig-grower','cloth-customer','north-shopper'].includes(id))return stops;
 const d=delta('painted-stoa'),dz=id==='north-shopper'?-8:d[2];
 return stops.map(p=>({...p,x:p.x+d[0],z:p.z+dz}));
}
export function remapLivingWalk(route){
 let changed=false;const points=route.points.map(p=>{
  if(p[0]>=-113&&p[0]<=-78&&p[1]>=55&&p[1]<=66){changed=true;return[p[0],p[1]+11,...p.slice(2)];}return p;
 });return changed?{...route,points}:route;
}
export function remapFootprints(rows){return rows.flatMap(row=>{
 const id=String(row.id).replace(/^agora:/,'').replace(/:pi-\d+$/,'');
 if(id==='new-council')return[{...row,x:(COUNCIL_SITE.west+COUNCIL_SITE.east)/2,z:(COUNCIL_SITE.south+COUNCIL_SITE.north)/2,w:COUNCIL_SITE.east-COUNCIL_SITE.west,d:COUNCIL_SITE.north-COUNCIL_SITE.south,rotation:0,round:false}];
 if(id==='zeus-stoa'){
  const i=Number(/:pi-(\d+)$/.exec(row.id)?.[1]??0),b=ZEUS_OCCUPIED[i];
  return[{...row,x:(b.west+b.east)/2,z:(b.south+b.north)/2,w:b.east-b.west,d:b.north-b.south,rotation:0}];
 }
 const d=delta(id);return d?[{...row,x:row.x+d[0],z:row.z+d[2]}]:[row];
});}
const hit=(a,b,margin=0)=>a.west<b.east+margin&&a.east>b.west-margin&&a.south<b.north+margin&&a.north>b.south-margin;
// Selection is restricted to complete generated filler houses. The existing
// verified native kernel subsequently proves every component/collider identity.
export function selectFillerHouses(scene,colliders){
 const targets=[];
 const already=new Set((scene.metadata?.zeusSiteClearance?.houses??[]).map(h=>h.name));
 for(const c of colliders){
  const m=/^redesign-house-(\d+)$/.exec(c.name);if(!m)continue;
  if(already.has(c.name))continue;
  const co=Math.abs(Math.cos(c.rotY??0)),si=Math.abs(Math.sin(c.rotY??0));
  const hx=(co*c.w+si*c.d)/2,hz=(si*c.w+co*c.d)/2,b={west:c.cx-hx,east:c.cx+hx,south:c.cz-hz,north:c.cz+hz};
  if(!AGORA_RESERVED.some(r=>hit(b,r,.8)))continue;
  if(c.cx<-178||c.cx>-75||c.cz<25||c.cz>128)throw Error('Agora filler selection left authorised local civic envelope');
  targets.push({id:Number(m[1]),x:c.cx,z:c.cz});
 }
 if(targets.length>24)throw Error('Unexpectedly broad Agora house clearance; inspect native survey');
 scene.metadata.agoraMasterLayout??={version:1,sites:[],architectureReconstructed:false};scene.metadata.agoraMasterLayout.fillerHouses=targets;
 return targets;
}

// Preserve the original native deduplication decision and its stable tree IDs.
export function originalFoliageAnchors(rows){return rows.map(p=>p.agoraOriginalAnchor?{...p,x:p.agoraOriginalAnchor.x,z:p.agoraOriginalAnchor.z}:p);}

// Reuse the original whole-object clearance kernel, retaining every previous omission.
export function extendZeusClearance(original){return [...original,...AGORA_RESERVED.filter(r=>!r.id.startsWith('painted')).map(r=>({id:'agora-second-pass-'+r.id,x:(r.west+r.east)/2,z:(r.south+r.north)/2,hx:(r.east-r.west)/2,hz:(r.north-r.south)/2,ax:1,az:0}))];}
export function terrainRefinements(){return[{id:'second-pass-zeus-contact',west:-141,east:-115,south:55,north:111,passes:3},{id:'second-pass-royal-contact',west:-176,east:-137,south:96,north:126.5,passes:3},{id:'second-pass-civic-stair-contact',west:-139.4,east:-136.6,south:80.5,north:106.5,passes:6}];}
export function cameraGradeEnvelopes(original){return [...original,{west:-142,east:-112.5,south:55,north:110},{west:-176,east:-138,south:95,north:126},{west:-172,east:-136.5,south:30,north:63}];}
