/** New Bouleuterion: measured foundation/wall envelope, four roof stations,
 * reconstructed Classical timber U seating and an explorable council floor.
 * The original native generation row remains unchanged. Lost elevations,
 * furniture, roof and row count are interpretive, not recovered exact facts.
 */
import {PAINTED_STOA_GEOMETRY as G} from './BabylonPaintedStoa.js';
import {createBouleuterionCollector} from './NewBouleuterionGeometry.mjs';
import {buildNewBouleuterionRoof} from './NewBouleuterionRoof.mjs';
export {newBouleuterionRoutes,newBouleuterionInteriorRoutes,clearNewBouleuterionTrees} from './NewBouleuterionSite.mjs';

export const NEW_BOULEUTERION=Object.freeze({centre:{x:-149,z:49.9},baseY:1.5,rotation:Math.PI/2,wall:{w:21.5,d:16.9,thickness:.65},foundation:{w:22.5,d:17.5,top:-.10},clear:{w:20.2,d:15.6},floor:.05,bearing:6.40,doors:[-8.6,8.6],doorWidth:1.6,doorHeight:2.8,rows:8,pitch:.95,rise:.48,aisleWidth:.95,columns:[[-3.02,-5.5],[3.02,-5.5],[-3.02,5.5],[3.02,5.5]]});

export function createNewBouleuterion(k:any,plan:any,baseY:number,parent:any,base:string){
 if(plan.id!=='new-council'||plan.x!==-149||plan.z!==54||plan.w!==14.4||plan.d!==6.4||Math.abs(plan.rotation-Math.PI)>1e-7||Math.abs(baseY-1.5)>1e-7)throw Error('New Council generation/site contract changed; re-survey');
 const A=NEW_BOULEUTERION,scene=k.scene,previousMaterials=new Set(scene.materials),previousTextures=new Set(scene.textures),textures=new Map<string,any>(),solids:any[]=[],floors:any[]=[],seating:any[]=[];
 const image=(path:string,color=true)=>{const key=path+':'+color;if(textures.has(key))return textures.get(key);const C=k.p.plaster.albedoTexture.constructor,t=new C(base.replace(/\/?$/,'/')+path,scene);t.name='New Bouleuterion / '+path;t.gammaSpace=color;t.anisotropicFilteringLevel=8;t.wrapU=t.wrapV=1;textures.set(key,t);return t;};
 const mapRoot='textures/painted-stoa/poikile-v2/';
 const material=(name:string,tint:number[],map?:string)=>{const C=k.p.stone.constructor,m=new C('New Bouleuterion / '+name,scene);m.albedoColor=k.p.stone.albedoColor.clone();m.albedoColor.set(...tint);m.metallic=0;m.roughness=.90;m.backFaceCulling=true;if(map)m.albedoTexture=image(map);return m;};
 const stone=material('warm poros footing and orthostates',[.96,.90,.76],mapRoot+'hand-plaster-colour-2k.jpg'),plaster=material('maintained lime plaster',[1.08,1.02,.91],mapRoot+'hand-plaster-colour-2k.jpg'),marble=material('pale four Ionic support stations',[.98,.96,.88],'textures/marble_albedo.jpg'),timber=material('structural cypress timber',[1.03,.86,.63],mapRoot+'weathered-timber-colour-1k.jpg'),earth=material('hard compacted council floor',[1,.97,.89],'textures/compacted-earth/compacted-earth-basecolor-14b5a1086f9e.png'),clay=material('fired terracotta pan tiles',[1,.93,.85],mapRoot+'terracotta-albedo.jpg'),clayLight=material('terracotta covers and antefixes',[1.10,.99,.87],mapRoot+'terracotta-albedo.jpg'),red=material('restrained red ochre dado',[.44,.12,.065]),bronze=material('aged bronze fittings',[.30,.24,.11]),wax=material('dark wax writing tablet',[.115,.075,.035]);
 for(const [m,stem,strength]of[[stone,'pale-stone',.22],[plaster,'white-plaster',.25],[timber,'weathered-timber',.30]]as const){m.bumpTexture=image(mapRoot+stem+'-normal-dx-1k.jpg',false);m.bumpTexture.level=strength;m.invertNormalMapY=true;m.metallicTexture=image(mapRoot+stem+'-roughness-1k.jpg',false);m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=false;}
 for(const m of[clay,clayLight]){m.bumpTexture=image(mapRoot+'terracotta-normal.jpg',false);m.bumpTexture.level=.20;m.invertNormalMapY=true;m.metallicTexture=image(mapRoot+'terracotta-roughness.jpg',false);m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=false;}
 const batch=createBouleuterionCollector(k,G),g=batch.builder;
 const box=(name:string,m:any,x:number,y:number,z:number,w:number,h:number,d:number,b=.008)=>{if(w<=0||h<=0||d<=0)throw Error('Invalid council block '+name);return G.bevel(g,'New Bouleuterion '+name,m,x,y,z,w,h,d,b);};
 const solid=(name:string,x:number,y:number,z:number,w:number,h:number,d:number)=>solids.push({name,x,y,z,hx:w/2,hy:h/2,hz:d/2,yaw:0});
 const slab=(name:string,m:any,x:number,z:number,w:number,d:number,top:number,depth=.12)=>{box(name,m,x,top-depth/2,z,w,depth,d);solid(name,x,top-depth/2,z,w,depth,d);floors.push({name,x,z,hx:w/2,hz:d/2,top});};
 // The outer footing is deliberately buried beneath the retained street/bank.
 // It supplies no walkable platform outside the actual chamber walls.
 box('buried measured foundation',stone,0,-.45,0,A.foundation.w,.70,A.foundation.d);
 slab('compacted orchestra and parodos',earth,0,0,20.2,15.6,.05,.10);
 // Walls contain real through-openings, with jambs, lintels and deep reveals.
 // High windows light the timber auditorium without removing the roof.
 const wallHeight=6.35,windowBottom=4.75,windowTop=5.85;
 const wallSegment=(name:string,axis:'x'|'z',cross:number,start:number,end:number,openings:any[])=>{
  const make=(a:number,b:number,lo:number,hi:number)=>{if(b-a<.001||hi-lo<.001)return;const x=axis==='x'?(a+b)/2:cross,z=axis==='z'?(a+b)/2:cross,w=axis==='x'?b-a:.65,d=axis==='z'?b-a:.65;box(name,plaster,x,(lo+hi)/2,z,w,hi-lo,d);solid(name,x,(lo+hi)/2,z,w,hi-lo,d);};
  let cursor=start;for(const o of openings){make(cursor,o.a,.05,.05+wallHeight);make(o.a,o.b,.05,o.lo);make(o.a,o.b,o.hi,.05+wallHeight);cursor=o.b;}make(cursor,end,.05,.05+wallHeight);
  for(const o of openings){const centre=(o.a+o.b)/2,span=o.b-o.a;for(const side of[-1,1]){const v=centre+side*(span/2+.075),x=axis==='x'?v:cross,z=axis==='z'?v:cross;box(name+' dressed jamb',stone,x,(o.lo+o.hi)/2,z,axis==='x'?.15:.72,o.hi-o.lo,axis==='x'?.72:.15);}const x=axis==='x'?centre:cross,z=axis==='z'?centre:cross;box(name+' stone lintel',stone,x,o.hi+.12,z,axis==='x'?span+.42:.76,.24,axis==='x'?.76:span+.42);if(o.lo>.1)box(name+' stone sill',stone,x,o.lo-.07,z,axis==='x'?span+.22:.75,.14,axis==='x'?.75:span+.22);}
 };
 const longWindows=[-5.0,-1.67,1.67,5.0].map(x=>({a:x-.58,b:x+.58,lo:windowBottom,hi:windowTop}));
 const eastOpen=[{a:-9.4,b:-7.8,lo:.05,hi:2.85},...[-5,-1.67,1.67,5].map(x=>({a:x-.55,b:x+.55,lo:windowBottom,hi:windowTop})),{a:7.8,b:9.4,lo:.05,hi:2.85}];
 wallSegment('west hall wall','x',-8.125,-10.75,10.75,longWindows);
 wallSegment('east hall wall','x',8.125,-10.75,10.75,eastOpen);
 for(const side of[-1,1])wallSegment('end hall wall','z',side*10.425,-7.8,7.8,[-4.7,0,4.7].map(z=>({a:z-.60,b:z+.60,lo:windowBottom,hi:windowTop})));
 // Real poros orthostates form the lower1.50m wall zone, not1.50m-thick walls.
 for(let i=0;i<18;i++){const x=-10.15+i*1.195;for(const side of[-1,1]){if(side===1&&A.doors.some(door=>Math.abs(x-door)<1.42))continue;for(const face of[-1,1])box('dressed poros orthostate',stone,x,.79,side*8.125+face*.331,1.175,1.46,.035,.003);}}
 for(const side of[-1,1])for(let i=0;i<13;i++)for(const face of[-1,1])box('end poros orthostate',stone,side*10.425+face*.331,.79,-7.18+i*1.195,.035,1.46,1.175,.003);
 for(const side of[-1,1]){box('west wall red dado cap',red,0,1.56,side*8.125,side<0?21.52:15.5,.055,.68);box('end wall red dado cap',red,side*10.425,1.56,0,.68,.055,15.6);}
 for(const door of A.doors){if(door<0)slab('worn flush northeast entrance sill',stone,door,8.125,1.60,.78,.05,.13);else{slab('southeast outer worn stoop',stone,door,8.60,1.60,.30,.17,.18);slab('southeast inner reveal tread',stone,door,8.125,1.60,.65,.29,.30);}for(const side of[-1,1]){
   // Doors are folded back inside the parodos, not placed across the lane.
   box('folded timber door leaf',timber,door+side*.83,1.38,7.40,.075,2.65,.80);solid('folded door leaf',door+side*.83,1.38,7.40,.075,2.65,.80);
   for(const y of[.45,1.35,2.25])box('door bronze hinge',bronze,door+side*.875,y,7.80,.09,.13,.13);
  }}
 // Close the small rising-ground contact with an actual supported entrance
 // landing and two .12m risers. No terrain/road cut or player exception.
 slab('south ambulatory lower tread',stone,5.9875,5.85,.675,3.90,.17,.18);
 slab('south ambulatory upper tread',stone,6.5625,5.85,.475,3.90,.29,.30);
 slab('south entrance ambulatory landing',earth,8.45,5.85,3.30,3.90,.29,.30);
 // Eight reconstructed timber rows form an open U. Treads and seat planks
 // are physical surfaces, with four stair aisles rather than jump-only tiers.
 const subtract=(a:number,b:number,holes:number[][])=>{let spans=[[a,b]];for(const [lo,hi]of holes){const next:number[][]=[];for(const [l,r]of spans){if(hi<=l||lo>=r)next.push([l,r]);else{if(lo>l)next.push([l,Math.min(lo,r)]);if(hi<r)next.push([Math.max(hi,l),r]);}}spans=next;}return spans;};
 const westAisles=[-1.2,1.2],endAisle=1.4,halfAisle=.475;
 const timberDeck=(name:string,x:number,z:number,w:number,d:number,top:number)=>{
  let rectangles=[[x-w/2,x+w/2,z-d/2,z+d/2]];
  for(const [cx,cz]of A.columns.filter(([,cz])=>cz<0)){const l=cx-.395,r=cx+.395,b=cz-.395,t=cz+.395,next:number[][]=[];for(const [x0,x1,z0,z1]of rectangles){if(r<=x0||l>=x1||t<=z0||b>=z1){next.push([x0,x1,z0,z1]);continue;}if(l>x0)next.push([x0,l,z0,z1]);if(r<x1)next.push([r,x1,z0,z1]);const a=Math.max(x0,l),q=Math.min(x1,r);if(b>z0)next.push([a,q,z0,b]);if(t<z1)next.push([a,q,t,z1]);}rectangles=next;}
  for(const [x0,x1,z0,z1]of rectangles)slab(name,timber,(x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,top);
 };
 const tierHeight=(x:number,z:number)=>{for(let i=0;i<A.rows;i++){const edge=9.45-i*.95,west=-7.15+i*.95;if((z>=west&&z<=west+.95&&Math.abs(x)<=edge)||(Math.abs(x)>=edge-.95&&Math.abs(x)<=edge&&z>=west+.95&&z<=3.9))return .05+(7-i)*.48;}return .05;};
 for(let i=0;i<A.rows;i++){
  const edge=9.45-i*.95,west=-7.15+i*.95,top=.05+(7-i)*.48;
  // West seat and deck are split at both aisles, with full timber risers.
  for(const [lo,hi]of subtract(-edge,edge,westAisles.map(v=>[v-halfAisle,v+halfAisle]))){
   timberDeck('west row '+i+' tread',(lo+hi)/2,west+.475,hi-lo,.95,top);
   box('west closed tier riser',timber,(lo+hi)/2,top-.24,west+.93,hi-lo,.48,.07);solid('west tier riser',(lo+hi)/2,top-.24,west+.93,hi-lo,.48,.07);
   const colHoles=A.columns.filter(([cx,cz])=>cz<0&&Math.abs(cz-(west+.19))<.65).map(([cx])=>[cx-.45,cx+.45]);
   for(const [a,b]of subtract(lo,hi,colHoles)){box('west council seat',timber,(a+b)/2,top+.39,west+.19,b-a,.10,.33);solid('west council seat',(a+b)/2,top+.39,west+.19,b-a,.10,.33);for(let x=a+.20;x<b-.10;x+=1.1)box('west bench trestle',timber,x,top+.17,west+.19,.10,.34,.28);}
  }
  for(const side of[-1,1])for(const [lo,hi]of subtract(west+.95,3.9,[[endAisle-halfAisle,endAisle+halfAisle]])){
   slab('end row '+i+' tread',timber,side*(edge-.475),(lo+hi)/2,.95,hi-lo,top);
   box('end closed tier riser',timber,side*(edge-.93),top-.24,(lo+hi)/2,.07,.48,hi-lo);solid('end tier riser',side*(edge-.93),top-.24,(lo+hi)/2,.07,.48,hi-lo);
   box('end council seat',timber,side*(edge-.19),top+.39,(lo+hi)/2,.33,.10,hi-lo);solid('end council seat',side*(edge-.19),top+.39,(lo+hi)/2,.33,.10,hi-lo);for(let z=lo+.20;z<hi-.1;z+=1.1)box('end bench trestle',timber,side*(edge-.19),top+.17,z,.28,.34,.10);
  }
  if(top>.05)for(const side of[-1,1]){box('closed timber tier end',timber,side*(edge-.475),(top+.05)/2,3.89,.95,top-.05,.08);solid('closed timber tier end',side*(edge-.475),(top+.05)/2,3.89,.95,top-.05,.08);}
  // Each .48m tier change is divided into two .24m actual risers. The
  // innermost row is flush with the orchestra, never an invisible ramp.
  for(const x of westAisles)for(let step=0;step<2;step++){
   const treadTop=top-(step===1&&i<7?.24:0),z=west+.2375+step*.475;slab('west aisle supported tread',timber,x,z,.95,.475,treadTop,.14);
   if(treadTop>.05){box('west aisle closed riser',timber,x,treadTop-.12,z+.2225,.95,.24,.03);solid('west aisle riser',x,treadTop-.12,z+.2225,.95,.24,.03);}
  }
  for(const side of[-1,1])for(let step=0;step<2;step++){
   const treadTop=top-(step===1&&i<7?.24:0),x=side*(edge-.2375-step*.475);slab('end aisle supported tread',timber,x,endAisle,.475,.95,treadTop,.14);
   if(treadTop>.05){box('end aisle closed riser',timber,side*(Math.abs(x)-.2225),treadTop-.12,endAisle,.03,.24,.95);solid('end aisle riser',side*(Math.abs(x)-.2225),treadTop-.12,endAisle,.03,.24,.95);}
  }
  // Longitudinal framing/ties, visible wherever the bank drops away below it.
  for(const x of[-edge+.25,edge-.25])box('tier structural framing',timber,x,top-.32,(west+3.9)/2,.17,.48,3.9-west);
  seating.push({row:i,top,absX:edge,westZ:west,pitch:.95,benchDepth:.33,benchTop:top+.44});
 }
 // A real upper return closes the retained bank against the wall and joins
 // all four stairs. It is supported timber, not an exposed soil slot behind
 // the outer benches; its front ends are guarded by physical rails.
 slab('upper rear circulation deck',timber,0,-7.475,20.2,.65,3.41,.16);
 for(const side of[-1,1]){slab('upper end circulation deck',timber,side*9.775,-1.625,.65,11.05,3.41,.16);box('upper return closed end',timber,side*9.775,1.73,3.89,.65,3.36,.08);solid('upper return closed end',side*9.775,1.73,3.89,.65,3.36,.08);box('upper deck end rail',timber,side*9.775,4.16,3.87,.65,.12,.10);solid('upper deck end rail',side*9.775,4.16,3.87,.65,.12,.10);for(const x of[side*9.49,side*10.04]){box('upper rail post',timber,x,3.83,3.87,.09,.84,.10);solid('upper rail post',x,3.83,3.87,.09,.84,.10);}}
 // The four roof supports sit on the actual tier or orchestra beneath them.
 const columns:any[]=[];
 for(const [x,z]of A.columns){const bottom=tierHeight(x,z),shaftBottom=bottom+.28,shaftTop=6.08;
  // The western plinths continue through real openings in the seating to
  // independent masonry beneath the retained bank. Roof loads do not rest
  // on timber benches. Only their upper dressed portion is normally visible.
  if(bottom>.05){box('buried independent roof-station footing',stone,x,-.35,z,1.08,.70,1.08);box('masonry roof-station pier through bank',stone,x,bottom/2,z,.77,bottom,.77);solid('roof-station masonry pier',x,bottom/2,z,.77,bottom,.77);}
  slab('Ionic station stone plinth',stone,x,z,.77,.77,bottom+.09,.09);
  G.roundProfile(g,'New Bouleuterion Ionic torus base',marble,x,z,[[bottom+.09,.35],[bottom+.14,.35],[bottom+.19,.32],[bottom+.23,.32],[shaftBottom,.315]]);
  G.roundProfile(g,'New Bouleuterion unfluted marble roof shaft',marble,x,z,Array.from({length:9},(_,i)=>{const t=i/8;return[shaftBottom+(shaftTop-shaftBottom)*t,(.312+(.24-.312)*t)*(1+.015*Math.sin(Math.PI*t))];}));
  box('Ionic cushion',marble,x,6.18,z,.78,.20,.48);box('Ionic abacus',marble,x,6.35,z,.86,.10,.62);
  const scroll=G.data();for(const side of[-1,1])for(const face of[-1,1]){const cx=x+side*.285,cy=6.18;for(let j=0;j<60;j++){const a=j/60*Math.PI*4.25,b=(j+1)/60*Math.PI*4.25,rad=(u:number)=>.118*(1-u/69),at=(angle:number,r:number):[number,number,number]=>[cx+side*Math.cos(angle)*r,cy+Math.sin(angle)*r,z+face*.246];G.polygon(scroll,[at(a,rad(j)-.006),at(a,rad(j)+.006),at(b,rad(j+1)+.006),at(b,rad(j+1)-.006)],[0,0,face],1,.72);}}G.mesh(g,'New Bouleuterion rolled Ionic volutes',scroll,marble);
  solid('Ionic roof support',x,(bottom+shaftTop)/2,z,.64,shaftTop-bottom,.64);columns.push({x,z,bottom,bearing:6.4});
 }
 // A modest working council setting, not an invented production system.
 slab('speaker platform',stone,0,3.4,2.45,1.55,.33,.28);slab('speaker lower step',stone,0,2.40,1.45,.45,.19,.14);
 box('clerk table top',timber,0,.85,5.35,2.25,.12,.85);solid('clerk table',0,.85,5.35,2.25,.12,.85);
 for(const x of[-.9,.9])for(const z of[5.05,5.65]){box('clerk table leg',timber,x,.44,z,.12,.78,.12);solid('clerk table leg',x,.44,z,.12,.78,.12);}
 for(const x of[-.6,-.05,.5]){box('writing tablet frame',timber,x,.933,5.35,.42,.038,.30,.004);box('wax writing surface',wax,x,.955,5.35,.35,.012,.23,.002);box('bronze stylus',bronze,x+.15,.968,5.39,.012,.012,.25,.002);}
 box('clerk stool seat',timber,0,.48,6.1,.58,.10,.48);solid('clerk stool seat',0,.48,6.1,.58,.10,.48);for(const side of[-1,1])box('clerk stool support',timber,side*.21,.25,6.1,.10,.40,.38);
 const roof=buildNewBouleuterionRoof(g,G,{stone,lime:plaster,timber,clay,clayLight,red});
 for(const b of roof.cameraBoxes||[])solids.push({...b,name:'hipped roof camera surface'});
 const geometry=batch.flush(),actualPlan={...plan,x:A.centre.x,z:A.centre.z,w:A.foundation.w,d:A.foundation.d,rotation:A.rotation};
 const root=k.finish(actualPlan,A.baseY,parent,['newBouleuterion','measuredClassicalHallEnvelope','fourIonicRoofStations','timberCouncilAuditorium','eightReconstructedURows','fourRealTierStairs','twoEastEntries','hippedTerracottaRoof','explorableCouncilFloor']);
 root.metadata.collisionBoxes=solids;root.metadata.floorPlanes=floors;
 root.metadata.newBouleuterion={version:1,architecture:A,seating,columns,roof,geometry,residencyOwner:'agora-new-bouleuterion-v1',floorWorld:1.55,originalGenerationPlanPreserved:{id:plan.id,x:plan.x,z:plan.z,w:plan.w,d:plan.d,rotation:plan.rotation},actorsChanged:false,newFrameUpdates:0,evidence:'Thompson1937 Hesperia6, AgoraXIV, FHW, DinsmoorPD2549',interpretation:'Classical timber U interpretation. Wall/foundation datums and four support stations follow archaeology; exact row count, full elevations, roof, windows, furnishings and support capitals are reconstructed. Later marble semicircle and later porch are omitted.'};
 const ledger=scene.metadata?.districtStreaming?.resources;if(!ledger)throw Error('New Council requires existing residency ledger');const id='agora-new-bouleuterion-v1';
 ledger.register({id,owner:'BabylonNewBouleuterion.ts',residency:'essential',reason:'One complete council chamber with static supported seating, independent finish maps and no new frame service; shared native palette stays borrowed',dependencies:[],validationRoute:'new-council-two-doors-four-tier-stairs-orchestra-and-neighbour-return'});
 const scope=ledger.scope(id);let closing=false;
 for(const m of scene.materials)if(!previousMaterials.has(m))scope.own(m,(v:any)=>v.dispose(false,false),'material');for(const t of scene.textures)if(!previousTextures.has(t))scope.own(t,(v:any)=>v.dispose(),'texture');
 scope.ownComposite(root,(v:any)=>{if(closing)return;closing=true;if(!v.isDisposed())v.dispose(false,false);},[root]);const close=()=>{if(closing)return;closing=true;scope.dispose();ledger.unregister(id);};const ro=root.onDisposeObservable.add(close),so=scene.onDisposeObservable.add(close);scope.defer(()=>{root.onDisposeObservable.remove(ro);scene.onDisposeObservable.remove(so);});scope.defer(()=>ledger.unregister(id));
 return root;
}
