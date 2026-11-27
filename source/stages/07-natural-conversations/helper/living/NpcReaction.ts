/** Reusable low-frequency reactions. The native crowd still owns routes and clips. */
export class NpcReaction {
  private clock=0; private next=0; private cooldown=0; private until=0;
  private savedYaw:number|null=null;
  public state='working'; public acknowledgements=0;
  constructor(public readonly actor:any, private readonly phase=0) {this.next=phase;}
  update(dt:number,player:any,visible:()=>boolean,engaged:boolean,enabled=true){
    this.clock+=Math.min(.1,Math.max(0,dt));
    if(this.clock<this.next)return;this.next=this.clock+.3;
    const w=this.actor,m=w.mesh,p=m.position,d=Math.hypot(player.x-p.x,player.z-p.z);
    if(this.savedYaw!==null&&(!enabled||d>14||!engaged&&this.clock>=this.until)){m.rotation.y=this.savedYaw;this.savedYaw=null;}
    this.state='working';m.metadata.reactionPause=false;
    if(!enabled||!w.presentation||d>14)return;
    if(engaged){this.savedYaw??=m.rotation.y;m.rotation.y=Math.atan2(player.x-p.x,player.z-p.z);this.state='conversation';m.metadata.reactionPause=true;return;}
    const target=w.stops[w.index],tx=target.x-p.x,tz=target.z-p.z,len=Math.hypot(tx,tz),dot=len>.01?((player.x-p.x)*tx+(player.z-p.z)*tz)/len:0;
    if(d<1.65&&Math.abs(player.y-(p.y-w.footOffset))<1.8&&dot>0&&visible()){
      this.state='waiting for space';m.metadata.reactionPause=true;return;
    }
    if(this.clock<this.until){this.state='acknowledging';m.metadata.reactionPause=true;m.rotation.y=Math.atan2(player.x-p.x,player.z-p.z);return;}
    // One brief acknowledgement on approach, with long staggered cooldowns.
    if(d<5.5&&d>1.7&&this.clock>this.cooldown&&(w.wait>0||d<3.5)&&visible()){
      this.savedYaw=m.rotation.y;this.until=this.clock+.85;this.cooldown=this.clock+24+this.phase*7;this.acknowledgements++;
      this.state='acknowledging';m.metadata.reactionPause=true;m.rotation.y=Math.atan2(player.x-p.x,player.z-p.z);
    }
  }
  release(){if(this.actor.mesh.isDisposed?.()||!this.actor.mesh.metadata){this.savedYaw=null;this.state='working';return;}if(this.savedYaw!==null){this.actor.mesh.rotation.y=this.savedYaw;this.savedYaw=null;}this.actor.mesh.metadata.reactionPause=false;this.state='working';}
}
