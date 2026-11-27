import design from './CIVIC-SITE.json' with {type:'json'};

export const sites=design.sites;
export const separator=design.separator;
export const court=design.court;
export const templeTerrace=design.templeTerrace;
export const royalTerrace={west:-141.45,east:-132.2,south:130.1,north:147.9,top:7.3};
export const zeusForecourt={west:-135.5,east:-129.2,south:79.1,north:122.9,top:4.65};
export const neighbours=design.relocatedNeighbours;
export const paths=design.paths;
export const steps=[43.4,60.6].flatMap(z=>Array.from({length:5},(_,i)=>({
  west:-137.0-(i+1)*.45,east:-137.0-i*.45,south:z-1.8,north:z+1.8,top:2.45+(i+1)*.15,
})));
export const doorLandings=[43.4,60.6].map(z=>({west:-139.55,east:-139.25,south:z-1.8,north:z+1.8,top:3.2}));
const allSites=new Map(sites.map(site=>[site.id,site]));
const hit=(a,b,margin=0)=>a.west<b.east+margin&&a.east>b.west-margin&&a.south<b.north+margin&&a.north>b.south-margin;
export const contains=(x,z,b)=>x>=b.west&&x<=b.east&&z>=b.south&&z<=b.north;
export const distanceTo=(x,z,b)=>Math.hypot(Math.max(b.west-x,0,x-b.east),Math.max(b.south-z,0,z-b.north));
export const reserved=[...sites.map(s=>s.bounds),...neighbours.map(s=>s.bounds),court,templeTerrace,royalTerrace,zeusForecourt,separator];

export function roadDistance(x,z) {
  let nearest=Infinity;
  const axis=design.protectedRoad;
  for(let i=1;i<axis.length;i++) {
    const a=axis[i-1],b=axis[i];
    if(x<Math.min(a[0],b[0])-12||x>Math.max(a[0],b[0])+12)continue;
    const dx=b[0]-a[0],dz=b[1]-a[1];
    const f=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    nearest=Math.min(nearest,Math.hypot(x-a[0]-f*dx,z-a[1]-f*dz));
  }
  return nearest;
}

export function relocate(root) {
  const site=allSites.get(root?.metadata?.id);
  if(!site)return root;
  const at=root.position.asArray();
  if(at.some((v,i)=>Math.abs(v-site.from[i])>.025)) throw Error('Civic building needs a new placement survey: '+site.id+' '+at.join(','));
  const descendants=[root,...root.getChildMeshes()];
  const frozen=descendants.map(node=>node.isWorldMatrixFrozen);
  descendants.forEach(node=>node.unfreezeWorldMatrix());
  root.position.set(...site.to);root.rotation.y=site.yaw;
  root.metadata={...root.metadata,anchor:{...root.metadata.anchor,x:site.to[0],z:site.to[2],rotation:site.yaw},
    civicStage:{from:at,to:site.to,yaw:site.yaw,existingModel:true}};
  if(root.metadata.newBouleuterion) root.metadata.newBouleuterion={...root.metadata.newBouleuterion,floorWorld:3.2};
  if(root.metadata.royalStoa) root.metadata.royalStoa={...root.metadata.royalStoa,mainFloorWorld:site.to[1]+.05};
  descendants.forEach((node,i)=>{node.computeWorldMatrix(true);if(frozen[i])node.freezeWorldMatrix();});
  return root;
}

export function civicRoutes(previous) {
  return [...previous.filter(route=>!route.id?.includes('new-council')),
    ...paths.map(path=>({...path,type:'path',role:'civic'})),
    ...[43.4,60.6].map(z=>({id:`civic-council-door-${z}`,width:3.6,type:'path',role:'civic',points:[[-125,z],[-137,z],[-139.3,z]]})),
  ];
}

export function remapFootprints(rows) {
  return rows.map(row=>{
    const id=String(row.id).replace(/^agora:/,'').replace(/:pi-\d+$/,'');
    const site=allSites.get(id);
    if(!site)return row;
    const p=site.bounds;
    // The full Zeus outline reserves the wings too. Its actual collision still
    // comes from the native model, whose open portico remains usable.
    return {...row,x:(p.west+p.east)/2,z:(p.south+p.north)/2,w:p.east-p.west,d:p.north-p.south,rotation:0};
  });
}

export function homeSite(spec) {
  const plan=neighbours.find(row=>row.id===spec.id);
  if(!plan)return spec;
  if(Math.hypot(spec.x-plan.from[0],spec.z-plan.from[2])>.001)throw Error('Re-survey moved home '+spec.id);
  return {...spec,x:plan.to[0],z:plan.to[2],civicFloor:plan.to[1]};
}

export function verifyHomes(scene) {
  for(const spec of neighbours) {
    const root=scene.meshes.find(m=>m.metadata?.architectureVersion===2&&m.metadata.id===spec.id);
    if(!root||root.position.asArray().some((v,i)=>Math.abs(v-spec.to[i])>.001))throw Error('Moved home was not built at its fitted address: '+spec.id);
  }
}

export function moveNeighbouringModelsAndTrees(scene,height) {
  const moves=[];
  const oldHeight=scene.getMeshByName('athensCanonicalTerrain').metadata.potteryWestGround.heightAt;
  function move(root,to) {
    const from=root.getAbsolutePosition().asArray();
    const nodes=[root,...root.getDescendants()];
    const frozen=nodes.map(node=>node.isWorldMatrixFrozen);
    nodes.forEach(node=>node.unfreezeWorldMatrix());
    root.setAbsolutePosition(new root.position.constructor(...to));
    nodes.forEach((node,i)=>{node.computeWorldMatrix(true);if(frozen[i])node.freezeWorldMatrix();});
    moves.push({name:root.name,from,to});
  }
  const treeShapes=[...sites.map(s=>s.bounds),...neighbours.map(s=>s.bounds),court,royalTerrace,zeusForecourt];
  const treeNodes=[...scene.meshes,...scene.transformNodes].filter(node=>/^(olive_|cypress_)/.test(node.name)&&node.isEnabled()&&node.getChildMeshes().length);
  const blocked=(x,z)=>treeShapes.some(b=>distanceTo(x,z,b)<.9)||x>-171&&x<-167&&z>52&&z<149;
  const empty=[[-158,66],[-160,88],[-157,110],[-157,120],[-152,152],[-129,152],[-123,140],[-156,130],[-120,104],[-112,85],[-205,126],[-227,116],[-194,137],[-148,127],[-121,111],[-201,124],[-226,142],[-193,146]];
  const occupied=treeNodes.filter(r=>{const p=r.getAbsolutePosition();return !blocked(p.x,p.z);}).map(r=>r.getAbsolutePosition().asArray());
  for(const root of treeNodes) {
    const p=root.getAbsolutePosition();
    const collision=blocked(p.x,p.z);
    if(!collision&&Math.abs(height(p.x,p.z)-oldHeight(p.x,p.z))<.07)continue;
    const at=collision?empty.filter(([x,z])=>!blocked(x,z)&&occupied.every(([a,,b])=>Math.hypot(a-x,b-z)>2.3))
      .sort((a,b)=>Math.hypot(a[0]-p.x,a[1]-p.z)-Math.hypot(b[0]-p.x,b[1]-p.z))[0]:[p.x,p.z];
    if(!at)throw Error('No unoccupied civic planting edge for '+root.name);
    const [x,z]=at,y=height(x,z);
    const bottom=Math.min(...root.getChildMeshes().filter(m=>m.getTotalVertices()).map(mesh=>{
      mesh.computeWorldMatrix(true);return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
    }));
    if(!Number.isFinite(bottom)||!Number.isFinite(y))throw Error('Missing real soil for '+root.name);
    const to=[x,p.y+y-bottom-.04,z];
    if(collision||Math.abs(y-bottom-.04)>.07)move(root,to);
    if(collision)occupied.push(to);
  }
  scene.metadata.agoraCivicStage={plantMoves:moves,homes:neighbours};
}

const ornamentClearance=[...sites.map(s=>s.bounds),...neighbours.map(s=>s.bounds),court,royalTerrace,zeusForecourt];
const withinWorkshop=(x,z)=>x<=-173&&z<=107;
function freeOrnamentPosition(x,z,radius) {
  return !withinWorkshop(x,z)&&!(z>=22&&z<=39&&roadDistance(x,z)<6.4)&&
    !(Math.abs(x+169)<2.35&&z>=48&&z<=149)&&ornamentClearance.every(shape=>distanceTo(x,z,shape)>radius);
}
export function moveLooseOrnaments(rows) {
  return rows.map(row=>{
    if(withinWorkshop(row.x,row.z)||freeOrnamentPosition(row.x,row.z,.6)||
      !(ornamentClearance.some(box=>distanceTo(row.x,row.z,box)<.6)||Math.abs(row.x+169)<2.35&&row.z>=48&&row.z<=149))return row;
    for(const radius of [1.4,2.8,4.6,6.2,8,10,13,17])for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4]) {
      const x=row.x+radius*Math.cos(heading),z=row.z+radius*Math.sin(heading);
      if(z<151&&freeOrnamentPosition(x,z,.85))return {...row,x,z};
    }
    throw Error('No clear ground for civic scenery at '+row.x+','+row.z);
  });
}
export function sceneryHeight(scene,original,x,z) {
  if(withinWorkshop(x,z))return original(x,z);
  const terrain=scene.getMeshByName('athensCanonicalTerrain').metadata;
  const fitted=terrain.civicStageGround.heightAt(x,z);
  return Math.abs(fitted-terrain.potteryWestGround.heightAt(x,z))>.015?fitted:original(x,z);
}
export function rebindSmallDetails(scene,original,rows) {
  const moved=moveLooseOrnaments(rows);
  return moved.map((row,i)=>{
    const former=rows[i],before=original(former.x,former.z),after=sceneryHeight(scene,original,row.x,row.z);
    if(!Number.isFinite(before)||!Number.isFinite(after))return former;
    if(row===former&&before===after)return former;
    return {...row,y:former.y+after-before};
  });
}

const temenosOffset=[-83.7,4.7,44];
export function moveTemenos(scene) {
  const wall=scene.getMeshByName('redesignHephaisteionTemenos');
  if(!wall||wall.isDisposed()) throw Error('Missing original Temple enclosure wall');
  wall.unfreezeWorldMatrix();
  wall.position.addInPlace(new wall.position.constructor(...temenosOffset));
  wall.computeWorldMatrix(true);wall.freezeWorldMatrix();
}

export function moveTemenosCollider(collider) {
  if(collider?.name!=='hephaisteion-temenos-wall')return collider;
  if(Math.abs(collider.cx+139.8)>.01)throw Error('Re-survey original Temple enclosure colliders');
  return {...collider,cx:collider.cx+temenosOffset[0],yBottom:collider.yBottom+temenosOffset[1],cz:collider.cz+temenosOffset[2]};
}

export function selectFillerHouses(scene,colliders,previous,earlier) {
  const occupied=new Set(earlier.map(row=>row.id));
  const cutByZeus=new Set((scene.metadata?.zeusSiteClearance?.houses??[]).map(row=>row.name));
  const picks=new Map(previous.filter(row=>!occupied.has(row.id)).map(row=>[row.id,row]));
  for(const row of colliders) {
    const match=/^redesign-house-(\d+)$/.exec(row.name);
    if(!match||occupied.has(Number(match[1]))||cutByZeus.has(row.name))continue;
    const co=Math.abs(Math.cos(row.rotY??0)),si=Math.abs(Math.sin(row.rotY??0));
    const w=(row.w*co+row.d*si)/2,d=(row.w*si+row.d*co)/2;
    const box={west:row.cx-w,east:row.cx+w,south:row.cz-d,north:row.cz+d};
    if(!reserved.some(p=>hit(p,box,.25)))continue;
    if(row.cx<-230||row.cx>-114||row.cz<9||row.cz>156)throw Error('Civic clearing selection left reviewed zone');
    const id=Number(match[1]);picks.set(id,{id,x:row.cx,z:row.cz});
  }
  return [...picks.values()];
}

export function civicWalks(original) {
  const shiftById={royal:[21,29],zeus:[-17.4215,18]};
  const rows=original.filter(row=>row.id!=='agora-west-civic').map(row=>{
    const name=Object.keys(shiftById).find(id=>row.id?.includes(id));
    if(!name)return row;
    const [x,z]=shiftById[name];
    return {...row,points:row.points.map(p=>[p[0]+x,p[1]+z,...p.slice(2)])};
  });
  return [...rows,...paths.map(p=>({...p,type:'path',role:'civic'}))];
}

function accessBuilder(builder,origin,actual,material) {
  const collisionBoxes=[],floorPlanes=[],pieces=[];
  function solid(id,rect,stone=material) {
    const {west,east,south,north,top}=rect;
    const x=(west+east)/2,z=(south+north)/2,w=east-west,d=north-south;
    const sampled=[[west,south],[east,south],[west,north],[east,north],[x,z]].map(([px,pz])=>actual(px,pz));
    if(sampled.some(y=>!Number.isFinite(y)))throw Error('Civic stone needs actual terrain at '+id);
    const bottom=Math.min(top-.19,Math.min(...sampled)-.12);
    builder.box(id,x-origin.x,(bottom+top)/2,z-origin.z,w,top-bottom,d,stone);
    collisionBoxes.push({x:x-origin.x,y:(bottom+top)/2,z:z-origin.z,hx:w/2,hy:(top-bottom)/2,hz:d/2,yaw:0});
    floorPlanes.push({x:x-origin.x,z:z-origin.z,hx:w/2,hz:d/2,top});
    pieces.push({id,...rect,bottom});
  }
  function finish(id,w,d,features) {
    const root=builder.finish({id,x:origin.x,z:origin.z,w,d,rotation:0},0,null,features);
    Object.assign(root.metadata,{collisionBoxes,floorPlanes,civicStageAccess:pieces});
    return root;
  }
  return {solid,finish,pieces};
}

export function buildRoyalAccess(k,_geometry,{stone,tread,paving},actual,captured,details) {
  const origin={x:-145,z:139};
  const access=accessBuilder(k,origin,actual,paving);
  access.solid('Royal civic front platform',royalTerrace);
  access.solid('Royal pale front edge',{west:royalTerrace.east,east:royalTerrace.east+.22,south:royalTerrace.south,north:royalTerrace.north,top:7.24},tread);
  const root=access.finish('zeus-site-access',13,20,['Royal public terrace','fitted stone and native support']);
  return {root,report:{...details,version:5,royalCentre:origin,floor:royalTerrace.top,originalProbe:captured.originalProbe,
    forecourt:access.pieces,bounds:royalTerrace,collisionBoxes:root.metadata.collisionBoxes.length,floorPlanes:root.metadata.floorPlanes.length}};
}

export function captureRoyal(height) {
  return {originalProbe:height(-145,139)};
}

export function updateConstructionChecks(diagnostics,original) {
  const former=diagnostics.seatingProbes;
  const protectedPainted=former.filter(row=>row.padId==='agora-painted-stoa-relocated-floor');
  if(protectedPainted.length!==5)throw Error('Missing retained Painted Stoa seating checks');
  const sample=(site,x,z)=>({padId:site.id,x,z,floor:site.to[1],bed:site.to[1]-.06,original:original(x,z),actual:null,restored:null});
  const moved=sites.flatMap(site=>{
    const {west,east,south,north}=site.bounds;
    return [[(west+east)/2,(south+north)/2],[west+.65,south+.65],[east-.65,south+.65],
      [west+.65,north-.65],[east-.65,north-.65]].map(([x,z])=>sample(site,x,z));
  });
  diagnostics.formerSites={probe:diagnostics.probe,seatingProbes:former.filter(row=>!protectedPainted.includes(row))};
  diagnostics.probe=sample(allSites.get('royal-stoa'),-145,139);
  diagnostics.seatingProbes=[...protectedPainted,...moved];
}

export function buildCouncilAccess(k,actual) {
  const access=accessBuilder(k,{x:-148,z:52},actual,k.p.marble);
  // The clear court stays level under both approaches. The higher treads
  // start beyond the lower court floor and end flush to each native door.
  access.solid('Shared civic court',court,k.p.pavement??k.p.marble);
  steps.forEach((rect,i)=>access.solid('Council public stair '+(i+1),rect));
  doorLandings.forEach(rect=>access.solid('Council threshold landing',rect));
  const root=access.finish('agora-council-access',25,24,['Shared public forecourt','Two real entrance flights']);
  const ledger=k.scene.metadata?.districtStreaming?.resources;
  if(!ledger)throw Error('Civic court needs the native resource owner');
  const id='agora-master-council-access';
  ledger.register({id,owner:'CivicSite',residency:'essential',reason:'Shared public square and two native Council approaches',dependencies:[],validationRoute:'new-council-both-entries'});
  const scope=ledger.scope(id);
  let closed=false;
  scope.ownComposite(root,r=>{if(!r.isDisposed())r.dispose(false,false);},[root]);
  const close=()=>{if(closed)return;closed=true;scope.dispose();ledger.unregister(id);};
  const ro=root.onDisposeObservable.add(close),so=k.scene.onDisposeObservable.add(close);
  scope.defer(()=>root.onDisposeObservable.remove(ro));scope.defer(()=>k.scene.onDisposeObservable.remove(so));scope.defer(()=>ledger.unregister(id));
  k.scene.metadata.agoraMasterLayout.councilAccess={root:root.name,steps:steps.length,doorways:[43.4,60.6],floor:3.2,residencyOwner:id};
  return root;
}
