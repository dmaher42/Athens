/** Presentation/input adapter on the existing bridge. Providers still own every
 * world command, pending request, liveness check and saved transaction. No SDK. */
export function installDialogueFlow(bridge:any,nodeFor:(npc:any,id:string)=>any){
 if(bridge.getFlowState)throw Error('Dialogue flow already installed');
 const modal:HTMLElement=bridge.modalElement,prompt:HTMLElement=bridge.promptElement;
 const caption=document.createElement('div');caption.id='athens-conversation-caption';
 caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');
 Object.assign(caption.style,{position:'fixed',bottom:'132px',left:'50%',transform:'translateX(-50%)',maxWidth:'min(520px,90vw)',padding:'9px 14px',borderRadius:'7px',background:'rgba(17,24,32,.88)',color:'#f4f1e8',font:'15px/1.45 system-ui',pointerEvents:'none',zIndex:'9999',display:'none'});
 document.body.appendChild(caption);
 modal.setAttribute('role','region');modal.removeAttribute('aria-modal');
 Object.assign(modal.style,{bottom:'100px',width:'min(540px,calc(100vw - 32px))',maxHeight:'60vh',padding:'12px 16px',borderRadius:'8px',background:'rgba(19,25,34,.9)',border:'1px solid rgba(224,203,154,.35)',boxShadow:'0 6px 20px rgba(0,0,0,.28)',backdropFilter:'none'});
 Object.assign(prompt.style,{top:'auto',bottom:'94px',padding:'6px 11px',background:'rgba(17,24,32,.84)',letterSpacing:'0'});
 let timer:ReturnType<typeof setTimeout>|null=null,captionText='',disposed=false;
 const clearCaption=()=>{if(timer!==null)clearTimeout(timer);timer=null;captionText='';caption.style.display='none';caption.textContent='';};
 const showCaption=(speaker:string,text:string)=>{clearCaption();captionText=(speaker?`${speaker}: `:'')+text;caption.textContent=captionText;caption.style.display='block';timer=setTimeout(clearCaption,Math.max(3200,Math.min(6500,text.split(/\s+/).length*300)));};
 const quickID=(state:any)=>{
  const t=state?.registration.target;
  return !bridge.readOnly&&((t?.id==='farm2-help-basket'&&t.quickOptionID==='collect')||(t?.id==='farm2-help-delivery'&&t.quickOptionID==='deliver'))?t.quickOptionID:null;
 };
 const quickStarted=new WeakSet<object>();
 const original={key:bridge.onKeyDown,open:bridge.openDialogue,render:bridge.renderContent,provider:bridge.renderProvider,update:bridge.update,close:bridge.closeDialogue,dispose:bridge.dispose};
 Object.defineProperty(bridge,'blocksMovement',{configurable:true,get:()=>bridge.isDialogueOpen&&bridge.readOnly});
 bridge.getFlowState=()=>({open:bridge.isDialogueOpen,pending:!!bridge.providerSession?.pending,walkingAllowed:!bridge.blocksMovement,caption:captionText,choices:bridge.isDialogueOpen?Array.from(modal.querySelectorAll<HTMLButtonElement>('.dialogue-opt-btn')).map(b=>({label:b.textContent,disabled:b.disabled})):[],text:bridge.isDialogueOpen?modal.textContent:null});
 bridge.openDialogue=function(){clearCaption();return original.open.call(this);};
 bridge.renderContent=function(speaker:string,title:string,text:string,options:any[],status?:string){
  if(quickID(this.providerSession)&&this.providerSession.pending){modal.style.display='none';return;}
  if(this.providerSession?.pending&&!this.providerSession.view){title='';text='…';status=undefined;}
  if(status==='Conversation complete. You may close this window.')status=undefined;
  let visible=options;
  const view=this.providerSession?.view;
  if(view&&view.options.length===options.length)visible=options.filter((_:any,i:number)=>view.options[i].id!=='leave');
  else if(!this.providerSession){const node=nodeFor(this.activeNpc,this.currentNodeId);if(node?.options.length===options.length)visible=options.filter((_:any,i:number)=>node.options[i].next!=null);}
  original.render.call(this,speaker,title,text,visible,status);
  if(!this.isDialogueOpen)return;
  modal.style.display='block';
  const [header,body,choices]=Array.from(modal.children) as HTMLElement[];
  Object.assign(header.style,{paddingBottom:'6px',marginBottom:'8px'});
  const name=header.firstElementChild?.firstElementChild as HTMLElement|null;if(name)name.style.fontSize='17px';
  const subtitle=header.firstElementChild?.children[1] as HTMLElement|null;if(subtitle&&!title)subtitle.style.display='none';
  Object.assign(body.style,{fontFamily:'system-ui, sans-serif',fontSize:'15px',lineHeight:'1.45',marginBottom:visible.length?'8px':'0'});
  body.setAttribute('aria-live','polite');
  choices.querySelectorAll<HTMLButtonElement>('.dialogue-opt-btn').forEach(b=>Object.assign(b.style,{padding:'7px 10px',marginTop:'6px',borderRadius:'5px',background:'rgba(255,255,255,.055)',border:'1px solid rgba(200,210,220,.18)'}));
  const hint=document.createElement('div');hint.id='athens-conversation-controls';hint.textContent=(visible.length?`${visible.length===1?'1':`1–${Math.min(9,visible.length)}`} reply · `:'')+'Esc or walk away';
  Object.assign(hint.style,{font:'11px/1.4 system-ui',color:'#b4bdc6',marginTop:'8px'});modal.appendChild(hint);
  // Player input deliberately ignores focused buttons. Return it to the canvas
  // after a turn, so walking and number-key replies work without a mouse click.
  (document.querySelector('canvas') as HTMLElement|null)?.focus({preventScroll:true});
 };
 bridge.renderProvider=function(state:any,view:any){
  const quick=quickID(state);
  if(quick&&!quickStarted.has(state)){
   const option=view.options.find((o:any)=>o.id===quick&&!o.disabled);
   if(option&&this.isSessionCurrent(state)){
    quickStarted.add(state);modal.style.display='none';
    void this.requestProvider(state,()=>state.registration.provider.choose(view.sessionID,quick),false);
    return;
   }
  }
  if(view.presentation==='caption'&&view.status==='complete'&&view.options.length===0){showCaption(quick==='collect'?'':view.speaker,view.text);this.closeDialogue();return;}
  return original.provider.call(this,state,view);
 };
 bridge.update=function(player:any){
  if(this.isDialogueOpen){
   try{
    const target=this.providerSession?.registration.target??this.activeTarget?.target;
    const root=this.activeNpc?.rootMesh;
    const point=target?target.position():root?.position;
    if(this.suspended||document.hidden||!point||root?.isDisposed?.()||Math.hypot(player.x-point.x,player.z-point.z)>4.2||Math.abs(player.y-point.y)>3||(target&&!target.isAvailable()))this.closeDialogue();
   }catch{this.closeDialogue();}
  }
  original.update.call(this,player);
  if(!this.isDialogueOpen&&prompt.style.display!=='none'){
   const t=this.activeTarget?.target,name=this.activeTarget?.subject?.name??this.activeNpc?.name;
   if(name)prompt.textContent=t&&t.actionLabel&&t.actionLabel!=='Talk'?`E · ${t.actionLabel} ${name.toLowerCase()}`:`${name} · E to talk`;
  }
 };
 bridge.closeDialogue=function(){const wasOpen=this.isDialogueOpen;original.close.call(this);if(wasOpen)(document.querySelector('canvas') as HTMLElement|null)?.focus({preventScroll:true});};
 const onKey=(event:KeyboardEvent)=>{
  if(disposed||bridge.disposed||event.defaultPrevented||bridge.isTextEntry(event)||event.altKey||event.ctrlKey||event.metaKey)return;
  if(bridge.isDialogueOpen){
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();bridge.closeDialogue();return;}
   if(/^[1-9]$/.test(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat&&!bridge.providerSession?.pending){const b=modal.querySelectorAll<HTMLButtonElement>('.dialogue-opt-btn')[Number(event.key)-1];if(b&&!b.disabled)b.click();}
    return;
   }
   if(event.key.toLowerCase()==='e'){event.preventDefault();event.stopImmediatePropagation();return;}
  }
  original.key.call(bridge,event);
 };
 window.removeEventListener('keydown',original.key);window.addEventListener('keydown',onKey,true);
 const onVisibility=()=>{if(document.hidden){clearCaption();if(bridge.isDialogueOpen)bridge.closeDialogue();}};
 document.addEventListener('visibilitychange',onVisibility);
 bridge.dispose=function(){if(disposed)return;disposed=true;clearCaption();caption.remove();window.removeEventListener('keydown',onKey,true);document.removeEventListener('visibilitychange',onVisibility);original.dispose.call(this);};
}
