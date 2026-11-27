import {NpcReaction} from '../living/NpcReaction.js';
import {NpcEncounterMemory} from '../living/NpcEncounterMemory.js';

/** Farm data/adapter only: no new character, controller, UI or wallet. */
export function installFarm2Encounter(app:any,api:any){
 const scene=app.scene,crowd=app.crowdBridge,farm=app.farmstead2,dialogue=app.dialogueBridge;
 if(app.appearanceEditor)return;
 const workers=crowd.agents.filter((w:any)=>w.id.startsWith('farm2-'));
 if(workers.length!==3)throw Error('Expected the original three farm workers');
 const carrier=workers.find((w:any)=>w.id==='farm2-basket-carrier');
 let memory:NpcEncounterMemory;
 try{memory=new NpcEncounterMemory(app.market.account,'farm2-basket-carrier',allowed=>app.livingWorld.adapter.initialize(allowed));}
 catch(error){scene.metadata.farm2Encounter={getState:()=>({ready:false,lastError:String(error),memoryPreserved:true})};return;}
 const reactions=workers.map((w:any,i:number)=>new NpcReaction(w,i*.8));
 const ledger=scene.metadata.districtStreaming.resources,id='farm2-reactive-encounter';
 ledger.register({id,owner:'BabylonFarm2Encounter.ts',residency:'essential',reason:'Three low-frequency native worker reactions and existing dialogue targets',dependencies:[],validationRoute:'farm2-accept-decline-deliver-return-reload'});const scope=ledger.scope(id);
 let current:any=null,disposed=false,elapsed=0,cargo:any=null,fill:any=null,lastError='';
 const live=()=>!disposed&&!app.appearanceEditor&&app.isWalkMode&&!app.journey?.mounted&&!app.journey?.exploringRoad&&!app.market?.isOpen&&!document.hidden&&!app.playerController?.jumpState?.airborne;
 const feet=()=>app.playerController.position;
 const near=(p:any,r=3.2)=>live()&&Math.hypot(feet().x-p.x,feet().z-p.z)<r&&Math.abs(feet().y-p.y)<2;
 const point=(x:number,z:number)=>({x,y:app.playerController.getHeightAt(x,z),z});
 const pickup=()=>point(-373.3,144.8),delivery=()=>point(-353.2,165.7);
 const visible=(w:any)=>app.walkSupport.cameraFraction([w.mesh.position.x,w.mesh.position.y-w.footOffset+1.5,w.mesh.position.z],[feet().x,feet().y+1.25,feet().z])>=.98;
 const allowed=(kind:string)=>live()&&(kind==='worker'?!!carrier.presentation&&near({x:carrier.mesh.position.x,y:carrier.mesh.position.y-carrier.footOffset,z:carrier.mesh.position.z})&&visible(carrier):near(kind==='pickup'?pickup():delivery(),2.6));
 let thankedThisVisit=false;
 const view=(s:any,text:string,options:any[])=>{s.offered=new Set(options.map(o=>o.id));return{sessionID:s.id,speaker:s.kind==='worker'?'Thaleia':s.kind==='delivery'&&memory.read().completed?'Courtyard sorter':s.kind==='pickup'?'Olive basket':'Courtyard baskets',title:'',text,options,status:'active'};};
 const option=(id:string,label:string)=>({id,label});
 const leave=(label="I'll let you get on.")=>option('leave',label);
 const help=(s:any)=>{s.step='help-question';return view(s,'Could you take the full basket by the olive trees up to the courtyard?',[option('help-confirm',"All right. I'll take it."),option('where-basket','Which basket?'),option('decline',"Sorry, I can't stop.")]);};
 const main=(s:any)=>{const m=memory.read();s.step='start';
  if(s.kind==='pickup')return view(s,'A basket full of olives.',[option('collect','Pick it up.'),leave('Leave it.')]);
  if(s.kind==='delivery')return view(s,'There is room beside the other basket.',[option('deliver','Set the basket down.'),leave('Keep carrying it.')]);
  let greeting=m.completed?(thankedThisVisit?'Hello again.':"Ah, it's you. Thanks for the hand earlier."):m.activity==='carrying'?'Getting on all right with that?':m.activity==='offered'?'Did you find the basket?':m.declined?'Hello again. Still having a look around?':s.firstMeeting?'Have you got a moment?':'Oh, hello. What is it?';
  if(m.completed)thankedThisVisit=true;
  return view(s,greeting,[...(!m.completed?[option(m.activity==='none'?'help':'where-leave',m.activity==='none'?(m.declined?'Do you still need a hand?':'Need a hand?'):'Where did you want it?')]:[option('helped','Did it save you a trip?')]),option('about','What are you working on?'),m.completed?leave():option('decline',m.activity==='carrying'?"I can't carry on. Sorry.":"Not just now, sorry.")]);
 };
 const provider=(kind:string)=>({
  async open(_:any,context:any){const s:any={id:'farm2-'+kind+'-'+crypto.randomUUID(),kind,context,closed:false,firstMeeting:false,step:'start',offered:new Set()};current=s;if(kind==='worker')carrier.mesh.metadata.reactionPause=true;
   try{await memory.refresh();s.firstMeeting=!memory.read().met;if(!context.isCurrent()||!allowed(kind))throw Error('You moved away');if(kind==='worker')await memory.change('met',()=>context.isCurrent()&&current===s&&allowed(kind));return main(s);}catch(e){lastError=String(e);return view(s,'Progress could not be saved. Close this conversation and reopen the game before trying again.',[leave('Close.')]);}},
  async choose(sessionID:string,optionID:string){const s=current;if(!s||s.id!==sessionID||s.closed||!s.context.isCurrent()||!allowed(kind)||!s.offered.has(optionID))throw Error('Interaction ended');
   if(optionID==='leave'){dialogue.closeDialogue();return view(s,'',[ ]);}
   if(kind==='worker'){
    if(optionID==='about')return view(s,"I'm taking these up to the courtyard.",[option('sorting','What happens to them there?'),option('help','Could I take one up for you?'),leave()]);
    if(optionID==='sorting')return view(s,'They pick out the damaged fruit. Most of the rest is for oil.',[option('oil','And the rest?'),leave('Right. Thanks.')]);
    if(optionID==='oil')return view(s,"Some are kept for eating. They need curing first; you wouldn't want one straight off the tree.",[leave('I will take your word for it.')]);
    if(optionID==='helped')return view(s,'It did. I could get back to the next load. Thank you.',[leave("You're welcome.")]);
    if(optionID==='help')return memory.read().completed?view(s,"We're all right for now, thanks.",[leave()]):help(s);
    if(optionID==='where-basket')return view(s,'The full one beside the olive trees. You can see the olives in it.',s.step==='help-question'?[option('help-confirm',"Right. I'll take it."),option('decline',"Sorry, I can't.")]:[option('where-leave','And where should I put it?'),leave("I'll have a look.")]);
    if(optionID==='where-leave')return view(s,'With the other basket in the courtyard. They will sort it there.',[...(memory.read().activity==='offered'?[option('where-basket','Which basket was it?')]:[]),leave("All right. I'll take it over.")]);
   }
   const action=kind==='worker'&&optionID==='help-confirm'&&s.step==='help-question'?'help':kind==='worker'&&optionID==='decline'?'decline':kind==='pickup'&&optionID==='collect'?'collect':kind==='delivery'&&optionID==='deliver'?'deliver':null;if(!action)throw Error('Unavailable choice');
   await memory.change(action,()=>current===s&&s.context.isCurrent()&&allowed(kind));syncCargo();
   if(action==='decline')return {...view(s,'No trouble. I will see to it.',[]),status:'complete',presentation:'caption'};
   if(action==='help'){s.step='accepted';return view(s,'Thanks. Leave it with the other basket in the courtyard.',[option('where-basket','Where is the full basket?'),leave("I'll take it over.")]);}
   if(action==='collect')return {...view(s,'You lift the basket.',[]),status:'complete',presentation:'caption'};
   return {...view(s,"That's it. Thank you.",[]),status:'complete',presentation:'caption'};
  },close(sessionID:string){if(current?.id===sessionID){current.closed=true;current=null;}reactions.forEach((r:any)=>r.release());}
 });
 const registrations=[dialogue.registerInteractionTarget({id:'farm2-thaleia',name:'Thaleia',position:()=>({x:carrier.mesh.position.x,y:carrier.mesh.position.y-carrier.footOffset,z:carrier.mesh.position.z}),isAvailable:()=>allowed('worker')&&!(memory.read().activity==='offered'&&near(pickup(),2.6))&&!(memory.read().activity==='carrying'&&near(delivery(),2.6))},provider('worker')),
 dialogue.registerInteractionTarget({id:'farm2-help-basket',name:'Olive basket',actionLabel:'Pick up',quickOptionID:'collect',position:pickup,isAvailable:()=>allowed('pickup')&&(memory.read().activity==='offered'||current?.kind==='pickup'&&!current.closed&&memory.read().activity==='carrying')},provider('pickup')),
 dialogue.registerInteractionTarget({id:'farm2-help-delivery',name:'Olive basket',actionLabel:'Put down',quickOptionID:'deliver',position:delivery,isAvailable:()=>allowed('delivery')&&(memory.read().activity==='carrying'||current?.kind==='delivery'&&!current.closed&&memory.read().completed)},provider('delivery'))];
 const syncCargo=()=>{if(memory.read().activity!=='carrying'){cargo?.setEnabled(false);return;}const player=app.playerController.playerMesh;if(!player)return;if(!cargo){cargo=farm.basketTemplate.createInstance('Player helping olive basket');cargo.isVisible=true;cargo.isPickable=false;cargo.metadata={noShadowCaster:true,farm2PlayerCargo:true};scope.own(cargo,(m:any)=>{if(!m.isDisposed())m.dispose(false,false);},'mesh');fill=api.MeshBuilder.CreateSphere('Player carried olives',{segments:8,diameter:1},scene);fill.parent=cargo;fill.position.set(0,.435,0);fill.scaling.set(.68,.1,.68);fill.material=farm.oliveMaterial;fill.isPickable=false;fill.metadata={noShadowCaster:true};scope.own(fill,(m:any)=>{if(!m.isDisposed())m.dispose(false,false);},'mesh');}cargo.setEnabled(live());const yaw=player.rotation.y;cargo.position.set(feet().x+Math.sin(yaw)*.36,feet().y+.82,feet().z+Math.cos(yaw)*.36);cargo.scaling.setAll(.62);};
 const observer=scene.onBeforeRenderObservable.add(()=>{if(disposed)return;const dt=scene.getEngine().getDeltaTime()/1000;for(const r of reactions){r.actor.mesh.metadata.reactionDialogueExempt=dialogue.isOpen&&current?.kind==='worker'&&r.actor!==carrier&&live();r.update(dt,feet(),()=>visible(r.actor),current?.kind==='worker'&&r.actor===carrier,live());}
  elapsed+=Math.min(.1,dt);if(elapsed>.3){elapsed=0;if(current&&!allowed(current.kind))dialogue.closeDialogue();}try{syncCargo();}catch(e){lastError=String(e);}});
 const storage=()=>{void memory.refresh().then(syncCargo).catch(e=>{lastError=String(e);});};window.addEventListener('storage',storage);
 scope.defer(()=>{disposed=true;window.removeEventListener('storage',storage);scene.onBeforeRenderObservable.remove(observer);registrations.forEach(f=>f());reactions.forEach(r=>{r.release();if(r.actor.mesh.metadata)delete r.actor.mesh.metadata.reactionDialogueExempt;});});
 const state=()=>({identity:'farm2-basket-carrier',memory:memory.read(),reactions:reactions.map(r=>({id:r.actor.id,state:r.state,acknowledgements:r.acknowledgements})),conversation:current?.kind??null,carrying:!!cargo?.isEnabled(),lastError});
 const dispose=()=>{if(disposed)return;disposed=true;scope.dispose();ledger.unregister(id);};scene.metadata.farm2Encounter={getState:state,dispose};
 scene.onDisposeObservable.addOnce(dispose);
}
