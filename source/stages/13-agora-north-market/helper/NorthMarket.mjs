import design from './NORTH-SITE.json' with {type:'json'};

const landmarks=new Map(design.landmarks.map(site=>[site.id,site]));
const stalls=new Map(design.stalls.map(site=>[site.id,site]));
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const distance=(x,z,b)=>Math.hypot(Math.max(b.west-x,0,x-b.east),Math.max(b.south-z,0,z-b.north));
const intersects=(a,b)=>a.west<b.east&&a.east>b.west&&a.south<b.north&&a.north>b.south;
const grow=(b,n)=>({west:b.west-n,east:b.east+n,south:b.south-n,north:b.north+n});
const profiles=design.earth;
const ramps=design.slopes??[];
const rampAreas=ramps.map(({points,width,feather})=>grow({west:Math.min(...points.map(p=>p[0])),east:Math.max(...points.map(p=>p[0])),
  south:Math.min(...points.map(p=>p[1])),north:Math.max(...points.map(p=>p[1]))},width/2+feather+1));
export const terrainAreas=[...profiles.map(b=>grow(b,b.feather+1)),...rampAreas];
export const square=design.square;
export const touchesTerrain=(x,z)=>terrainAreas.some(b=>distance(x,z,b)===0);
const coordinate=(x,z)=>x.toFixed(7)+','+z.toFixed(7);
const houses=new Map(design.parentPlots?.houses.map(row=>[coordinate(row.x,row.z),row]));
const trees=new Map;
const treeCounts={olive:0,cypress:0};
for(const row of design.parentPlots?.trees??[]){
  trees.set(row.kind+coordinate(row.x,row.z),{...row,index:treeCounts[row.kind]++});
}

export function originalHouse(x,z,w,d,h,yaw,id) {
  const source=houses.get(coordinate(x,z));
  if(!source)return null;
  if(source.id!==id||source.w!==w||source.d!==d||source.h!==h||source.yaw!==yaw)
    throw Error('Parent procedural house sequence drift at '+coordinate(x,z));
  return {ok:true,minY:source.min,maxY:source.max};
}

export function originalTree(kind,x,z,scale,id) {
  const source=trees.get(kind+coordinate(x,z));
  if(!source)return null;
  if(source.index!==id||source.scale!==scale)throw Error('Parent procedural planting sequence drift at '+coordinate(x,z));
  return source;
}

export function verifyProceduralCounts(housesBuilt,olive,cypress) {
  if(housesBuilt!==houses.size||olive!==treeCounts.olive||cypress!==treeCounts.cypress)
    throw Error('Parent procedural counts drifted before the north layout');
}

export function seatRetainedDetails(rows,formerHeight,currentHeight) {
  return rows.map(row=>{
    if(!touchesTerrain(row.x,row.z))return row;
    const before=formerHeight(row.x,row.z),after=currentHeight(row.x,row.z);
    return Number.isFinite(before)&&Number.isFinite(after)?{...row,y:row.y+after-before}:row;
  });
}

export function detailCuts(bounds,axis) {
  return profiles.filter(p=>intersects(bounds,grow(p,p.feather))).flatMap(p=>axis===0?[p.west,p.east]:[p.south,p.north]);
}

export function grade(x,z,original) {
  if(x<design.minimumTerrainX||z<design.minimumTerrainZ)return null;
  let y=original,used=false;
  // General square grade followed by the smaller, measured building and counter seats.
  for(const p of profiles){
    const d=distance(x,z,p);
    if(d>=p.feather)continue;
    const target=p.earth+(p.riseX??0)*(x-(p.west+p.east)/2)+(p.riseZ??0)*(z-(p.south+p.north)/2);
    if(p.foundation&&d===0)return target;
    const westBlend=p===profiles[0]&&z<81?smooth((x+119)/5):1;
    y+=(target-y)*smooth(1-d/p.feather)*westBlend;used||=westBlend>0;
  }
  for(const [i,ramp] of ramps.entries()){
    if(distance(x,z,rampAreas[i])>0)continue;
    let nearest=Infinity,level=0;
    for(const [j,b] of ramp.points.slice(1).entries()){
      const a=ramp.points[j],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
      const d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
      if(d<nearest){nearest=d;level=a[2]+(b[2]-a[2])*t;}
    }
    const protectedWest=z<82?smooth((x+119.3)/.8):smooth((x+128)/1.3);
    const weight=smooth((ramp.width/2+ramp.feather-nearest)/ramp.feather)*protectedWest;
    y+=(level-y)*weight;used||=weight>0;
  }
  return used?y:null;
}

export function relocate(root) {
  const site=landmarks.get(root?.metadata?.id);
  if(!site)return root;
  const original=root.position.asArray();
  if(original.some((v,i)=>Math.abs(v-site.from[i])>.035))throw Error('Re-survey north landmark '+site.id+' '+original);
  const members=[root,...root.getChildMeshes()],frozen=members.map(m=>m.isWorldMatrixFrozen);
  members.forEach(m=>m.unfreezeWorldMatrix());
  root.position.set(...site.to);root.rotation.y=site.yaw;
  root.metadata={...root.metadata,anchor:{...root.metadata.anchor,x:site.to[0],z:site.to[2],rotation:site.yaw},
    northAgora:{from:original,to:site.to,retainedModel:true}};
  members.forEach((m,i)=>{m.computeWorldMatrix(true);if(frozen[i])m.freezeWorldMatrix();});
  return root;
}

export function keepHome(spec) {
  return !design.vacatedHomes.includes(spec.id);
}

export function paintedChecks(rows,height) {
  const site=landmarks.get('painted-stoa');
  const [dx,,dz]=site.to.map((p,i)=>p-site.from[i]);
  return rows.map(row=>{
    const x=row.x+dx,z=row.z+dz;
    return {...row,x,z,floor:site.to[1],bed:site.to[1]-.06,original:height(x,z),actual:null,restored:null};
  });
}

export function marketSite(site) {
  const station=stalls.get(site.id);
  if(!station)return site;
  if(Math.hypot(station.from[0]-site.x,station.from[1]-site.z)>.002)throw Error('Re-survey market counter '+site.id);
  const [x,z]=station.to;
  return {...site,x,z,buyerX:x,buyerZ:z-2.15,yaw:Math.PI};
}

export function originalMarketSites(sites) {
  return sites.map(site=>{
    const station=stalls.get(site.id);
    return station?{...site,x:station.from[0],z:station.from[1]}:site;
  });
}

export function zone(zone) {
  const arranged=design.zones[zone.id];
  const result={...zone};
  if(arranged)for(const [key,positions] of Object.entries(arranged)){
    if(zone[key].length!==positions.length)throw Error('Changed Agora source count '+zone.id+' '+key);
    result[key]=zone[key].map((item,i)=>{
      const at=positions[i];
      return at?{...item,x:at[0],z:at[1],
        ...(key==='trees'?{agoraOriginalAnchor:item.agoraOriginalAnchor??{x:item.x,z:item.z}}:{})}:item;
    });
  }
  result.stalls=zone.stalls.map(stall=>{
    const station=design.stalls.find(s=>Math.hypot(stall.x-s.from[0],stall.z-s.from[1])<.002);
    return station?{...stall,x:station.to[0],z:station.to[1],yaw:Math.PI}:stall;
  });
  return result;
}

export function actorStops(id,rows) {
  const waypoints=design.actors[id];
  if(!waypoints)return rows;
  if(rows.length!==waypoints.length)throw Error('Changed market worker routine '+id);
  return rows.map((row,i)=>{
    const [x,z,yaw]=waypoints[i];
    return {...row,x,z,yaw:yaw??row.yaw};
  });
}

export function clothBinding() {
  const [x,z]=stalls.get('cloth').to;
  return {anchor:{x,y:0,z},floorRange:null,bounds:{west:x-4,east:x+4,south:z-4.2,north:z+3.5}};
}

export function addRoutes(routes) {
  return [...routes,...design.walks.map(row=>({...row,type:'path',role:'civic'}))];
}

export function footprints(rows) {
  const centre={id:'agora-open-gathering-ground',x:(square.west+square.east)/2,z:(square.south+square.north)/2,
    w:square.east-square.west,d:square.north-square.south,rotation:0};
  return [...rows.map(row=>{
    const site=landmarks.get(String(row.id).replace(/^agora:/,''));
    if(!site)return row;
    return {...row,x:site.to[0],z:site.to[2],rotation:site.yaw};
  }),centre];
}

export function artisanLot(spec) {
  const plot=design.artisanLots[spec.id];
  if(!plot)return spec;
  if(Math.hypot(spec.x-plot.from[0],spec.z-plot.from[1])>.005)throw Error('Re-survey authored cloth lot '+spec.id);
  return {...spec,x:plot.to[0],z:plot.to[1]};
}

export function clothCourt(build,parent,height) {
  const [dx,dz]=design.clothOffset;
  const yard=build(parent,(x,z)=>height(x+dx,z+dz));
  if(yard.name!=='ClothWorkingCourt')throw Error('Missing native cloth work court');
  yard.position.x+=dx;yard.position.z+=dz;yard.updateWorldMatrix(true,true);
  return yard;
}

export function serviceRoute(route) {
  const points={
    'cloth-court-way':[[-115.4,139.2],[-116,142],[-107,140],[-102,147],[-91,151],[-85,147],[-80.5,143],[-73,138.5]],
    'cloth-market-link':[[-91,151],[-85,147],[-80.5,143],[-79,136],[-76.5,128],[-78,118],[-70,112]],
    'cloth-potters-link':[[-165,66],[-158,60],[-149,60],[-139,60],[-139,66],[-116,64],[-116,84],[-120,98],[-128,126.5],[-125,143],[-116,142]],
  }[route.id];
  return points?{...route,points}:route;
}

export function woolHeight(height) {
  const [dx,dz]=design.woolOffset;
  return (x,z)=>height(x+dx,z+dz);
}

export function woolMetadata(root,metadata) {
  const [dx,dz]=design.woolOffset;
  const bounds=b=>({west:b.west+dx,east:b.east+dx,south:b.south+dz,north:b.north+dz});
  const point=p=>p?.x===undefined?p:{...p,x:p.x+dx,z:p.z+dz};
  const terrain=metadata.terrain;
  Object.assign(metadata,{bounds:bounds(metadata.bounds),workingBounds:bounds(metadata.workingBounds),serviceAisle:bounds(metadata.serviceAisle),
    entry:{...metadata.entry,points:metadata.entry.points.map(([x,z])=>[x+dx,z+dz])},
    terrain:{...terrain,samples:terrain.samples.map(point),propDatums:terrain.propDatums.map(row=>({...point(row),samples:row.samples?.map(point)}))},
    stations:metadata.stations.map(point),props:metadata.props.map(point),
    rounds:metadata.rounds.map(row=>({...row,stops:row.stops.map(point)}))});
  const meshes=[root,...root.getChildMeshes()],frozen=meshes.map(m=>m.isWorldMatrixFrozen);
  meshes.forEach(m=>m.unfreezeWorldMatrix());
  root.position.x+=dx;root.position.z+=dz;
  meshes.forEach((m,i)=>{m.computeWorldMatrix(true);if(frozen[i])m.freezeWorldMatrix();});
  return metadata;
}

export function woolCollision(target,triangle) {
  const [dx,dz]=design.woolOffset,move=([x,y,z])=>[x+dx,y,z+dz];
  target.add(move(triangle.a),move(triangle.b),move(triangle.c),triangle.name);
}

const reserved=[design.square,design.stallCourt,...design.landmarks.map(site=>site.bounds),...design.clearPlots];
export function clearFiller(scene,colliders,selected,already) {
  const picks=new Map(selected.map(row=>[row.id,row]));
  const earlier=new Set(already.map(row=>row.id));
  const cleared=new Set((scene.metadata?.zeusSiteClearance?.houses??[]).map(row=>row.name));
  for(const row of colliders){
    const name=/^redesign-house-(\d+)$/.exec(row.name);
    if(!name||cleared.has(row.name)||earlier.has(+name[1])||picks.has(+name[1]))continue;
    const c=Math.abs(Math.cos(row.rotY??0)),s=Math.abs(Math.sin(row.rotY??0));
    const x=(row.w*c+row.d*s)/2,z=(row.w*s+row.d*c)/2;
    const b={west:row.cx-x,east:row.cx+x,south:row.cz-z,north:row.cz+z};
    if(reserved.some(area=>intersects(grow(area,.35),b)))picks.set(+name[1],{id:+name[1],x:row.cx,z:row.cz});
  }
  if(picks.size-selected.length>32)throw Error('Re-survey unexpected north square house clearance');
  return [...picks.values()];
}

const open=[design.gathering,design.stallCourt,...design.landmarks.map(s=>s.bounds),...design.clearPlots];
const free=(x,z)=>open.every(b=>distance(x,z,b)>.48)&&
  design.walks.every(path=>path.points.slice(1).every((b,i)=>{
    const a=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const f=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
    return Math.hypot(x-a[0]-f*dx,z-a[1]-f*dz)>path.width*.5+.8;
  }));

function edgePosition(x,z,occupied=[]) {
  const pool=design.edgePlanting.filter(([a,b])=>free(a,b)&&occupied.every(([p,q])=>Math.hypot(p-a,q-b)>1.65));
  return pool.sort(([a,b],[p,q])=>Math.hypot(a-x,b-z)-Math.hypot(p-x,q-z))[0];
}

export function ornaments(rows) {
  const used=[];
  return rows.map(row=>{
    if(!open.some(b=>distance(row.x,row.z,b)<.6))return row;
    const at=edgePosition(row.x,row.z,used);
    if(!at)return null;
    used.push(at);
    return {...row,x:at[0],z:at[1]};
  }).filter(Boolean);
}

export function plantContact(scene,height) {
  const roots=[...scene.meshes,...scene.transformNodes].filter(n=>/^(olive_|cypress_|fig_)/.test(n.name)&&
    n.isEnabled()&&n.getChildMeshes().some(m=>m.getTotalVertices()));
  const names=new Set(roots),whole=roots.filter(n=>{for(let p=n.parent;p;p=p.parent)if(names.has(p))return false;return true;});
  const used=whole.map(root=>{const p=root.getAbsolutePosition();return[p.x,p.z];});
  const moved=[];
  for(const root of whole){
    const p=root.getAbsolutePosition();
    if(!terrainAreas.some(b=>distance(p.x,p.z,b)===0))continue;
    const onSquare=open.some(b=>distance(p.x,p.z,b)<.75);
    const at=onSquare?edgePosition(p.x,p.z,used):[p.x,p.z];
    if(!at)throw Error('No measured planting edge for '+root.name);
    const [x,z]=at,y=height(x,z);
    const low=Math.min(...root.getChildMeshes().filter(m=>m.getTotalVertices()).map(m=>{
      m.computeWorldMatrix(true);return m.getBoundingInfo().boundingBox.minimumWorld.y;
    }));
    if(!Number.isFinite(y)||!Number.isFinite(low))throw Error('Missing Agora plant contact '+root.name);
    if(!onSquare&&Math.abs(low-y)<.10)continue;
    const from=p.asArray(),nodes=[root,...root.getDescendants()],frozen=nodes.map(n=>n.isWorldMatrixFrozen);
    nodes.forEach(n=>n.unfreezeWorldMatrix?.());
    root.setAbsolutePosition(new root.position.constructor(x,p.y+y-low-.045,z));
    nodes.forEach((n,i)=>{n.computeWorldMatrix?.(true);if(frozen[i])n.freezeWorldMatrix?.();});
    if(onSquare)used.push(at);
    moved.push({name:root.name,from,to:root.getAbsolutePosition().asArray()});
  }
  scene.metadata.agoraNorthMarket={moved,openSquare:design.gathering};
}

export function counterSupports(scene) {
  return [...stalls.keys()].map(id=>{
    const roots=scene.meshes.filter(mesh=>/^agora_stall_/.test(mesh.name)&&mesh.metadata?.marketSite?.id===id);
    if(roots.length!==1)throw Error('Missing singular market counter '+id);
    const root=roots[0],p=root.getAbsolutePosition();
    const box=(x,y,z,hx,hy,hz)=>({x,y,z,hx,hy,hz,yaw:0});
    return {x:p.x,y:p.y,z:p.z,yaw:root.rotation.y,range:3,floors:[],
      boxes:[box(0,.46,0,1.39,.46,.48),
        ...[-1.34,1.34].flatMap(x=>[-.52,.52].map(z=>box(x,1.30,z,.058,1.30,.058)))]};
  });
}
