import {COUNCIL_SITE as C,AGORA_AVENUE} from './AgoraMasterPlan.mjs';
export function remapGradePlan(plan){
 const move=(r,dx,dz)=>({...r,...('west'in r?{west:r.west+dx,east:r.east+dx,south:r.south+dz,north:r.north+dz}:{x:r.x+dx,startZ:r.startZ+dz,endZ:r.endZ+dz})});
 const pads=plan.pads.map(r=>r.id.startsWith('zeus-')?move(r,-2,.5):r);
 pads.push({id:'agora-painted-stoa-relocated-floor',west:-111.6,east:-82.4,south:76.1,north:84,top:1.5});
 return{...plan,id:plan.id+'-agora-master',pads,stairs:plan.stairs,influenceEnvelopes:[
  ...plan.influenceEnvelopes.map(r=>r.id.includes('zeus-')?move(r,-2,.5):r),
  {id:'agora-painted-incident-ring',west:-119,east:-75,south:69,north:93},
 ],influenceEvidence:'Owner-authorised Agora master reorganisation; retain existing cut-only grade kernel and protected temple pads; inspect actual incident triangles before any envelope revision'};
}
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
// Local real-terrain terrace. The established native height index consumes the
// resulting buffer; no independent runtime height sampler or invisible floor.
export function gradeCouncilTerrace(p,indices){
 const changes=[],affected=new Set(),before=p.slice();
 const envelope={west:C.west-6,east:C.east+6,south:C.south-5,north:C.north+5};
 const inside=(x,z)=>x>=envelope.west&&x<=envelope.east&&z>=envelope.south&&z<=envelope.north;
 for(let i=0;i<p.length;i+=3){
  const x=p[i],z=p[i+2],old=p[i+1];if(!inside(x,z))continue;
  const distance=Math.hypot(Math.max(C.west-x,0,x-C.east)/4,Math.max(C.south-z,0,z-C.north)/3);
  if(distance>=1)continue;
  let next=old+(C.ground-old)*(1-smooth(distance));
  for(const door of C.doors)if(x>=C.stairWest-.4&&x<=C.stairEast+.4&&Math.abs(z-door)<=C.stairWidth/2+.4){
   const plane=C.low+(C.floor-C.low)*clamp((C.stairEast-x)/(C.stairEast-C.stairWest));
   next=Math.min(next,plane-.08);
  }
  next=Math.fround(next);if(Math.abs(next-old)<1e-5)continue;
  p[i+1]=next;affected.add(i/3);changes.push({vertex:i/3,x,z,before:old,after:next});
 }
 // Cap every triangle that actually overlaps the foundation, including its
 // outside vertices, so interpolation cannot leave soil through the chamber.
 for(let i=0;i<indices.length;i+=3){
  const v=[indices[i],indices[i+1],indices[i+2]],xs=v.map(n=>p[n*3]),zs=v.map(n=>p[n*3+2]);
  if(Math.max(...xs)<=C.west||Math.min(...xs)>=C.east||Math.max(...zs)<=C.south||Math.min(...zs)>=C.north)continue;
  for(const n of v){const old=p[n*3+1];if(old<=C.ground)continue;p[n*3+1]=C.ground;affected.add(n);const change=changes.find(c=>c.vertex===n);if(change)change.after=C.ground;else changes.push({vertex:n,x:p[n*3],z:p[n*3+2],before:before[n*3+1],after:C.ground});}
 }
 // A bounded grade must not move the triangle beneath an unchanged monument or
 // any part of the pottery site. Reject rather than hiding that influence.
 const protectedRects=[{west:-156.4,east:-143.6,south:63.12,north:95.35},{west:-214,east:-174,south:60,north:98}];
 let triangles=0;
 for(let i=0;i<indices.length;i+=3){const v=[indices[i],indices[i+1],indices[i+2]];if(!v.some(n=>affected.has(n)))continue;triangles++;
  const xs=v.map(n=>p[n*3]),zs=v.map(n=>p[n*3+2]),b={west:Math.min(...xs),east:Math.max(...xs),south:Math.min(...zs),north:Math.max(...zs)};
  const outside=v.some(n=>!inside(p[n*3],p[n*3+2]));
  const protectedHit=protectedRects.some(r=>b.west<r.east&&b.east>r.west&&b.south<r.north&&b.north>r.south);
  if(outside||protectedHit){p.set(before);throw Error('Council terrace influencing triangle needs bounded native refinement: '+i/3);}
 }
 return{owner:'AgoraMasterTerrain',changed:changes.length,triangles,envelope,maxCut:Math.max(0,...changes.map(c=>c.before-c.after)),maxFill:Math.max(0,...changes.map(c=>c.after-c.before)),changes,realTerrain:true,xzAndIndicesUnchanged:true};
}
export function prepareTerrain(original,p,indices,sea,factory,options){
 return original(p,indices,sea,factory,{...options,plan:remapGradePlan(options.plan)});
}
export function finalizeTerrain(p,indices,factory,report){
 const council=gradeCouncilTerrace(p,indices);report.agoraMasterCouncilTerrace=council;
 // The retained raised public approach crosses the old1.55m doorway at about
 //3.2m. Seat the complete existing hall at that real approach level rather
 // than cutting beneath its solid surface or disabling head-clearance checks.
 const oldCouncilChanges=[];for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2],distance=Math.hypot(Math.max(-156.3-x,0,x+143.7)/1.5,Math.max(63.12-z,0,z-73.2)/1.5);if(distance>=1)continue;const before=p[i+1],after=Math.fround(before+(3.15-before)*(1-smooth(distance)));if(Math.abs(after-before)>1e-5){p[i+1]=after;oldCouncilChanges.push({x,z,before,after});}}
 let oldCouncilTriangleSeats=0;for(let i=0;i<indices.length;i+=3){const v=[indices[i],indices[i+1],indices[i+2]],xs=v.map(n=>p[n*3]),zs=v.map(n=>p[n*3+2]);if(Math.max(...xs)<=-156.3||Math.min(...xs)>=-143.7||Math.max(...zs)<=63.12||Math.min(...zs)>=73.2)continue;for(const n of v)if(Math.abs(p[n*3+1]-3.15)>1e-5){p[n*3+1]=Math.fround(3.15);oldCouncilTriangleSeats++;}}
 report.agoraMasterOldCouncilTerrace={ground:3.15,floor:3.2,changed:oldCouncilChanges.length,changes:oldCouncilChanges,oldCouncilTriangleSeats,existingApproachRetained:true,realTerrain:true};
 // The measured road had a1.56 rise/run at the old hillside cut. Spread the
 // same descent along the real road bed, retaining both existing tie-in levels.
 const sample=factory(p,indices),west=sample(-181,30),east=sample(-146,31.5);
 if(!Number.isFinite(west)||!Number.isFinite(east))throw Error('Road grade needs native tie-in heights');
 const road=AGORA_AVENUE.slice(0,4),changes=[];
 for(let i=0;i<p.length;i+=3){const x=p[i],z=p[i+2];if(x<-185||x>-142||z<24||z>42)continue;
  let distance=Infinity;for(let j=1;j<road.length;j++){const a=road[j-1],b=road[j],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}
  const weight=(1-smooth((distance-3.6)/1.4))*smooth((x+185)/4)*(1-smooth((x+146)/4));if(weight<=0)continue;
  // The retained lowest Acropolis tread is3.038m at(-161.19,30.23).
  // Seat the road over that contact instead of leaving a .273m exposed riser.
  const middle=3.4,target=x<=-165?west+(middle-west)*clamp((x+181)/16):middle+(east-middle)*clamp((x+165)/19);
  const old=p[i+1],next=Math.fround(old+(target-old)*weight);if(Math.abs(next-old)>1e-5){p[i+1]=next;changes.push({x,z,before:old,after:next});}
 }
 let foundationCaps=0;for(let i=0;i<indices.length;i+=3){const v=[indices[i],indices[i+1],indices[i+2]],xs=v.map(n=>p[n*3]),zs=v.map(n=>p[n*3+2]);if(Math.max(...xs)<=C.west||Math.min(...xs)>=C.east||Math.max(...zs)<=C.south||Math.min(...zs)>=C.north)continue;for(const n of v)if(p[n*3+1]>C.ground){p[n*3+1]=C.ground;foundationCaps++;}}
 report.agoraMasterRoadGrade={westTie:west,eastTie:east,middleHeight:3.4,changed:changes.length,changes,foundationCaps,realTerrain:true,xzAndIndicesUnchanged:true,afterRetainedKerameikosGrade:true};return report;
}
