import {sites,neighbours,court,templeTerrace,royalTerrace,zeusForecourt,paths,contains,distanceTo,roadDistance} from './CivicSite.mjs';

const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const grow=(b,n)=>({west:b.west-n,east:b.east+n,south:b.south-n,north:b.north+n});
const intersects=(a,b)=>a.west<=b.east&&a.east>=b.west&&a.south<=b.north&&a.north>=b.south;
const publicFrontage=paths.find(p=>p.id==='civic-walk');
const separatingWalk=paths.find(p=>p.id==='district-separator-walk');
const padRect=(site,feather)=>({id:site.id,...site.bounds,feather,earth:site.to[1]-.06});
const pads=[
  {...padRect(sites.find(s=>s.id==='new-council'),2.3),east:-139.46},
  {...court,id:'civic-court',feather:2.8,earth:court.top-.06},
  ...sites.filter(s=>s.id!=='new-council'&&s.id!=='hephaestus').map(s=>padRect(s,s.id==='tholos'?1.4:3.3)),
  ...neighbours.map(s=>padRect(s,2.2)),
  {...templeTerrace,id:'temple-terrace',feather:4.6,earth:templeTerrace.top-.06},
  {...royalTerrace,id:'royal-terrace',feather:4.1,earth:royalTerrace.top-.06},
  {...zeusForecourt,id:'zeus-forecourt',feather:5.2,earth:zeusForecourt.top-.04},
];

function pathGrade(path,x,z,margin) {
  let nearest=Infinity,level=0;
  for(let i=1;i<path.points.length;i++) {
    const a=path.points[i-1],b=path.points[i];
    const dx=b[0]-a[0],dz=b[1]-a[1];
    const f=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
    const d=Math.hypot(x-a[0]-f*dx,z-a[1]-f*dz);
    if(d<nearest){nearest=d;level=path.levels[i-1]+f*(path.levels[i]-path.levels[i-1]);}
  }
  return {level,influence:smooth((path.width/2+margin-nearest)/margin)};
}

function grade(x,z,height) {
  // Preserve the actual workshop and its entire original turnout shoulder.
  if(x<=-173&&z<=107||z>=24&&z<=39&&roadDistance(x,z)<=8)return height;
  // The existing neighbourhood fountain is built on the original datum.
  // Keep its footing while the civic walk climbs along its western side.
  if(x>=-130.2&&x<=-119.8&&z>=116.5&&z<=121.5)return height;
  let sum=0,weight=0,maximum=0;
  for(const p of pads) {
    const d=distanceTo(x,z,p);
    if(d>p.feather)continue;
    if(d<.0001)return p.earth;
    const w=smooth(1-d/p.feather);
    sum+=p.earth*w;weight+=w;maximum=Math.max(maximum,w);
  }
  for(const [path,margin] of [[publicFrontage,2.8],[separatingWalk,1.8]]) {
    const {level,influence}=pathGrade(path,x,z,margin);
    const trace=path===publicFrontage&&z<43?influence*smooth((z-38)/5):path===separatingWalk?influence*smooth((150-z)/1.25):influence;
    if(trace>.99999)return level-.03;
    maximum=Math.max(maximum,trace);sum+=(level-.03)*trace;weight+=trace;
  }
  return weight?height+(sum/weight-height)*maximum:height;
}

function cuts(low,high,base) {
  const lines=Array.from({length:Math.max(0,Math.ceil((high-low)/2))},(_,i)=>Math.ceil(low/2)*2+2*i);
  return [...new Set([...lines,...base])].filter(k=>k>low+1e-9&&k<high-1e-9).sort((a,b)=>a-b);
}

function split(pieces,axis,lines) {
  for(const line of lines) {
    const divided=[];
    for(const face of pieces) {
      if(!face.some(p=>p[axis]<line)||!face.some(p=>p[axis]>line)){divided.push(face);continue;}
      const lower=[],upper=[];
      for(let i=0;i<face.length;i++) {
        const a=face[i],b=face[(i+1)%face.length];
        if(a[axis]<=line)lower.push(a);
        if(a[axis]>=line)upper.push(a);
        if((a[axis]-line)*(b[axis]-line)>=0)continue;
        const t=(line-a[axis])/(b[axis]-a[axis]);
        const c=a.map((v,j)=>v+t*(b[j]-v));c[axis]=line;
        lower.push(c);upper.push(c);
      }
      divided.push(lower,upper);
    }
    pieces=divided;
  }
  return pieces;
}

const pathArea=paths.flatMap(path=>path.points.slice(1).map((b,i)=>{
  const a=path.points[i];
  return grow({west:Math.min(a[0],b[0]),east:Math.max(a[0],b[0]),south:Math.min(a[1],b[1]),north:Math.max(a[1],b[1])},5.8);
}));
const activeAreas=[...pads.map(p=>grow(p,p.feather+1.2)),...pathArea];
const xLimits=[-130.2,-119.8,...pads.flatMap(p=>[p.west,p.east])];
const zLimits=[116.5,121.5,...pads.flatMap(p=>[p.south,p.north])];
const area=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);

export function fitCivicTerrain(p,uv,mask,grouped,nativeHeight,makeHeight) {
  const positions=Array.from(p),uvs=Array.from(uv),vertexMask=Array.from(mask),indices=[],groups=[],refined=[];
  const keys=new Map();let replaced=0,sourceArea=0,outputArea=0;
  const vector=id=>[p[id*3],p[id*3+1],p[id*3+2],mask[id]];
  function vertex(a) {
    const x=Math.fround(a[0]),z=Math.fround(a[2]),y=Math.fround(grade(x,z,a[1])),value=Math.fround(a[3]);
    const key=x+','+y+','+z+','+value;
    const prior=keys.get(key);if(prior!==undefined)return prior;
    const id=positions.length/3;keys.set(key,id);
    positions.push(x,y,z);uvs.push((x+1200)/2400,(z+1200)/2400);vertexMask.push(value);
    return id;
  }
  for(const group of grouped.groups) {
    const first=indices.length;
    for(let i=group.start;i<group.start+group.count;i+=3) {
      const a=grouped.indices[i],b=grouped.indices[i+1],c=grouped.indices[i+2];
      const minX=Math.min(p[a*3],p[b*3],p[c*3]),maxX=Math.max(p[a*3],p[b*3],p[c*3]);
      const minZ=Math.min(p[a*3+2],p[b*3+2],p[c*3+2]),maxZ=Math.max(p[a*3+2],p[b*3+2],p[c*3+2]);
      const bounds={west:minX,east:maxX,south:minZ,north:maxZ};
      if(!activeAreas.some(rect=>intersects(rect,bounds))){indices.push(a,b,c);continue;}
      const old=[vector(a),vector(b),vector(c)],size=area(...old);
      if(Math.abs(size)<1e-10){indices.push(a,b,c);continue;}
      const pieces=split(split([old],0,cuts(minX,maxX,xLimits)),2,cuts(minZ,maxZ,zLimits));
      sourceArea+=Math.abs(size);replaced++;
      for(const piece of pieces)for(let n=1;n<piece.length-1;n++) {
        const next=[piece[0],piece[n],piece[n+1]],nextSize=area(...next);
        if(Math.abs(nextSize)<1e-10)continue;
        if(Math.sign(nextSize)!==Math.sign(size))throw Error('Inverted civic terrain face');
        const row=next.map(vertex);indices.push(...row);refined.push(...row);
        outputArea+=Math.abs(nextSize);
      }
    }
    groups.push({...group,start:first,count:indices.length-first});
  }
  if(!replaced||Math.abs(sourceArea-outputArea)>1e-4)throw Error('Incomplete civic terrain coverage');
  const result=new Float32Array(positions),local=makeHeight(result,new Uint32Array(refined),4);
  const height=(x,z)=>activeAreas.some(area=>contains(x,z,area))?local(x,z)??nativeHeight(x,z):nativeHeight(x,z);
  return {positions:result,uvs:new Float32Array(uvs),mask:new Float32Array(vertexMask),indices:new Uint32Array(indices),groups,height,
    stats:{replaced,addedVertices:keys.size,refinedTriangles:refined.length/3,sourceArea,outputArea}};
}
