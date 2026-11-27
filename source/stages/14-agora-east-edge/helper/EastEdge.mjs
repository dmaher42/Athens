import site from './EAST-SITE.json' with {type:'json'};

const zoneEdits=new Map(site.edits.map(edit=>[edit.id,edit]));

export function fitZone(zone){
  const edit=zoneEdits.get(zone.id);
  if(!edit)return zone;
  const placed={...zone};
  for(const key of ['trees','benches','goods']){
    const changes=edit[key];
    if(!changes?.length)continue;
    placed[key]=zone[key].map((item,index)=>{
      const row=changes.find(change=>change.index===index);
      if(!row)return item;
      if(item.x!==row.from[0]||item.z!==row.from[1])
        throw Error('Agora east survey no longer matches '+zone.id+' '+key+' '+index);
      const [x,z,yaw]=row.to;
      return {...item,x,z,...(yaw===undefined?{}:{yaw}),
        ...(key==='trees'?{agoraOriginalAnchor:item.agoraOriginalAnchor??{x:item.x,z:item.z}}:{})};
    });
  }
  return placed;
}

export function addRoutes(rows){
  return [...rows,...site.walks.map(route=>({...route,type:'path',role:'civic'}))];
}

export function addFootprint(rows){
  const b=site.court;
  return [...rows,{id:'agora-east-meeting-ground',x:(b.west+b.east)/2,z:(b.south+b.north)/2,
    w:b.east-b.west,d:b.north-b.south,rotation:0}];
}

export function benchSupports(scene,heightAt){
  const records=site.edits.flatMap(edit=>edit.benches??[]).map(({to:[x,z,yaw]})=>{
    const y=heightAt(x,z);
    if(!Number.isFinite(y))throw Error('Missing ground beneath the east Agora seat');
    return {x,y,z,yaw,range:2.35,
      boxes:[{x:0,y:.46,z:0,hx:1.2,hy:.07,hz:.275,yaw:0},
        ...[-.82,.82].map(x=>({x,y:.2,z:0,hx:.125,hy:.2,hz:.24,yaw:0}))],
      floors:[{x:0,z:0,hx:1.2,hz:.275,top:.53}]};
  });
  scene.metadata.agoraEastMeeting={court:site.court,walks:site.walks,benches:records};
  return records;
}
