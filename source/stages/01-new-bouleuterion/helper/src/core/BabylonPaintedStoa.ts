/** Native Painted Stoa, extending the existing architecture Builder.
 * The 28 x 7 m site is deliberately retained at the game's compressed scale.
 * Doric outside / Ionic inside and the four subjects are archaeologically
 * informed; counts, carpentry and lost painted compositions are interpretations.
 * No other building, shared material, terrain, actor or simulation is changed.
 */
type V = [number, number, number];
type Data = {p:number[];n:number[];uv:number[];ix:number[];c:number[]};
type Box = {x:number;y:number;z:number;hx:number;hy:number;hz:number;yaw:number};
type Plan = {id:string;x:number;z:number;w:number;d:number;rotation?:number};
type Builder = {scene:any;root:any;parts:any[];p:Record<string,any>;box:Function;finish:Function};

export const PAINTED_STOA_PAINTINGS = Object.freeze([
  {id:'oinoe',title:'Athenians and Spartans at Oinoe',x:-10.60,width:4.80,height:4.80/3},
  {id:'amazons',title:'Athenians fighting Amazons',x:-5.00,width:5.00,height:5.00/3},
  {id:'troy',title:'After the capture of Troy',x:.80,width:5.00,height:5.00/3},
  {id:'marathon',title:'The Battle of Marathon',x:8.00,width:7.60,height:7.60/3},
].map(p=>Object.freeze({...p,path:'textures/painted-stoa/poikile-v2/'+p.id+'.png',
  provenance:'Modern historical interpretation of a subject described by Pausanias; the ancient composition does not survive.'})));

export const PAINTED_STOA_ARCHITECTURE = Object.freeze({
  width:28,depth:7,frontZ:3.08,innerZ:-.9,publicAisle:2.2,rearAisle:-2.1,
  frontColumns:Object.freeze(Array.from({length:12},(_,i)=>-13.25+i*26.50/11)),
  innerColumns:Object.freeze([-11.5,-6.9,-2.3,2.3,6.9,11.5]),
  columnBearing:3.80,eave:4.60,ridge:5.70,roofHalfDepth:3.78,roofHalfWidth:14.38,
});

const data=():Data=>({p:[],n:[],uv:[],ix:[],c:[]});
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const random=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};

// Shared native architectural modelling operations. Exporting this API lets
// the Zeus reconstruction reuse the tested geometry implementation without
// changing the Painted Stoa's construction, materials or installed programme.
export const PAINTED_STOA_GEOMETRY = Object.freeze({data,polygon,mesh,prism,bevel,roundProfile});

// Native Babylon front faces are clockwise; outward normals remain independent.
function polygon(d:Data,points:V[],outward:V,scale=1,tone=1){
  let n=cross(sub(points[1],points[0]),sub(points[2],points[0]));
  if(n.reduce((s,v,i)=>s+v*outward[i],0)<0){points=[...points].reverse();n=cross(sub(points[1],points[0]),sub(points[2],points[0]));}
  const length=Math.hypot(...n);if(length<1e-10)return;
  n=n.map(v=>v/length) as V;const start=d.p.length/3;
  for(const p of points){d.p.push(...p);d.n.push(...n);d.uv.push((Math.abs(n[0])>.7?p[2]:p[0])/scale,(Math.abs(n[1])>.7?p[2]:p[1])/scale);d.c.push(tone,tone,tone,1);}
  for(let i=1;i<points.length-1;i++)d.ix.push(start,start+i+1,start+i);
}
function mesh(k:Builder,name:string,d:Data,material:any){
  const m=k.box(name,0,0,0,1,1,1,material);
  m.setVerticesData('position',d.p);m.setVerticesData('normal',d.n);m.setVerticesData('uv',d.uv);
  m.setVerticesData('color',d.c,false,4);m.setIndices(d.ix);m.refreshBoundingInfo();return m;
}
function prism(d:Data,axis:'x'|'z',centre:V,length:number,profile:number[][],tone=1){
  const make=(along:number,p:number[]):V=>axis==='x'?[centre[0]+along,centre[1]+p[1],centre[2]+p[0]]:[centre[0]+p[0],centre[1]+p[1],centre[2]+along];
  const n=profile.length;
  for(const sign of[-1,1])polygon(d,profile.map(p=>make(sign*length/2,p)),axis==='x'?[sign,0,0]:[0,0,sign],1,tone);
  for(let i=0;i<n;i++){
    const a=profile[i],b=profile[(i+1)%n],normal:V=axis==='x'?[0,b[1]-a[1],a[0]-b[0]]:[b[1]-a[1],a[0]-b[0],0];
    polygon(d,[make(-length/2,a),make(length/2,a),make(length/2,b),make(-length/2,b)],normal,1,tone);
  }
}
function bevel(k:Builder,name:string,material:any,x:number,y:number,z:number,w:number,h:number,depth:number,b=.012){
  const d=data(),half=[w/2,h/2,depth/2],centre=[x,y,z];b=Math.min(b,...half.map(v=>v*.35));
  const at=(p:V):V=>p.map((v,i)=>v+centre[i]) as V;
  for(let a=0;a<3;a++)for(const sign of[-1,1]){
    const u=(a+1)%3,v=(a+2)%3,n:V=[0,0,0];n[a]=sign;
    polygon(d,[[-1,-1],[-1,1],[1,1],[1,-1]].map(([s,t])=>{const p:V=[0,0,0];p[a]=sign*half[a];p[u]=s*(half[u]-b);p[v]=t*(half[v]-b);return at(p);}),n,1);
  }
  for(let a=0;a<3;a++)for(const su of[-1,1])for(const sv of[-1,1]){
    const u=(a+1)%3,v=(a+2)%3,n:V=[0,0,0];n[u]=su;n[v]=sv;
    polygon(d,[[-1,0],[1,0],[1,1],[-1,1]].map(([end,edge])=>{const p:V=[0,0,0];p[a]=end*(half[a]-b);p[u]=su*(half[u]-(edge?b:0));p[v]=sv*(half[v]-(edge?0:b));return at(p);}),n,1);
  }
  for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){
    const signs:V=[sx,sy,sz];polygon(d,[0,1,2].map(a=>at(half.map((v,i)=>signs[i]*(v-(i===a?0:b))) as V)),signs,1);
  }
  if(material.name?.includes('structural cypress timber')){
    const lengths=[w,h,depth],grain=lengths.indexOf(Math.max(...lengths));
    for(let i=0;i<d.p.length/3;i++){
      const normal=d.n.slice(i*3,i*3+3),face=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),across=[0,1,2].find(a=>a!==grain&&a!==face)??((grain+1)%3);
      d.uv[i*2]=.48+(d.p[i*3+across]-centre[across])/(Math.max(.01,lengths[across])*5);
      d.uv[i*2+1]=d.p[i*3+grain]/1.8;
    }
  }
  return mesh(k,name,d,material);
}
function roundProfile(k:Builder,name:string,material:any,x:number,z:number,rings:number[][],flutes=0){
  const d=data(),segments=flutes?60:40;
  for(let r=1;r<rings.length;r++)for(let j=0;j<segments;j++){
    const a=j*Math.PI*2/segments,b=(j+1)*Math.PI*2/segments;
    const at=(ring:number,angle:number):V=>{const [y,rad]=rings[ring],channel=flutes?1-.035*(.5+.5*Math.cos(angle*flutes)):1;return[x+Math.cos(angle)*rad*channel,y,z+Math.sin(angle)*rad*channel];};
    const p=[at(r-1,a),at(r-1,b),at(r,b),at(r,a)];
    const start=d.p.length/3;polygon(d,p,[Math.cos((a+b)/2),0,Math.sin((a+b)/2)],1);
    // Smooth the shaft between rings but keep each flute's concavity readable.
    for(let q=0;q<4;q++){
      const p0=p[q],angle=Math.atan2(p0[2]-z,p0[0]-x),tangent=.035*.5*flutes*Math.sin(angle*flutes),slope=(rings[r][1]-rings[r-1][1])/(rings[r][0]-rings[r-1][0]||1),n:V=[Math.cos(angle)+tangent*Math.sin(angle),-slope,Math.sin(angle)-tangent*Math.cos(angle)],l=Math.hypot(...n);
      d.n.splice((start+q)*3,3,...n.map(v=>v/l));
    }
  }
  for(const index of[0,rings.length-1]){const sign=index===0?-1:1,[y,radius]=rings[index];polygon(d,Array.from({length:segments},(_,j)=>[x+Math.cos(j*Math.PI*2/segments)*radius,y,z+Math.sin(j*Math.PI*2/segments)*radius] as V),[0,sign,0],1);}
  return mesh(k,name,d,material);
}

export function createPaintedStoa(k:Builder,plan:Plan,groundY:number,parent:any,base:string,ground?:(x:number,z:number)=>number|null){
  if(plan.id!=='painted-stoa'||plan.w!==28||plan.d!==7)throw Error('Painted Stoa requires its retained 28 x 7 metre site');
  const A=PAINTED_STOA_ARCHITECTURE,own:any[]=[],textures=new Map<string,any>(),solids:Box[]=[];
  // Snapshot actual scene arrays so only this building's new resources are
  // owned. Shared palette materials and their image wrappers remain borrowed.
  const previousMaterials=new Set(k.scene.materials),previousTextures=new Set(k.scene.textures);
  const image=(path:string,color=true)=>{
    const key=path+':'+color;let t=textures.get(key);if(t)return t;
    const TextureClass=k.p.plaster.albedoTexture.constructor;
    t=new TextureClass(base+path,k.scene);t.name='Painted Stoa / '+path;t.gammaSpace=color;t.anisotropicFilteringLevel=8;
    textures.set(key,t);return t;
  };
  const material=(source:any,name:string,colour:V,map?:string)=>{
    // The canonical palette uses plain PBRMaterial instances. Construct the
    // same installed class directly instead of cloning then discarding its
    // borrowed texture wrappers; scene-level lighting and grading still apply.
    const MaterialClass=source.constructor,m=new MaterialClass('Painted Stoa / '+name,k.scene);
    own.push(m);m.albedoColor=source.albedoColor.clone();m.albedoColor.set(...colour);
    m.metallic=0;m.roughness=.9;m.backFaceCulling=true;m.bumpTexture=null;m.metallicTexture=null;m.ambientTexture=null;
    m.albedoTexture=map?image(map):null;return m;
  };
  const localMap=(file:string)=>'textures/painted-stoa/poikile-v2/'+file;
  // Maintained lime finish over porous limestone: the former ground-stone
  // colour map made the fluted shafts read as dark timber in the real game.
  // Retain the fine stone relief and roughness beneath a pale mineral finish.
  const limestone=material(k.p.stone,'lime-finished dressed limestone',[.96,.92,.81],localMap('hand-plaster-colour-2k.jpg'));
  const plaster=material(k.p.plaster,'maintained lime plaster',[1.10,1.03,.91],localMap('hand-plaster-colour-2k.jpg'));
  const marble=material(k.p.marble,'pale marble capitals and Ionic bases',[.96,.93,.85],'textures/marble_albedo.jpg');
  const timber=material(k.p.timber,'structural cypress timber',[1.08,.90,.66],localMap('weathered-timber-colour-1k.jpg'));
  const red=material(k.p.red,'restrained red ochre',[.44,.12,.065]);
  const blue=material(k.p.blue,'restrained blue triglyphs',[.085,.15,.21]);
  // Tile shape is real geometry; use clay microstructure instead of a photo
  // of many tiles, which otherwise draws miniature roofs on each modelled pan.
  const clay=material(k.p.roof,'warm fired terracotta',[1,.92,.86],localMap('terracotta-albedo.jpg'));
  const clayLight=material(k.p.roof,'terracotta cover tiles',[1.10,1,.93],localMap('terracotta-albedo.jpg'));
  const clayNormal=image(localMap('terracotta-normal.jpg'),false),clayRoughness=image(localMap('terracotta-roughness.jpg'),false);clayNormal.level=.20;
  for(const m of[clay,clayLight]){m.bumpTexture=clayNormal;m.invertNormalMapY=true;m.metallicTexture=clayRoughness;m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=false;}
  for(const [m,stem,strength] of [[plaster,'white-plaster',.45],[limestone,'pale-stone',.25],[timber,'weathered-timber',.35]] as const){
    const normal=image(localMap(stem+'-normal-dx-1k.jpg'),false),rough=image(localMap(stem+'-roughness-1k.jpg'),false);normal.level=strength;
    m.bumpTexture=normal;m.invertNormalMapY=true;m.metallicTexture=rough;
    m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=false;
  }
  for(const t of textures.values()){t.wrapU=t.wrapV=1;}
  const box=(name:string,mat:any,x:number,y:number,z:number,w:number,h:number,d:number,b=.012)=>bevel(k,'Painted Stoa '+name,mat,x,y,z,w,h,d,b);
  const solid=(x:number,y:number,z:number,w:number,h:number,d:number)=>solids.push({x,y,z,hx:w/2,hy:h/2,hz:d/2,yaw:0});

  // Preserve the exact original floor rectangle and its .05 m top datum.
  k.box('stoa-paving',0,.025,0,plan.w,.05,plan.d,k.p.pavement);
  let low=groundY;const c=Math.cos(plan.rotation??0),s=Math.sin(plan.rotation??0);
  if(ground)for(let x=-14;x<=14;x++)for(let z=-3.5;z<=3.5;z++)low=Math.min(low,ground(plan.x+c*x+s*z,plan.z-s*x+c*z)??groundY);
  if(groundY-low>.025)k.box('stoa-subgrade',0,-(groundY-low+.08)/2,0,28,groundY-low+.08,7,limestone);

  // Plain maintained masonry, with real shallow course joints and a stone plinth.
  box('rear plaster wall',plaster,0,2.43,-3.32,28,3.74,.36,0);
  for(const sign of[-1,1])box('end plaster wall',plaster,sign*13.82,2.43,0,.36,3.74,7,0);
  solid(0,2.15,-3.32,28,4.30,.36);for(const sign of[-1,1])solid(sign*13.82,2.15,0,.36,4.30,7);
  for(let i=0;i<28;i++)box('rear orthostate block',limestone,-13.5+i,.30,-3.31,.986,.50,.40,.009);
  for(const sign of[-1,1])for(let i=0;i<7;i++)box('end orthostate block',limestone,sign*13.81,.30,-3+i,.40,.50,.986,.009);
  box('rear wall crown',limestone,0,4.30,-3.32,28,.10,.42);
  for(const sign of[-1,1])box('end wall crown',limestone,sign*13.82,4.30,0,.42,.10,7);

  // Twelve period Doric columns: no base, twenty flutes, slight entasis.
  for(const x of A.frontColumns){
    roundProfile(k,'Painted Stoa Doric shaft',limestone,x,A.frontZ,[[.05,.325],[.38,.322],[1.15,.306],[2.15,.282],[3.38,.248]],20);
    roundProfile(k,'Painted Stoa Doric neck and echinus',marble,x,A.frontZ,[[3.35,.25],[3.43,.25],[3.45,.264],[3.48,.264],[3.49,.25],[3.53,.25],[3.59,.29],[3.66,.36],[3.68,.36]]);
    box('Doric abacus',marble,x,3.74,A.frontZ,.76,.12,.76,.008);
    solid(x,1.72,A.frontZ,.65,3.44,.65);
  }
  // The excavated interior order used unfluted limestone shafts and simple
  // cylindrical marble bases. Avoid importing a later ornate Attic torus base.
  for(const x of A.innerColumns){
    roundProfile(k,'Painted Stoa simple Ionic marble disk base',marble,x,A.innerZ,[[.05,.34],[.08,.36],[.21,.36],[.24,.33]]);
    roundProfile(k,'Painted Stoa smooth Ionic limestone shaft',limestone,x,A.innerZ,[[.24,.225],[1.05,.218],[2.12,.196],[3.46,.173]]);
    roundProfile(k,'Painted Stoa Ionic echinus',marble,x,A.innerZ,[[3.44,.18],[3.50,.19],[3.56,.25],[3.62,.26]]);
    box('Ionic low cushion',marble,x,3.64,A.innerZ,.63,.15,.36,.025);
    const scroll=data();
    for(const sign of[-1,1]){
      const cx=x+sign*.24,cy=3.64;
      // A shallow solid volute cushion with a recessed continuous spiral.
      for(let j=0;j<32;j++){
        const a=j*Math.PI*2/32,b=(j+1)*Math.PI*2/32,r=.123;
        polygon(scroll,[[cx,cy,A.innerZ+.199],[cx+Math.cos(a)*r,cy+Math.sin(a)*r,A.innerZ+.199],[cx+Math.cos(b)*r,cy+Math.sin(b)*r,A.innerZ+.199]],[0,0,1],1);
        polygon(scroll,[[cx,cy,A.innerZ-.199],[cx+Math.cos(a)*r,cy+Math.sin(a)*r,A.innerZ-.199],[cx+Math.cos(b)*r,cy+Math.sin(b)*r,A.innerZ-.199]],[0,0,-1],1);
      }
      for(const face of[-1,1])for(let j=0;j<40;j++){
        const a=j/40*Math.PI*3.7,b=(j+1)/40*Math.PI*3.7,r=.111*(1-j/49),rr=.111*(1-(j+1)/49),width=.008;
        const at=(angle:number,rad:number):V=>[cx+sign*Math.cos(angle)*rad,cy+Math.sin(angle)*rad,A.innerZ+face*.204];
        polygon(scroll,[at(a,r-width),at(a,r+width),at(b,rr+width),at(b,rr-width)],[0,0,face],1,.62);
      }
    }
    mesh(k,'Painted Stoa Ionic volute spirals',scroll,marble);
    box('Ionic abacus',marble,x,3.765,A.innerZ,.79,.07,.47,.008);
    solid(x,1.78,A.innerZ,.48,3.48,.48);
  }

  // All roof loads have visible bearings: outer stone order, rear wall plate,
  // inner Ionic row, longitudinal beam, transverse ties, posts and rafters.
  const roofY=(z:number)=>A.ridge-(A.ridge-A.eave)*Math.abs(z)/A.roofHalfDepth;
  const under=(z:number)=>roofY(z)-.135;
  box('front architrave',limestone,0,3.93,A.frontZ,28,.26,.68);
  box('architrave taenia',red,0,4.075,A.frontZ+.35,28,.045,.045,.003);
  box('frieze bedding',plaster,0,4.245,A.frontZ,28,.31,.64);
  const bay=26.5/11;
  for(let i=0;i<23;i++){
    const x=-13.25+i*bay/2;
    box('Doric triglyph',blue,x,4.245,A.frontZ+.36,.245,.31,.12,.006);
    // Three bars and two recessed channels model the front of each triglyph.
    for(const dx of[-.074,0,.074])box('triglyph raised bar',blue,x+dx,4.245,A.frontZ+.428,.041,.285,.028,.002);
    box('regula',red,x,4.065,A.frontZ+.38,.30,.055,.10,.003);
    for(let n=0;n<6;n++)box('regula gutta',marble,x-.12+n*.048,4.02,A.frontZ+.39,.025,.035,.035,.002);
  }
  box('projecting Doric geison',limestone,0,4.445,A.frontZ,28.30,.105,.92);
  const bearingPlates=data();
  prism(bearingPlates,'x',[0,0,0],27.75,[[A.frontZ-.24,4.4975],[A.frontZ+.24,4.4975],[A.frontZ+.24,under(A.frontZ+.24)],[A.frontZ-.24,under(A.frontZ-.24)]]);
  // Rear and end roof bearings have a quieter profile than the public frieze.
  prism(bearingPlates,'x',[0,0,0],27.64,[[-3.43,4.35],[-3.13,4.35],[-3.13,under(-3.13)],[-3.43,under(-3.43)]]);
  mesh(k,'Painted Stoa fitted front and rear roof bearing plates',bearingPlates,timber);
  box('inner longitudinal beam',timber,0,3.92,A.innerZ,27.55,.24,.28);
  const structural=data();
  for(const x of A.innerColumns){
    box('transverse tie beam',timber,x,3.98,-.08,.20,.24,6.6);
    box('ridge king post',timber,x,(4.10+under(0)-.14)/2,0,.15,under(0)-.14-4.10,.15);
    // A short strut transfers the offset inner row to each ridge support.
    box('inner column bearing block',timber,x,4.08,A.innerZ,.28,.10,.36);
    for(const side of[-1,1])prism(structural,'x',[x,0,0],.17,[[0,under(0)-.20],[side*3.76,under(side*3.76)-.20],[side*3.76,under(side*3.76)],[0,under(0)]],1);
  }
  prism(structural,'x',[0,0,0],27.7,[[-.12,under(0)-.16],[.12,under(0)-.16],[.12,under(.12)],[0,under(0)],[-.12,under(-.12)]],1);
  // Closely spaced smaller rafters visibly support the tile deck.
  for(let i=0;i<47;i++){
    const x=-13.8+i*.60;
    for(const side of[-1,1])prism(structural,'x',[x,0,0],.075,[[0,under(0)-.08],[side*3.78,under(side*3.78)-.08],[side*3.78,under(side*3.78)],[0,under(0)]],.94);
  }
  mesh(k,'Painted Stoa fitted structural roof timbers',structural,timber);
  for(const sign of[-1,1]){
    const gable=data();prism(gable,'x',[sign*13.82,0,0],.36,[[-3.5,4.30],[3.5,4.30],[3.5,under(3.5)],[0,under(0)],[-3.5,under(-3.5)]]);
    mesh(k,'Painted Stoa fitted plastered end gable',gable,plaster);
  }

  // Tile relief is real geometry in two static material batches. Pan tiles,
  // half-round covers, overlapping row ends and ridge caps read from the ground.
  const pans=data(),covers=data(),deck=data(),columns=56,rows=7,pitch=A.roofHalfWidth*2/columns;
  const point=(x:number,z:number,lift:number):V=>[x,roofY(z)+lift,z];
  for(const side of[-1,1]){
    polygon(deck,[point(-14.38,0,-.09),point(14.38,0,-.09),point(14.38,side*3.78,-.09),point(-14.38,side*3.78,-.09)],[0,-1,0],1);
    polygon(pans,[point(-14.38,0,-.012),point(14.38,0,-.012),point(14.38,side*3.78,-.012),point(-14.38,side*3.78,-.012)],[0,1,0],1);
    box('eave fascia',timber,0,A.eave-.085,side*3.78,28.76,.17,.13);
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const x0=-14.38+col*pitch+.009,x1=x0+pitch-.018,z0=side*Math.max(0,row*3.78/rows-.035),z1=side*Math.min(3.80,(row+1)*3.78/rows+.045),lift=.023+(rows-row)*.004,tone=.96+.07*random(row,col);
      polygon(pans,[point(x0,z0,lift),point(x1,z0,lift),point(x1,z1,lift),point(x0,z1,lift)],[0,1,0],1,tone);
      polygon(pans,[point(x0,z1,lift),point(x1,z1,lift),point(x1,z1,lift-.035),point(x0,z1,lift-.035)],[0,0,side],1,tone);
      const cx=x0-.009,rad=.063;
      for(let j=0;j<6;j++){
        const a=j*Math.PI/6,b=(j+1)*Math.PI/6;
        polygon(covers,[point(cx+Math.cos(a)*rad,z0,lift+.02+Math.sin(a)*rad),point(cx+Math.cos(b)*rad,z0,lift+.02+Math.sin(b)*rad),point(cx+Math.cos(b)*rad,z1,lift+.02+Math.sin(b)*rad),point(cx+Math.cos(a)*rad,z1,lift+.02+Math.sin(a)*rad)],[0,1,0],1,tone);
      }
    }
    // The open eave course remains a sequence of clay tile ends, not a flat lip.
    for(let col=0;col<columns;col++)box('eave cover tile end',clayLight,-14.38+(col+.5)*pitch,A.eave+.075,side*3.79,.13,.13,.055,.009);
  }
  for(let col=0;col<columns;col++){
    const start=-14.38+col*pitch,end=start+pitch+.035;
    for(let j=0;j<8;j++){
      const a=j*Math.PI/8,b=(j+1)*Math.PI/8,at=(x:number,angle:number):V=>[x,A.ridge+.045+Math.sin(angle)*.12,Math.cos(angle)*.12];
      polygon(covers,[at(start,a),at(end,a),at(end,b),at(start,b)],[0,1,0],1);
    }
  }
  mesh(k,'Painted Stoa continuous timber roof underside',deck,timber);
  mesh(k,'Painted Stoa overlapping terracotta pan tiles',pans,clay);
  mesh(k,'Painted Stoa half-round cover tiles and ridge caps',covers,clayLight);

  // Retain the original long rear seat position and original floor/approach.
  box('rear stone bench',limestone,0,.43,-2.85,26.8,.14,.62);
  for(const x of[-12.8,12.8])box('bench support',limestone,x,.20,-2.85,.25,.4,.55);
  solid(0,.43,-2.85,26.8,.14,.62);
  for(const painting of PAINTED_STOA_PAINTINGS){
    const centreY=2.2,z=-3.095,bottom=centreY-painting.height/2,top=centreY+painting.height/2;
    box(painting.id+' panel support',timber,painting.x,centreY,z,painting.width+.10,painting.height+.10,.055,.006);
    box(painting.id+' lower mounting rail',timber,painting.x,bottom-.025,z+.025,painting.width+.15,.065,.085,.004);
    const pigment=material(k.p.plaster,painting.id+' modern interpreted painting',[1,1,1],painting.path);pigment.roughness=1;
    const t=pigment.albedoTexture;t.wrapU=t.wrapV=0;t.uScale=t.vScale=1;
    const p=data(),half=painting.width/2;
    polygon(p,[[painting.x-half,bottom,z+.032],[painting.x+half,bottom,z+.032],[painting.x+half,top,z+.032],[painting.x-half,top,z+.032]],[0,0,1],1);
    p.uv=[0,0,1,0,1,1,0,1];mesh(k,'Painted Stoa '+painting.id+' modern historical interpretation',p,pigment);
  }
  const root=k.finish(plan,groundY,parent,['paintedStoa','doricExterior','ionicInterior','twoPublicAisles','modelledOverlappingTiles','fittedTimberRoof','fourInterpretedPaintingSubjects']);
  root.metadata.collisionBoxes=solids;
  root.metadata.floorPlanes=[{x:0,z:0,hx:14,hz:3.5,top:.05}];
  root.metadata.paintedStoa={version:2,architecture:A,paintings:PAINTED_STOA_PAINTINGS,ownMaterials:own.length,newTexturePaths:[...new Set([...textures.keys()].map(s=>s.split(':')[0]))],
    source:'Native existing architecture Builder; replaces only the painted-stoa branch',
    evidence:{orders:'Excavated exterior Doric and interior Ionic; smooth limestone inner shafts and simple marble disk bases',paintings:'Pausanias 1.15; subjects documented, compositions lost'},
    interpretation:'Compressed game reconstruction; column counts, elevations, carpentry and modern painted compositions are not an exact archaeological restoration',
    publicRoutes:{front:[[-13,2.2],[13,2.2]],rear:[[-12.6,-2.1],[12.6,-2.1]],crossing:[[0,2.2],[0,-2.1]]},
    sharedMaterialsChanged:false,terrainChanged:false,actorsChanged:false,newFrameUpdates:0,review:'Requires actual player-height, roof, artwork and held-input collision QA'};
  const ledger=k.scene.metadata?.districtStreaming?.resources;
  if(ledger){
    const id='agora-painted-stoa-v2';
    ledger.register({id,owner:'BabylonPaintedStoa.ts',residency:'essential',reason:'The one upgraded civic porch, local finish maps and interpreted paintings retain the canonical Agora lifecycle; existing shared floor and palette remain borrowed',dependencies:[],validationRoute:'painted-stoa-two-aisles-market-and-athens-return'});
    const scope=ledger.scope(id);let closing=false;
    // Own materials separately, with texture release disabled; local image
    // wrappers have their own exact ownership and shared maps are never freed.
    for(const m of k.scene.materials)if(!previousMaterials.has(m))scope.own(m,(owned:any)=>owned.dispose(false,false),'material');
    for(const t of k.scene.textures)if(!previousTextures.has(t))scope.own(t,(owned:any)=>owned.dispose(),'texture');
    scope.ownComposite(root,(owned:any)=>{if(closing)return;closing=true;if(!owned.isDisposed())owned.dispose(false,false);},[root]);
    const close=()=>{if(closing)return;closing=true;scope.dispose();ledger.unregister(id);};
    const rootObserver=root.onDisposeObservable.add(close),sceneObserver=k.scene.onDisposeObservable.add(close);
    scope.defer(()=>{root.onDisposeObservable.remove(rootObserver);k.scene.onDisposeObservable.remove(sceneObserver);});
    scope.defer(()=>ledger.unregister(id));
    root.metadata.paintedStoa.residencyOwner=id;
  }
  return root;
}
