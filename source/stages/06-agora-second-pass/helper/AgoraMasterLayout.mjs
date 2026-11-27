export {siteGradePlan as royalSiteGradePlan,captureSiteHeights as royalCaptureSiteHeights,buildRoyalAccess as royalBuildAccess} from './RoyalStoaAccess.mjs';
export * from './AgoraMasterPlan.mjs';
export {prepareTerrain,finalizeTerrain} from './AgoraMasterTerrain.mjs';
import {AGORA_MASTER_SITES,AGORA_RESERVED,AGORA_AVENUE,COUNCIL_SITE as C} from './AgoraMasterPlan.mjs';
export function preserveWeaverFootingDepth(scene,home,y,computedDepth){
 if(home?.id!=='weavers_court_1')return computedDepth;
 const datum=7.380129375457764,depth=.9831497609456389,report=scene.metadata?.zeusNeighbourSupport;
 if(home.x!==-142||home.z!==120||home.w!==15||home.d!==15||(home.rot??0)!==0||!Number.isFinite(y)||Math.abs(y-datum)>.002||!Number.isFinite(computedDepth)||computedDepth<.45||report?.id!==home.id||report.samples<1)throw Error('Re-survey approved Weaver construction inputs: '+JSON.stringify({home,y,computedDepth,report}));
 const bottom=datum+.08-depth,actualEmbed=report.minRaw-bottom;
 if(!Number.isFinite(actualEmbed)||actualEmbed<.075)throw Error('Preserved Weaver foundation no longer has measured soil embedding');
 scene.metadata.zeusNeighbourSupport={...report,computedCandidateReport:{...report},datum,newDepth:depth,oldBottom:datum+.08-report.oldEffectiveDepth,newBottom:bottom,unchangedTop:datum+.08,onlyExistingBottomExtended:depth>=report.oldEffectiveDepth,sameGeometryAsApprovedParent:true,preservation:{source:'Approved parent495 native side-footing boxes',computedCandidateY:y,computedCandidateDepth:computedDepth,actualConstructedDepth:depth,approvedRootDatum:datum,actualEmbed,rootPinPending:true,localGeometryPreserved:true}};
 return depth;
}
export function relocateArchitecture(root){
 const id=root?.metadata?.id;
 const site=AGORA_MASTER_SITES[id];if(!site)return root;
 if(root.metadata.agoraMasterLayout)throw Error('Agora site transformation applied twice: '+id);
 const at=root.position.asArray();if(at.some((v,i)=>Math.abs(v-site.from[i])>.01))throw Error('Re-survey changed native root: '+id+' '+at);
 const meshes=[root,...root.getChildMeshes()];for(const m of meshes)m.unfreezeWorldMatrix();
 root.position.set(...site.to);root.metadata={...root.metadata,anchor:{...root.metadata.anchor,x:site.to[0],z:site.to[2]},agoraMasterLayout:{from:site.from,to:site.to,modelGeometryPreserved:true,rotationPreserved:true}};
 if(root.metadata.newBouleuterion)root.metadata.newBouleuterion={...root.metadata.newBouleuterion,floorWorld:C.floor};
 if(root.metadata.royalStoa)root.metadata.royalStoa={...root.metadata.royalStoa,mainFloorWorld:site.to[1]+.05};
 for(const m of meshes){m.computeWorldMatrix(true);m.freezeWorldMatrix();}
 const scene=root.getScene();scene.metadata.agoraMasterLayout??={version:1,sites:[],architectureReconstructed:false};scene.metadata.agoraMasterLayout.sites.push({id,...root.metadata.agoraMasterLayout});return root;
}
export function createCouncilAccess(k){
 const floors=[],boxes=[],stone=k.p.marble,origin={x:AGORA_MASTER_SITES['new-council'].to[0],z:AGORA_MASTER_SITES['new-council'].to[2]};
 const box=(name,x,z,w,d,bottom,top)=>{k.box('Agora civic '+name,x-origin.x,(bottom+top)/2,z-origin.z,w,top-bottom,d,stone);boxes.push({x:x-origin.x,y:(bottom+top)/2,z:z-origin.z,hx:w/2,hy:(top-bottom)/2,hz:d/2,yaw:0});floors.push({x:x-origin.x,z:z-origin.z,hx:w/2,hz:d/2,top});};
 box('shared public arrival terrace',(-147.55-143.8)/2,(35.25+57.75)/2,3.75,22.5,1.15,C.floor);
 box('south stair landing ear',-144,35.075,.4,.35,1.15,C.floor);
 box('north stair landing ear',-144,57.925,.4,.35,1.15,C.floor);
 for(const [i,z]of C.doors.entries()){
  const count=8,run=(C.stairEast-C.stairWest)/count,rise=(C.floor-C.low)/count;
  for(let j=0;j<count;j++){const east=C.stairEast-j*run,west=east-run;box((i?'north':'south')+'approach tread '+j,(west+east)/2,z,run+.008,C.stairWidth,1.15,C.low+(j+1)*rise);}
  box((i?'north':'south')+'door landing',C.stairWest-.35,z,.7,C.stairWidth,1.15,C.floor);
 }
 const root=k.finish({id:'agora-council-access',x:origin.x,z:origin.z,w:27,d:27,rotation:0},0,null,['realStoneSteps','councilPublicEntrances']);root.metadata.floorPlanes=floors;root.metadata.collisionBoxes=boxes;
 const ledger=k.scene.metadata?.districtStreaming?.resources;if(!ledger)throw Error('Agora civic access requires native resource owner');
 const id='agora-master-council-access';ledger.register({id,owner:'AgoraMasterLayout',residency:'essential',reason:'Real civic entrance stairs and native collision/support metadata',dependencies:[],validationRoute:'new-council-both-entries'});
 const scope=ledger.scope(id);let closed=false;scope.ownComposite(root,r=>{if(!r.isDisposed())r.dispose(false,false);},[root]);
 const close=()=>{if(closed)return;closed=true;scope.dispose();ledger.unregister(id);};const ro=root.onDisposeObservable.add(close),so=k.scene.onDisposeObservable.add(close);scope.defer(()=>{root.onDisposeObservable.remove(ro);k.scene.onDisposeObservable.remove(so);});scope.defer(()=>ledger.unregister(id));
 k.scene.metadata.agoraMasterLayout.councilAccess={root:root.name,steps:16,doorways:C.doors,floor:C.floor,residencyOwner:id};return root;
}
export function moveClashingTrees(scene,height){
 // This existing scene-finalization hook follows residential construction and
 // precedes both native walking/jumping root snapshots. Civic-only relocation
 // does not see this retained residential workshop.
 const workshops=scene.meshes.filter(m=>!m.isDisposed()&&m.metadata?.architectureVersion===2&&m.metadata.id==='weavers_court_1');
 if(workshops.length!==1)throw Error('Expected one retained Weaver workshop');
 const workshop=workshops[0],wanted=[-142,7.380129375457764,120],from=workshop.position.asArray(),footprint=workshop.metadata.footprint;
 if(Math.abs(from[0]-wanted[0])>1e-8||Math.abs(from[2]-wanted[2])>1e-8||Math.abs(from[1]-wanted[1])>.002||workshop.rotation.asArray().some(v=>Math.abs(v)>1e-8)||footprint?.w!==15||footprint?.d!==15)throw Error('Re-survey retained Weaver workshop before preserving datum');
 const members=[workshop,...workshop.getDescendants()],frozen=members.map(m=>!!m.isWorldMatrixFrozen),render=members.filter(m=>m.getTotalVertices?.()>0),before=render.map(m=>({name:m.name,minY:m.getBoundingInfo().boundingBox.minimumWorld.y}));
 for(const m of members)m.unfreezeWorldMatrix?.();workshop.position.y=wanted[1];
 for(const [i,m]of members.entries()){m.computeWorldMatrix?.(true);if(frozen[i])m.freezeWorldMatrix?.();}
 const delta=wanted[1]-from[1],children=render.map((m,i)=>({name:m.name,beforeMinY:before[i].minY,afterMinY:m.getBoundingInfo().boundingBox.minimumWorld.y}));
 if(children.some(m=>Math.abs(m.afterMinY-m.beforeMinY-delta)>1e-5))throw Error('Retained Weaver visible descendants did not follow exact datum correction');
 workshop.metadata.agoraPreservedDatum={from,to:wanted,delta,children,worldDeltaVerified:true,localGeometryAndSupportPreserved:true};
 scene.metadata.agoraMasterLayout.nativeDatumPreserved=workshop.metadata.agoraPreservedDatum;
 const support=scene.metadata.zeusNeighbourSupport;
 if(!support?.preservation||support.newDepth!==.9831497609456389)throw Error('Retained Weaver footing geometry was not preserved before construction');
 support.preservation.rootPinPending=false;
 const matches=[...scene.meshes,...scene.transformNodes].filter(n=>/olive|fig|cypress|tree|planted/i.test(n.name)&&!n.isDisposed());
 const named=new Set(matches),roots=matches.filter(n=>{for(let p=n.parent;p;p=p.parent)if(named.has(p))return false;return(n.getDescendants?.().length??0)>0;});
 const plan=[];
 for(const root of roots){const p=root.getAbsolutePosition();if(!root.isEnabled())continue;
  const roadHit=AGORA_AVENUE.slice(1).some((b,i)=>{const a=AGORA_AVENUE[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t)<3.9;});
  if(roadHit||AGORA_RESERVED.some(r=>p.x>r.west-.2&&p.x<r.east+.2&&p.z>r.south-.2&&p.z<r.north+.2))plan.push({root,from:p.asArray()});
 }
 // Keep the moved five trees at the public-space edges. A previous private
 // attempt crowded the existing market shade trees into a second dense row.
 for(const [name,x,z]of [['cypress_planted_2',-162,58],['olive_redesign_olive_41',-165.19921875,42.829471588134766]]){
  const candidates=roots.filter(r=>r.name===name);if(candidates.length!==1)throw Error('Re-survey retained Council planting: '+name);
  const root=candidates[0],p=root.getAbsolutePosition();if(Math.hypot(p.x-x,p.z-z)>.01)throw Error('Retained Council planting site changed: '+name);
  if(!plan.some(v=>v.root===root))plan.push({root,from:p.asArray()});
 }
 const destinations=[[-76,47],[-76,58],[-76,76],[-85,23],[-97,22],[-110,21],[-83,35],[-83,45],[-77,89],[-77,99],[-85,110],[-115,112],[-123,112],[-132,113],[-141,110],[-163,62],[-164,53],[-164,33],[-155,31],[-145,23],[-113,20],[-101,20],[-88,20],[-75,69]];
 if(plan.length>destinations.length)throw Error('More Agora plants overlap relocated buildings than surveyed destination capacity');
 const moved=[];
 for(const[item,i]of plan.map((v,i)=>[v,i])){
  const[x,z]=destinations[i],y=height(x,z);
  const plantMeshes=[...(item.root.getTotalVertices?.()>0?[item.root]:[]),...item.root.getChildMeshes()].filter(m=>m.getTotalVertices()>0);
  const bottom=Math.min(...plantMeshes.map(m=>{m.computeWorldMatrix(true);return m.getBoundingInfo().boundingBox.minimumWorld.y;}));
  if(!Number.isFinite(bottom)||!Number.isFinite(y))throw Error('Relocated whole plant requires measured native mesh and real terrain contact');
  const nodes=[item.root,...item.root.getDescendants()];for(const n of nodes)n.unfreezeWorldMatrix?.();
  item.root.setAbsolutePosition(new item.root.position.constructor(x,item.from[1]+y-bottom-.04,z));
  for(const n of nodes){n.computeWorldMatrix?.(true);n.freezeWorldMatrix?.();}
  moved.push({name:item.root.name,from:item.from,to:item.root.getAbsolutePosition().asArray(),wholePlant:true,descendants:nodes.length-1});
 }
 const grounded=[];
 for(const root of roots){if(!root.isEnabled()||moved.some(m=>m.name===root.name))continue;const p=root.getAbsolutePosition();
  const affected=(p.x>=-142&&p.x<=-112.5&&p.z>=55&&p.z<=110)||(p.x>=-176&&p.x<=-138&&p.z>=95&&p.z<=126);
  if(!affected)continue;const members=[...(root.getTotalVertices?.()>0?[root]:[]),...root.getChildMeshes()].filter(m=>m.getTotalVertices()>0);
  const bottom=Math.min(...members.map(m=>{m.computeWorldMatrix(true);return m.getBoundingInfo().boundingBox.minimumWorld.y;})),soil=height(p.x,p.z);
  if(!Number.isFinite(bottom)||!Number.isFinite(soil))throw Error('Affected whole-plant contact cannot be measured');
  if(bottom<=soil+.08)continue;const before=p.asArray(),nodes=[root,...root.getDescendants()];for(const n of nodes)n.unfreezeWorldMatrix?.();
  root.setAbsolutePosition(new root.position.constructor(p.x,p.y+soil-bottom-.04,p.z));for(const n of nodes){n.computeWorldMatrix?.(true);n.freezeWorldMatrix?.();}
  grounded.push({name:root.name,from:before,to:root.getAbsolutePosition().asArray(),previousBottom:bottom,actualSoil:soil,wholePlant:true,xzPreserved:true});
 }
 scene.metadata.agoraMasterLayout.movedTrees=moved;scene.metadata.agoraMasterLayout.groundedTrees=grounded;return moved;
}
