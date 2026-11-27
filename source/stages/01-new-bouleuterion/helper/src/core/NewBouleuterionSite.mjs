/** SDK-free site/route coordinates for the one New Bouleuterion.
 * This does not change generation rows, terrain, actors or shared road widths.
 * Local +X points south, local +Z east at the existing native pi/2 convention.
 */
export const NEW_BOULEUTERION_SITE=Object.freeze({
  id:'new-council',x:-149,z:49.9,y:1.5,rotation:Math.PI/2,
  foundation:Object.freeze({long:22.5,short:17.5,topWorld:1.40}),
  walls:Object.freeze({long:21.5,short:16.9,thickness:.65}),
  clear:Object.freeze({long:20.2,short:15.6}),floorLocal:.05,floorWorld:1.55,
  eastLaneX:-139.65,eastLaneWidth:1.0,eastAmbulatoryLocalZ:6.9,
  orchestraArrival:Object.freeze({x:0,z:1.1}),
  southEntry:Object.freeze({landingStartX:6.8,landingEndX:10.1,westZ:3.9,eastZ:7.8,
    landingTop:.29,mainTop:.05,firstStepStartX:5.65,firstStepEndX:6.325,secondStepEndX:6.8,
    outerSillTop:.17,outerSillWestZ:8.45,outerSillEastZ:8.75,innerSillWestZ:7.8,innerSillEastZ:8.45}),
  doors:Object.freeze([
    Object.freeze({id:'southeast',x:8.6,z:8.45,width:1.6,worldZ:41.3}),
    Object.freeze({id:'northeast',x:-8.6,z:8.45,width:1.6,worldZ:58.5}),
  ]),
  originalGeneration:Object.freeze({x:-149,z:54,w:14.4,d:6.4,rotation:Math.PI}),
});

const point=(x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z))throw Error('Invalid New Bouleuterion site coordinate');
};
export function newBouleuterionWorld(localX,localZ){
  point(localX,localZ);return[NEW_BOULEUTERION_SITE.x+localZ,NEW_BOULEUTERION_SITE.z-localX];
}
export function newBouleuterionLocal(worldX,worldZ){
  point(worldX,worldZ);return[NEW_BOULEUTERION_SITE.z-worldZ,worldX-NEW_BOULEUTERION_SITE.x];
}

const approachIds=Object.freeze(['council-agora-approach','council-east-walk']);
const upstream=Object.freeze([[-105,36],[-113,36],[-130,29.5],[-142,29.5]].map(Object.freeze));
const join=Object.freeze([-139.65,29.5]);

/** Call once AFTER the existing zeusCivicRoutes adapter. Broad original routes
 * keep their widths and exact upstream point objects. Only their old Council
 * tail is replaced; distinct narrow leaves use the actual gap beside Zeus.
 * All unrelated route objects are returned by identity. No actor route changes.
 */
export function newBouleuterionRoutes(routes){
  if(!Array.isArray(routes))throw Error('New Bouleuterion requires the existing civic route array');
  const found=new Set();
  const result=routes.map(route=>{
    if(!approachIds.includes(route.id))return route;
    if(found.has(route.id))throw Error('Duplicate original council approach: '+route.id);
    found.add(route.id);
    if(!Array.isArray(route.points)||route.points.length<upstream.length||
      upstream.some((p,i)=>!route.points[i]||p[0]!==route.points[i][0]||p[1]!==route.points[i][1]))
      throw Error('Review the existing Zeus-adapted Council approach before changing its tail: '+route.id);
    return{...route,points:[...route.points.slice(0,upstream.length),join]};
  });
  if(found.size!==approachIds.length)throw Error('Both original council approaches must be preserved');
  const leaves=[
    {id:'new-council-east-arrival',width:1.0,type:'path',role:'civic',
      points:[join,[-139.65,41.3]]},
    {id:'new-council-east-through-lane',width:1.0,type:'path',role:'civic',
      points:[[-139.65,41.3],[-139.65,58.5],[-139.65,62.4]]},
    {id:'new-council-southeast-threshold',width:1.0,type:'path',role:'civic',
      points:[[-139.65,41.3],newBouleuterionWorld(8.6,8.45),newBouleuterionWorld(8.6,7.45)]},
    {id:'new-council-northeast-threshold',width:1.0,type:'path',role:'civic',
      points:[[-139.65,58.5],newBouleuterionWorld(-8.6,8.45),newBouleuterionWorld(-8.6,7.45)]},
  ];
  if(routes.some(r=>leaves.some(l=>l.id===r.id)))throw Error('New Council route leaves already exist; do not apply the adapter twice');
  return[...result,...leaves];
}

/** Actual chamber walk reservations, already in world coordinates. These are
 * architectural path descriptors, not a new crowd/actor/height implementation.
 */
export function newBouleuterionInteriorRoutes(){
  const W=newBouleuterionWorld;
  return[
    // Pass the folded leaf ends before turning, then keep east of the clerk
    // stool and roof stations. The final dogleg goes around the real bema.
    {id:'new-council-southeast-public-entry',width:.95,points:[W(8.6,7.45),W(8.6,6.1),W(6.9,6.1),W(6.9,6.9),W(1.8,6.9),W(1.8,1.1),W(0,1.1)]},
    {id:'new-council-northeast-public-entry',width:.95,points:[W(-8.6,7.45),W(-8.6,6.1),W(-6.9,6.1),W(-6.9,6.9),W(1.8,6.9),W(1.8,1.1),W(0,1.1)]},
    ...[-1,1].map(side=>({id:'new-council-west-tier-aisle-'+(side<0?'north':'south'),width:.95,
      points:[W(0,1.1),W(side*1.2,1.1),W(side*1.2,-.5),W(side*1.2,-7.45)]})),
    ...[-1,1].map(side=>({id:'new-council-'+(side<0?'north':'south')+'-tier-aisle',width:.95,
      points:[W(0,1.1),W(0,1.4),W(side*2.8,1.4),W(side*9.775,1.4)]})),
  ];
}

/** Solid local rectangles for the small south arrival correction. Tops are
 * local to rootY1.5. Depths reach the existing actual floor/soil; these must be
 * visible stone/earth solids with matching supports, never invisible planes.
 */
export function newBouleuterionEntrySurfaces(){
 const E=NEW_BOULEUTERION_SITE.southEntry;
 const rect=(id,x0,x1,z0,z1,top,depth)=>({id,x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,d:z1-z0,top,depth,
  local:{west:x0,east:x1,south:z0,north:z1}});
 return[
  rect('south ambulatory first real tread',E.firstStepStartX,E.firstStepEndX,E.westZ,E.eastZ,E.outerSillTop,.12),
  rect('south ambulatory second real tread',E.firstStepEndX,E.secondStepEndX,E.westZ,E.eastZ,E.landingTop,.24),
  rect('south ambulatory solid landing',E.landingStartX,E.landingEndX,E.westZ,E.eastZ,E.landingTop,.24),
  rect('southeast outer worn sill',7.8,9.4,E.outerSillWestZ,E.outerSillEastZ,E.outerSillTop,.17),
  rect('southeast inner supported tread',7.8,9.4,E.innerSillWestZ,E.innerSillEastZ,E.landingTop,.29),
 ];
}

// Post-generation clearance only. Existing coordinate/route exports above are
// deliberately unchanged; the scene and shared tree resources retain ownership.
const councilTreeClearanceStates=new WeakMap();
const councilTreeBounds=Object.freeze({west:-157.45,east:-140.55,south:39.15,north:60.65});
const councilTreeName=name=>/^(?:olive_)?redesign_olive_\d+$/.test(name)||
 /^(?:cypress_)?redesign_cypress_\d+$/.test(name)||
 /^(?:native[-_ ]?fig|fig_native)[-_ ]/i.test(name)||
 /^(?:(?:olive|fig|cypress)_)?agora_(?:tree|fig)_\d+$/.test(name)||
 /^(?:olive|fig|cypress)_planted_\d+$/.test(name);
const councilTreePosition=node=>{
 node.computeWorldMatrix?.(true);const p=node.getAbsolutePosition?.()??node.position;
 if(!p||![p.x,p.y,p.z].every(Number.isFinite))throw Error('Invalid named Council tree anchor: '+node.name);
 return[p.x,p.y,p.z];
};

/** Call at the START of each existing clearZeusRedesign invocation, after its
 * original generators consumed their RNG and before collision capture. Disable
 * only complete named plants with trunk anchors strictly inside the new walls.
 * No canopy-overlap selection, disposal, translation or random generation.
 */
export function clearNewBouleuterionTrees(scene){
 if(!scene||!Array.isArray(scene.meshes))throw Error('Council tree clearance requires the native scene');
 const previous=councilTreeClearanceStates.get(scene),state=previous??{removed:new WeakSet(),report:{
  version:1,owner:'NewBouleuterionSite.mjs',calls:0,bounds:councilTreeBounds,
  boundSemantics:'Strict world X/Z trunk-anchor containment inside above-ground walls; boundary and canopy-only overhangs retained',
  maximumRemovedRoots:8,removed:[],outsideRoots:[],outsideProof:null,
  randomSequenceChanged:false,geometryDisposed:false,materialsDisposed:false,positionsChanged:false,
  action:'Whole named root setEnabled(false); descendants inherit disabled state before native collision capture'}};
 const all=[...new Set([...scene.meshes,...(scene.transformNodes??[])])].filter(n=>
  n&&!n.isDisposed?.()&&councilTreeName(String(n.name??''))&&typeof n.setEnabled==='function');
 const named=new Set(all),roots=all.filter(n=>{for(let p=n.parent;p;p=p.parent)if(named.has(p))return false;return true;});
 const plan=[],outside=[];
 for(const root of roots){
  const children=root.getDescendants?.()??root.getChildMeshes?.()??[];
  // Known constructors create parent roots with descendants. Do not mistake
  // a separately named fig trunk/canopy render mesh for a complete plant.
  if(!children.length)continue;
  const position=councilTreePosition(root),[x,,z]=position,b=councilTreeBounds;
  if(x>b.west&&x<b.east&&z>b.south&&z<b.north){
   if(!state.removed.has(root))plan.push({root,position,children});
  }else outside.push({root,name:String(root.name),position});
 }
 // Atomic count guard: no enabled state, metadata or stored report is changed
 // until the complete deduplicated plan has passed the bounded-owner limit.
 if(state.report.removed.length+plan.length>8)throw Error('Council tree clearance exceeds8whole roots; inspect actual site before widening scope');
 for(const item of plan){
  item.root.setEnabled(false);state.removed.add(item.root);
  state.report.removed.push({name:String(item.root.name),position:item.position,
   children:item.children.map(n=>String(n.name)),action:'whole root disabled; descendant state inherited'});
 }
 const differences=[];
 for(const item of outside){const now=councilTreePosition(item.root);if(String(item.root.name)!==item.name||now.some((v,i)=>!Object.is(v,item.position[i])))
  differences.push({before:{name:item.name,position:item.position},after:{name:String(item.root.name),position:now}});}
 state.report.calls++;
 state.report.outsideRoots=outside.map(({name,position})=>({name,position}));
 state.report.outsideProof={scope:'Names and world anchor positions before/after THIS invocation; foreign earlier/later owner actions are not attributed to this helper',
  checked:outside.length,namesAndPositionsUnchanged:differences.length===0,differences};
 state.report.complete=differences.length===0;
 councilTreeClearanceStates.set(scene,state);
 scene.metadata={...scene.metadata,newBouleuterionClearance:state.report};
 return state.report;
}
