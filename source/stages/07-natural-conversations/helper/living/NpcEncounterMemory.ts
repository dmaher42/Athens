/** Additive memory in the existing atomic PotterAccount world envelope. */
export const freshEncounter=()=>({met:false,offered:false,completed:false,declined:false,familiarity:0,activity:'none'});
export function validateEncounter(m:any){
  if(!m||['met','offered','completed','declined'].some(k=>typeof m[k]!=='boolean')||![0,1,2].includes(m.familiarity)||!['none','offered','carrying','completed'].includes(m.activity)||m.completed!==(m.activity==='completed')||m.activity!=='none'&&!m.offered||m.offered&&!m.met||m.met!==(m.familiarity>0))throw Error('Encounter memory needs recovery; existing save preserved');
  return m;
}
export class NpcEncounterMemory {
  private cached:any;
  constructor(private account:any,private id:string,private ensureWorld:(allowed:()=>boolean)=>Promise<any>){this.cached=this.decode(account.snapshot());}
  private decode(e:any){const r=e.livingWorld?.npcReactions;if(r!==undefined&&(r.version!==1||!r.encounters||typeof r.encounters!=='object'))throw Error('Unsupported NPC memory; existing save preserved');return validateEncounter(r?.encounters[this.id]??freshEncounter());}
  read(){return this.cached;}
  async refresh(){this.cached=this.decode(await this.account.readLatest());return this.read();}
  async change(action:string,allowed:()=>boolean){
    if(!allowed())throw Error('Interaction ended');
    if(this.account.snapshot().livingWorld===undefined)await this.ensureWorld(allowed);
    const result=await this.account.transactLivingWorld((world:any)=>{if(world?.format!=='athens-npc-world'||world.version!==1||world.npcReactions?.version!==1)throw Error('Unsupported world memory');validateEncounter(world.npcReactions.encounters[this.id]);},(e:any)=>{
      if(!allowed())throw Error('Interaction ended');
      if(e.livingWorld?.format!=='athens-npc-world'||e.livingWorld.version!==1)throw Error('Existing world memory requires recovery');
      const r=e.livingWorld.npcReactions??{version:1,encounters:{}};if(r.version!==1||!r.encounters||typeof r.encounters!=='object')throw Error('Unsupported NPC memory');
      const m={...validateEncounter(r.encounters[this.id]??freshEncounter())};
      if(action==='met'){if(m.met)return{ok:false};m.met=true;m.familiarity=Math.max(1,m.familiarity);}
      else if(action==='help'){if(m.completed||m.activity!=='none')return{ok:false};m.offered=true;m.activity='offered';}
      else if(action==='decline'){if(m.declined&&m.activity==='none')return{ok:false};m.declined=true;if(!m.completed)m.activity='none';}
      else if(action==='collect'){if(m.activity!=='offered')throw Error('No basket awaiting collection');m.activity='carrying';}
      else if(action==='deliver'){if(m.activity!=='carrying')throw Error('No basket being carried');m.completed=true;m.familiarity=2;m.activity='completed';}
      else throw Error('Unknown encounter action');
      validateEncounter(m);e.livingWorld.npcReactions={...r,encounters:{...r.encounters,[this.id]:m}};
    });this.cached=this.decode(result.state);return result;
  }
}
