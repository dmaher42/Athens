// Pure, deterministic land-use planning. Babylon and the release are caller-owned.
export const PATCH=Object.freeze({x:-535,z:-85,width:64,depth:48,feather:7,cell:32});
export const PROFILES=Object.freeze(Object.fromEntries(Object.entries({
  harbour:{label:'Piraeus harbour',earth:.75,gravel:.66,rock:.28,natural:.16,grass:.09,shrubs:.015,flowers:.002,ruts:.025,relief:.065},
  agora:{label:'Agora public ground',earth:.88,gravel:.40,rock:.05,natural:.06,grass:.025,shrubs:0,flowers:0,ruts:.009,relief:.035},
  kerameikos:{label:'Kerameikos',earth:.66,gravel:.42,rock:.22,natural:.44,grass:.19,shrubs:.018,flowers:.004,ruts:.018,relief:.10},
  acropolis:{label:'Acropolis limestone',earth:.25,gravel:.62,rock:.84,natural:.22,grass:.095,shrubs:.018,flowers:.003,ruts:0,relief:.11},
  residential:{label:'Residential streets',earth:.80,gravel:.38,rock:.12,natural:.21,grass:.11,shrubs:.008,flowers:.002,ruts:.018,relief:.055},
  countryside:{label:'Attic countryside',earth:.43,gravel:.36,rock:.44,natural:.78,grass:.31,shrubs:.030,flowers:.008,ruts:.02,relief:.14},
  piraeusRoad:{label:'Road to Piraeus',earth:.76,gravel:.48,rock:.33,natural:.57,grass:.24,shrubs:.025,flowers:.005,ruts:.032,relief:.11}
}).map(([key,value])=>[key,Object.freeze(value)])));
export const clamp=v=>Math.max(0,Math.min(1,v));
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const hash=(x,z,seed=0)=>{const n=Math.sin(x*127.1+z*311.7+seed*73.17)*43758.5453123;return n-Math.floor(n);};
export function noise(x,z,seed=0){const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);return (1-v)*((1-u)*hash(ix,iz,seed)+u*hash(ix+1,iz,seed))+v*((1-u)*hash(ix,iz+1,seed)+u*hash(ix+1,iz+1,seed));}
export function nearestOnRoad(x,z,points){let best={distance:Infinity,x:0,z:0,along:0};let along=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(l*l||1)),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(px-x,pz-z);if(d<best.distance)best={distance:d,x:px,z:pz,along:along+l*t};along+=l;}return best;}
export function boundaryWeight(x,z,patch=PATCH){const edge=Math.min(patch.width/2-Math.abs(x-patch.x),patch.depth/2-Math.abs(z-patch.z));return smooth(0,patch.feather,edge);}
export function inside(x,z,patch=PATCH,inset=0){return Math.abs(x-patch.x)<patch.width/2-inset&&Math.abs(z-patch.z)<patch.depth/2-inset;}
export function foundationClearance(x,z,foundations){let best=Infinity;for(const f of foundations){const dx=x-f.x,dz=z-f.z,c=Math.cos(f.rotation??0),s=Math.sin(f.rotation??0),lx=c*dx-s*dz,lz=s*dx+c*dz;best=Math.min(best,Math.hypot(Math.max(0,Math.abs(lx)-f.w/2),Math.max(0,Math.abs(lz)-f.d/2)));}return best;}
export function protectedTriangleVertices(p,indices,ctx){const result=new Set();for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],x=ids.reduce((v,j)=>v+p[j*3],0)/3,z=ids.reduce((v,j)=>v+p[j*3+2],0)/3,radius=Math.max(...ids.map(j=>Math.hypot(p[j*3]-x,p[j*3+2]-z)));if(nearestOnRoad(x,z,ctx.roads).distance<=7+radius||foundationClearance(x,z,ctx.foundations??[])<=2+radius)for(const id of ids)result.add(id);}return result;}
export function landUse(x,z,ctx){const p=PROFILES[ctx.profile??'countryside'],road=ctx.nearestRoad?.(x,z)??nearestOnRoad(x,z,ctx.roads),n=noise(x/9,z/9,4),fine=noise(x/2.3,z/2.3,8),edge=boundaryWeight(x,z,ctx.patch),clear=foundationClearance(x,z,ctx.foundations??[]),protectedGround=1-smooth(1,3,clear);
  const wear=1-smooth(2.1,4.8+.7*(n-.5),road.distance),shoulder=(1-smooth(3,7.6,road.distance))*smooth(2.1,3.8,road.distance);
  const rockPocket=smooth(.50,.77,noise(x/12+12,z/9-5,21))*(1-wear);
  const rock=clamp(p.rock*(.15+rockPocket*1.65));
  const gravel=clamp(p.gravel*(.36+.64*fine)+shoulder*.5+rock*.34);
  const natural=clamp(p.natural*(.3+.9*n)*(1-wear)*(1-protectedGround));
  const ruts=(1-smooth(.09,.29,Math.abs(road.distance-1.03)))*wear*(p.ruts/.035);
  return {road,wear,shoulder,rock,gravel,natural,edge,clear,protectedGround,n,fine,ruts};
}
export function reliefAt(x,z,ctx){const u=landUse(x,z,ctx),p=PROFILES[ctx.profile??'countryside'];
  // Road centre and graded shoulders through 7m are EXACTLY the selected terrain.
  // Foundation buffer and outer boundary have exactly zero displacement too.
  const protect=smooth(7,10,u.road.distance)*smooth(2,4,u.clear)*u.edge;
  if(protect===0)return 0;
  const undulation=(noise(x/5,z/5,16)-.5)*1.5+(noise(x/1.9,z/1.9,17)-.5)*.22;
  const erosion=-.25*Math.exp(-Math.pow((Math.sin(z*.18)*1.4+x-(ctx.patch??PATCH).x-12)/1.1,2));
  return Math.max(-p.relief,Math.min(p.relief,p.relief*(undulation+erosion)))*protect;
}
export function planDetails(ctx,height){const patch=ctx.patch??PATCH,p=PROFILES[ctx.profile??'countryside'],result=[],counts={},rejected={road:0,foundation:0,steep:0};
  const specs=[['grass',.78,p.grass,4.6],['shrub',1.6,p.shrubs*2.8,6],['flower',1.1,p.flowers*3.2,5.2],['pebble',.95,.14+p.gravel*.23,3.6],['outcrop',2.7,p.rock*.29,8]];
  for(const [kind,spacing,density,roadClear]of specs)for(let x=patch.x-patch.width/2+4;x<patch.x+patch.width/2-4;x+=spacing)for(let z=patch.z-patch.depth/2+4;z<patch.z+patch.depth/2-4;z+=spacing){const seed=kind.length*7,px=x+(hash(x,z,seed)-.5)*spacing*.8,pz=z+(hash(x,z,seed+1)-.5)*spacing*.8,u=landUse(px,pz,ctx),cluster=.22+.95*noise(px/4.5,pz/4.5,seed+2),chance=density*cluster*(kind==='pebble'?.55+u.gravel:kind==='outcrop'?u.rock:Math.max(.08,u.natural));
    if(hash(x,z,seed+3)>chance)continue;
    if(u.road.distance<roadClear){rejected.road++;continue;}if(u.clear<3){rejected.foundation++;continue;}
    const y=height(px,pz),r=kind==='outcrop'?.6:kind==='shrub'?.28:.11,samples=[[px+r,pz],[px-r,pz],[px,pz+r],[px,pz-r]].map(([a,b])=>height(a,b));
    if(y===null||samples.some(q=>q===null)||Math.max(...samples)-Math.min(...samples)>.50*r){rejected.steep++;continue;}
    const scale=kind==='outcrop'?.65+hash(px,pz,91)*1.15:kind==='shrub'?.55+hash(px,pz,92)*.55:kind==='pebble'?.055+hash(px,pz,93)*.12:.60+hash(px,pz,94)*.55;
    const item={kind,x:px,y:Math.min(y,...samples)-.008,z:pz,scale,yaw:hash(px,pz,51)*Math.PI*2,tint:.79+hash(px,pz,52)*.25,cell:Math.floor((px-patch.x+patch.width/2)/patch.cell)+','+Math.floor((pz-patch.z+patch.depth/2)/patch.cell),roadClearance:u.road.distance,foundationClearance:u.clear};
    result.push(item);counts[kind]=(counts[kind]??0)+1;
  }
  return {items:result,counts,rejected,seed:'world coordinate / kind / fixed seed',roadProtectedRadius:7};
}
