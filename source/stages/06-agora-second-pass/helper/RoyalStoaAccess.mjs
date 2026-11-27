/** Pure NW Royal access candidate. Existing finishZeusSite remains the only
 * original-height handoff, material and residency owner. No SDK or observer. */
const F=7.8,LOW=7.34143518447876;
const freeze=Object.freeze,rect=(west,east,south,north)=>freeze({west,east,south,north});
export const ROYAL_ACCESS=freeze({
 origin:freeze({x:-166,z:110}),floor:F,mainFloor:F+.05,
 body:rect(-169.59,-162.41,101.14,118.86),
 frontPlatform:rect(-162.41,-158.2,101.14,118.4),
 eastStrip:rect(-158.2,-153,101.14,118.4),
 eastLowLanding:freeze({...rect(-140,-139.4,102.25,105.75),top:LOW}),
 eastArrival:freeze({id:'Royal east civic arrival',startX:-140,endX:-153,z:104,width:3.5,startY:LOW,endY:F,count:3}),
 pedestrianFlight:freeze({id:'Royal low civic stone approach',x:-138,width:1.5,startZ:82,endZ:104,startY:2.4,endY:LOW,count:26}),
 civicLowLanding:freeze({...rect(-138.75,-137.25,81.3,82),top:2.4}),
 civicHighTransfer:freeze({...rect(-140,-137.25,104,105.75),top:LOW}),
 northWalk:freeze({...rect(-156.9,-154.1,118.4,123),top:F}),
 northNativeArrival:freeze({x:-155.5,z:123}),
 westWallX:-170,northWallZ:119.6,northOpening:freeze({west:-158.2,east:-153}),
 influence:rect(-176,-137,96,126.5),
});
const eastTreads=()=>{const s=ROYAL_ACCESS.eastArrival,run=(s.startX-s.endX)/s.count,rise=(s.endY-s.startY)/s.count;return Array.from({length:s.count},(_,i)=>({id:s.id+' tread '+(i+1),west:s.startX-(i+1)*run,east:s.startX-i*run,south:s.z-s.width/2,north:s.z+s.width/2,top:s.startY+(i+1)*rise,riser:rise,run}));};
const civicTreads=()=>{const s=ROYAL_ACCESS.pedestrianFlight,run=(s.endZ-s.startZ)/s.count,rise=(s.endY-s.startY)/s.count;return Array.from({length:s.count},(_,i)=>({id:s.id+' tread '+(i+1),west:s.x-s.width/2,east:s.x+s.width/2,south:s.startZ+i*run,north:s.startZ+(i+1)*run,top:s.startY+(i+1)*rise,riser:rise,run}));};
const legacyPads=[
 {id:'royal-v2-measured-body',...rect(-132.09,-124.91,85.14,102.86),top:2.4},
 {id:'royal-v2-front-platform',...rect(-124.91,-120.7,85.14,102.4),top:2.4},
 {id:'royal-v2-east-circulation',...rect(-120.7,-117.7,87,102.4),top:2.4},
 {id:'royal-v2-north-transfer',...rect(-125.9,-117.7,102.4,103.1),top:2.4},
 {id:'royal-v2-south-road-transfer',...rect(-125.9,-117.7,83.2,84),top:1.65},
];
const legacyStairs=[
 {id:'royal-v2-south-approach',x:-119.2,halfWidth:1.5,startZ:84,endZ:87,startY:1.65,endY:2.4},
 {id:'royal-v2-north-hill-stair',x:-124,halfWidth:1.9,startZ:103.1,endZ:114,startY:2.4,endY:6.812117551167806},
];
export function siteGradePlan(base){
 if(base?.id!=='zeus-site-royal-terrace-v1'||base.shoulder!==2||base.clearance!==.05)throw Error('NW Royal needs the reviewed native grade base');
 const S=ROYAL_ACCESS,pad=(id,r,top=F)=>freeze({id,...r,top});
 const pads=[pad('royal-v4-NW-body',S.body),pad('royal-v4-NW-front-platform',S.frontPlatform),pad('royal-v4-NW-east-court',S.eastStrip),pad('royal-v4-NW-east-low-arrival',S.eastLowLanding,LOW),pad('royal-v4-NW-north-level-walk',S.northWalk),...eastTreads().map((r,i)=>pad('royal-v4-NW-east-tread-'+i,r,r.top))];
 const protectedPads=[
  {id:'royal-v4-retained-Weaver-1',...rect(-149.56,-134.44,112.17,127.83),top:0},
  {id:'royal-v4-retained-Weaver-2',...rect(-173.06,-154.94,127.67,142.33),top:0},
  {id:'royal-v4-retained-pottery',...rect(-214,-174,60,98),top:0},
 ];
 return freeze({...base,id:'zeus-site-royal-terrace-v4-NW',
  pads:freeze([...base.pads,...legacyPads.map(freeze),...pads]),stairs:freeze([...base.stairs,...legacyStairs.map(freeze)]),
  protectedPads:freeze([...base.protectedPads,...protectedPads.map(freeze)]),
  influenceEnvelopes:freeze([...(base.influenceEnvelopes??[]),freeze({id:'royal-v4-NW-native-contact-ring',...S.influence})]),
  influenceEvidence:base.influenceEvidence+' NW second-pass Royal: retain all prior grade leaves; append natural high-plateau body/court, three broad east-arrival treads and a level north walk. Temple, both Weaver homes and functional pottery stay protected; actual incident triangles must fit the bounded native refinement.',
 });
}
export function captureSiteHeights(height){
 if(typeof height!=='function')throw Error('NW Royal original sampler unavailable');
 const S=ROYAL_ACCESS,sample=(x,z)=>{const y=height(x,z);if(!Number.isFinite(y))throw Error('NW Royal original height missing at '+x+','+z);return y;},wallSamples=[];
 for(let i=0;i<=20;i++){const z=100.8+(S.northWallZ-100.8)*i/20;wallSamples.push({edge:'west',x:S.westWallX,z,originalTop:sample(S.westWallX,z)});}
 for(let i=0;i<=20;i++){const x=S.westWallX+(S.eastStrip.east-S.westWallX)*i/20;wallSamples.push({edge:'north',x,z:S.northWallZ,originalTop:sample(x,S.northWallZ)});}
 const eastLanding=sample(S.eastArrival.startX,S.eastArrival.z),northLanding=sample(S.northNativeArrival.x,S.northNativeArrival.z),originalProbe=sample(S.origin.x,S.origin.z);
 if(Math.abs(eastLanding-LOW)>1e-4)throw Error('NW Royal east public datum changed; re-survey arrival and grade together: '+eastLanding);
 if(Math.abs(northLanding-F)>.1)throw Error('NW Royal north walking tie-in is no longer near-level: '+northLanding);
 return{wallSamples,eastLanding,northLanding,originalProbe,newSite:true,source:'Original native sampler captured at actual NW Royal site',publicArrival:{x:S.eastArrival.startX,z:S.eastArrival.z,originalTop:eastLanding},northNearLevelDifference:northLanding-F};
}
function pedestrianCheekFacing(native,target,G,stone,origin){
 const terrain=native.scene?.getMeshByName('athensCanonicalTerrain');
 if(!terrain)throw Error('Royal stair facing requires the actual native terrain');
 terrain.computeWorldMatrix(true);const matrix=terrain.getWorldMatrix().m;
 if(!matrix||Array.from(matrix).some((v,i)=>Math.abs(v-([0,5,10,15].includes(i)?1:0))>1e-7))throw Error('Royal stair facing requires identity-world native terrain');
 const p=terrain.getVerticesData('position'),ix=terrain.getIndices();
 if(!p?.length||!ix?.length||p.length%3||ix.length%3)throw Error('Royal stair facing needs native indexed terrain');
 const bounds={west:-139.025,east:-138.75,south:82,north:104},offset=.004,data=G.data();let selected=0,emitted=0,area=0;
 const clip=(poly,axis,edge,sign)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}return out;};
 for(let i=0;i<ix.length;i+=3){
  const tri=[ix[i],ix[i+1],ix[i+2]].map(n=>[p[n*3],p[n*3+1],p[n*3+2]]);
  if(Math.max(...tri.map(v=>v[0]))<=bounds.west||Math.min(...tri.map(v=>v[0]))>=bounds.east||Math.max(...tri.map(v=>v[2]))<=bounds.south||Math.min(...tri.map(v=>v[2]))>=bounds.north)continue;
  const a=tri[1].map((v,j)=>v-tri[0][j]),b=tri[2].map((v,j)=>v-tri[0][j]);let n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);if(length<1e-10)continue;n=n.map(v=>v/length);if(n[1]<0)n=n.map(v=>-v);
  // This is the steep WEST soil cheek facing east into the new flight.
  // Horizontal ground, stone treads and the existing wall are never selected.
  if(n[0]<.70||n[1]>.55)continue;
  let poly=tri;for(const[axis,edge,sign]of[[0,bounds.west,1],[0,bounds.east,-1],[2,bounds.south,1],[2,bounds.north,-1]]){poly=clip(poly,axis,edge,sign);if(poly.length<3)break;}if(poly.length<3)continue;
  let polygonArea=0;for(let j=1;j<poly.length-1;j++){const u=poly[j].map((v,q)=>v-poly[0][q]),v=poly[j+1].map((v,q)=>v-poly[0][q]);polygonArea+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}if(polygonArea<1e-8)continue;
  selected++;area+=polygonArea;const start=data.p.length/3;
  const points=poly.map(v=>{if(!v.every(Number.isFinite))throw Error('Nonfinite Royal stair cheek');return[v[0]+n[0]*offset-origin.x,v[1]+n[1]*offset,v[2]+n[2]*offset-origin.z];});
  // Reuse the architectural helper's CLOCKWISE front-face convention. Native
  // terrain index order is not a substitute for this material's front faces.
  const beforeIndices=data.ix.length;G.polygon(data,points,n,1,1);
  for(let j=start;j<data.p.length/3;j++){data.uv[j*2]=(data.p[j*3+2]+origin.z)/1.25;data.uv[j*2+1]=data.p[j*3+1]/.75;}
  emitted+=(data.ix.length-beforeIndices)/3;
  if(selected>8192||emitted>16384||area>160)throw Error('Royal stair cheek selection exceeded its narrow native-surface guard');
 }
 if(!selected||!emitted)throw Error('Royal stair cheek found no drawable steep native backing; inspect actual contact before accepting');
 G.mesh(target,'Royal stair / native-backed west cheek stone facing',data,stone);
 return{owner:'RoyalStoaAccess pedestrian cheek',nativeMesh:terrain.name,bounds,selectedNativeTriangles:selected,emittedTriangles:emitted,vertices:data.p.length/3,surfaceArea:area,normalOffset:offset,uv:'World Z/1.25 and world Y/.75',nativeArchitecturalClockwiseFaces:true,actualTerrainBacked:true,steepEastFacingOnly:true,existingCollectorStoneMaterial:true,newPhysics:false,newHeightService:false,newMaterials:0,newObservers:0};
}
function collector(native,G){
 const groups=new Map();let pieces=0,vertices=0,triangles=0,flushed=false;
 const builder={box(name,x,y,z,w,h,d,material){if(flushed)throw Error('NW Royal collector already flushed');const a={};return{name,setVerticesData(kind,values){a[kind]=values;},setIndices(values){a.indices=values;},refreshBoundingInfo(){
  const p=a.position,n=a.normal,uv=a.uv,c=a.color,ix=a.indices;if(!p||!n||!uv||!c||!ix||p.length%3||n.length!==p.length||uv.length!==p.length/3*2||c.length!==p.length/3*4)throw Error('Incomplete NW Royal geometry');let d=groups.get(material);if(!d){d=G.data();groups.set(material,d);}const offset=d.p.length/3;
  for(const[dest,source]of[[d.p,p],[d.n,n],[d.uv,uv],[d.c,c]])for(const value of source){if(!Number.isFinite(value))throw Error('Nonfinite NW Royal geometry');dest.push(value);}for(const value of ix){if(!Number.isInteger(value)||value<0||value>=p.length/3)throw Error('Invalid NW Royal index');d.ix.push(value+offset);}pieces++;vertices+=p.length/3;triangles+=ix.length/3;for(const key of Object.keys(a))delete a[key];
 }};}};
 return{builder,flush(){if(flushed)throw Error('NW Royal collector flushed twice');flushed=true;const meshes=groups.size;for(const[material,data]of groups)G.mesh(native,'Royal NW site / '+material.name,data,material);groups.clear();return{pieces,vertices,triangles,meshes,stagingReleased:true,allAttributesPreserved:true};}};
}
export function buildRoyalAccess(k,G,materials,actual,captured,details={}){
 const S=ROYAL_ACCESS,{stone,tread,paving}=materials,{wallSamples,northLanding,originalProbe,eastLanding}=captured??{};
 if(!stone||!tread||!paving||!Array.isArray(wallSamples)||!Number.isFinite(northLanding)||Math.abs(eastLanding-LOW)>1e-4)throw Error('NW Royal access inputs incomplete');
 const batch=collector(k,G),floors=[],boxes=[],steps=[],walls=[],slabs=[],stairs=[],origin=S.origin;
 const sample=(x,z)=>{const y=actual(x,z);if(!Number.isFinite(y))throw Error('NW Royal graded terrain missing at '+x+','+z);return y;};
 const floor=(x,z,w,d,top,id)=>{floors.push({x:x-origin.x,z:z-origin.z,hx:w/2,hz:d/2,top});return{id,x,z,w,d,top};};
 const block=(id,material,x,z,w,d,bottom,top,solid=false)=>{if(![x,z,w,d,bottom,top].every(Number.isFinite)||w<=0||d<=0||top<=bottom)throw Error('Invalid NW Royal block: '+id);G.bevel(batch.builder,'Royal NW site '+id,material,x-origin.x,(bottom+top)/2,z-origin.z,w,top-bottom,d,.01);if(solid)boxes.push({x:x-origin.x,y:(bottom+top)/2,z:z-origin.z,hx:w/2,hy:(top-bottom)/2,hz:d/2,yaw:0});};
 const seatedBottom=(r,top)=>Math.min(top-.28,sample(r.west,r.south)-.10,sample(r.east,r.south)-.10,sample(r.west,r.north)-.10,sample(r.east,r.north)-.10);
 const slab=(id,r,top=F,material=paving)=>{const x=(r.west+r.east)/2,z=(r.south+r.north)/2,w=r.east-r.west,d=r.north-r.south;block(id,material,x,z,w,d,seatedBottom(r,top),top,true);const result=floor(x,z,w,d,top,id);slabs.push(result);return result;};
 const forecourt=[slab('front platform',S.frontPlatform),slab('east civic court',S.eastStrip),slab('north level walk',S.northWalk)];
 // The new northward stone flight is physical geometry plus native support.
 // Its tightly bounded soil cap is owned by MasterTerrain.finalizeTerrain;
 // do not append these pads/stairs to the older two-metre-feather grade plan.
 const pedestrianLowLanding=slab('low civic flight landing',S.civicLowLanding,S.civicLowLanding.top);
 for(const r of civicTreads()){const step=slab(r.id,r,r.top,tread);steps.push({...step,riser:r.riser,run:r.run,from:r.south,to:r.north,axis:'z'});}
 stairs.push({...S.pedestrianFlight,axis:'z',run:(S.pedestrianFlight.endZ-S.pedestrianFlight.startZ)/S.pedestrianFlight.count,rise:(LOW-S.pedestrianFlight.startY)/S.pedestrianFlight.count});
 // Keep the exact union of the old low arrival and the new transfer without
 // overlapping their coplanar northern surfaces. The transfer replaces that
 // northern portion; the southern old arrival remains connected to all three
 // existing broad east-arrival treads.
 const lowArrivalSouth=rect(S.eastLowLanding.west,S.eastLowLanding.east,S.eastLowLanding.south,S.civicHighTransfer.south);
 const southRoadLanding=slab('east low civic arrival south portion',lowArrivalSouth,LOW);
 const pedestrianHighTransfer=slab('high civic flight transfer',S.civicHighTransfer,LOW);
 for(const r of eastTreads()){const step=slab(r.id,r,r.top,tread);steps.push({...step,riser:r.riser,run:r.run,from:r.east,to:r.west,axis:'x'});}
 stairs.push({...S.eastArrival,axis:'x',run:(S.eastArrival.startX-S.eastArrival.endX)/S.eastArrival.count,rise:(F-LOW)/S.eastArrival.count});
 const originalAt=(edge,x,z)=>{const rows=wallSamples.filter(s=>s.edge===edge);if(!rows.length)throw Error('NW Royal retaining provenance missing');return rows.reduce((best,s)=>Math.hypot(s.x-x,s.z-z)<Math.hypot(best.x-x,best.z-z)?s:best).originalTop;};
 const retaining=(edge,a,b)=>{const x=(a.x+b.x)/2,z=(a.z+b.z)/2,w=edge==='west'?.36:Math.abs(b.x-a.x),d=edge==='west'?Math.abs(b.z-a.z):.36,outside=edge==='west'?[[a.x-.25,a.z],[b.x-.25,b.z]]:[[a.x,a.z+.25],[b.x,b.z+.25]],backing=outside.map(([u,v])=>sample(u,v)),top=Math.max(F+.15,...backing)+.07,bottom=Math.min(F-.28,sample(x,z)-.10);block(edge+' retained face',stone,x,z,w,d,bottom,top,true);block(edge+' coping',tread,x,z,w+.04,d+.04,top,top+.10,true);walls.push({edge,x,z,width:w,depth:d,bottom,top:top+.10,originalEndpoints:[originalAt(edge,a.x,a.z),originalAt(edge,b.x,b.z)],actualBacking:backing,actualBackingPoints:outside,originalHeightNotUsedAsUnsupportedWall:true});};
 for(let i=0;i<20;i++)retaining('west',{x:S.westWallX,z:100.8+(S.northWallZ-100.8)*i/20},{x:S.westWallX,z:100.8+(S.northWallZ-100.8)*(i+1)/20});
 const count=Math.ceil(S.northOpening.west-S.westWallX);for(let i=0;i<count;i++)retaining('north',{x:S.westWallX+(S.northOpening.west-S.westWallX)*i/count,z:S.northWallZ},{x:S.westWallX+(S.northOpening.west-S.westWallX)*(i+1)/count,z:S.northWallZ});
 const cheekFacing=pedestrianCheekFacing(k,batch.builder,G,stone,origin);
 const geometry=batch.flush(),root=k.finish({id:'zeus-site-access',x:origin.x,z:origin.z,w:58,d:64,rotation:0},0,null,['RoyalTerraceV4NW','naturalHighPlateauSite','twentySixRealCivicApproachRisers','connectedLowLandingAndHighTransfer','threeBroadEastArrivalRisers','levelNorthWalk','gradedSoilRetainingFaces','nativeBackedStoneStairCheek','staticMaterialBatches']);
 root.metadata.collisionBoxes=boxes;root.metadata.floorPlanes=floors;
 root.metadata.royalStairCheekFacing=cheekFacing;
 const report={cheekFacing,version:4,accessRevision:'continuous-civic-stone-flight-26',owner:'BabylonZeusSite.ts / Royal NW second-pass access',root:root.name,...details,royalCentre:origin,floor:F,mainFloor:S.mainFloor,body:S.body,originalRoyalProbe:originalProbe,actualRoyalProbe:sample(origin.x,origin.z),forecourtBounds:{west:S.frontPlatform.west,east:S.eastStrip.east,south:S.frontPlatform.south,north:S.frontPlatform.north},forecourt,southRoadLanding,eastLowArrivalSupportedUnion:{original:S.eastLowLanding,southPortion:lowArrivalSouth,transfer:S.civicHighTransfer,coplanarOverlapRemoved:true},pedestrianLowLanding,pedestrianHighTransfer,pedestrianFlight:{...S.pedestrianFlight,run:(S.pedestrianFlight.endZ-S.pedestrianFlight.startZ)/S.pedestrianFlight.count,rise:(LOW-S.pedestrianFlight.startY)/S.pedestrianFlight.count,lowNativeTerrain:sample(S.pedestrianFlight.x,S.pedestrianFlight.startZ),stoneGeometry:true,nativeFloorsAndSolids:true,globalFeatheredGradeEntriesAdded:0,requiresBoundedNativeTriangleCap:true},stepCounts:{pedestrianApproach:S.pedestrianFlight.count,broadEastArrival:S.eastArrival.count,total:steps.length},rootFootprint:{w:58,d:64},stairs,steps,walls,retainingOriginalSamples:wallSamples,northLanding:{...S.northNativeArrival,height:northLanding,pavedWalkTop:F,actualNativeDifference:northLanding-F,noFictitiousRisers:true},bounds:{west:S.influence.west,east:S.influence.east,south:S.civicLowLanding.south,north:S.influence.north},gradeInfluenceBounds:S.influence,gradeInfluenceBoundsUnchanged:true,pedestrianAccessBounds:{west:-140,east:-137.25,south:81.3,north:105.75},floorPlanes:floors.length,collisionBoxes:boxes.length,geometry,previousGradeLeavesPreserved:true,newSiteHeightCapturedBeforeOriginalSamplerRelease:true,unchangedSharedMaterials:true,independentOfZeusMaterialLifetime:true,newFrameUpdates:0,newExternalAssets:0,qualityReduction:false,requiresNativeRouteAndCameraQA:true};
 return{root,report};
}
