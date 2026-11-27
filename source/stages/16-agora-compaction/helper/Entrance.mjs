import design from './NORTH-SITE.json' with {type:'json'};

export function buildCompactEntrance(builder,ground){
  const {origin,yaw,width,length,segments}=design.entrance;
  const [ox,oz]=origin,c=Math.cos(yaw),s=Math.sin(yaw);
  const floors=[],boxes=[],steps=[],cheeks=[];
  const at=(x,z)=>{
    const y=ground(ox+c*x+s*z,oz-s*x+c*z);
    if(!Number.isFinite(y))throw Error('Missing ground at the Agora entrance');
    return y;
  };
  const interval=length/segments;
  for(let i=0;i<segments;i++){
    const back=-length/2+i*interval,front=back+interval,z=(back+front)/2;
    const terrain=[at(-width/2,back),at(width/2,back),at(-width/2,front),at(width/2,front),at(0,z)];
    const top=Math.max(...terrain)+.028,bottom=Math.min(...terrain)-.14;
    builder.box('Council entrance paving',0,(top+bottom)/2,z,width,top-bottom,interval,builder.p.pavement??builder.p.marble);
    floors.push({x:0,z,hx:width/2,hz:interval/2,top});
    steps.push({z,bottom,top,maxRise:Math.max(...terrain)-Math.min(...terrain)});
  }
  const edgeX=width/2+.28;
  for(const side of [-1,1]){
    const x=side*edgeX;
    for(const index of [1,2,3,4]){
      const {z,top:walkTop}=steps[index];
      const w=.52,d=interval+.012;
      const bottom=Math.min(at(x-w/2,z-d/2),at(x+w/2,z+d/2),walkTop)-.13;
      const top=walkTop+(index===1?.56:.39);
      builder.box('Civic entrance ashlar cheek',x,(bottom+top-.065)/2,z,w,top-.065-bottom,d,builder.p.stone);
      builder.box('Civic entrance pale cap',x,top-.0325,z,w+.085,.065,d,builder.p.marble);
      boxes.push({x,y:(bottom+top)/2,z,hx:(w+.085)/2,hy:(top-bottom)/2,hz:d/2,yaw:0});
      cheeks.push({x,z,top});
    }
  }
  const adjacent=steps.slice(1).map((step,i)=>Math.abs(step.top-steps[i].top));
  const rim=Math.max(Math.abs(steps[0].top-at(0,-length/2)),Math.abs(steps.at(-1).top-at(0,length/2)));
  if(Math.max(...adjacent,rim)>.22)throw Error('Agora entrance tread needs fitting '+JSON.stringify({adjacent,rim}));
  const root=builder.finish({id:'agora-compact-entrance',x:ox,z:oz,w:width+1.34,d:length,rotation:yaw},0,null,
    ['Council to Agora threshold','Fitted limestone edges']);
  Object.assign(root.metadata,{floorPlanes:floors,collisionBoxes:boxes,compaction:{steps,cheeks,rim,adjacent}});
  const scene=builder.scene,ledger=scene.metadata?.districtStreaming?.resources;
  if(!ledger)throw Error('Agora entrance requires the native resource owner');
  const id='agora-compact-civic-entrance';
  ledger.register({id,owner:'Entrance',residency:'essential',reason:'Council approach paving and its low stone boundaries',
    dependencies:[],validationRoute:'agora-square-civic-entry'});
  const scope=ledger.scope(id);
  scope.ownComposite(root,r=>{if(!r.isDisposed())r.dispose(false,false);},[root]);
  let closed=false;
  const close=()=>{if(!closed){closed=true;scope.dispose();ledger.unregister(id);}};
  const ro=root.onDisposeObservable.add(close),so=scene.onDisposeObservable.add(close);
  scope.defer(()=>root.onDisposeObservable.remove(ro));
  scope.defer(()=>scene.onDisposeObservable.remove(so));
  scope.defer(()=>ledger.unregister(id));
  return root;
}
