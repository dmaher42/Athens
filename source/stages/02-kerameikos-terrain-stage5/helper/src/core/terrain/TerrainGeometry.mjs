import {hash} from './TerrainPlan.mjs';
export function normalsFor(p,ix){const n=new Float32Array(p.length);for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]],v=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];for(const j of[a,b,c]){n[j]+=v[0];n[j+1]+=v[1];n[j+2]+=v[2];}}for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}return n;}
// Same barycentric triangle contract as BabylonTriangleHeight.ts, indexed at 4m.
export function triangleHeight(p,ix,cell=4){const map=new Map();for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;for(let x=Math.floor(Math.min(p[a],p[b],p[c])/cell);x<=Math.floor(Math.max(p[a],p[b],p[c])/cell);x++)for(let z=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/cell);z<=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/cell);z++){const key=x+','+z;let list=map.get(key);if(!list){list=[];map.set(key,list);}list.push(i);}}
  return(x,z)=>{let h=null;for(const i of map.get(Math.floor(x/cell)+','+Math.floor(z/cell))??[]){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,d=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);if(Math.abs(d)<1e-10)continue;const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/d,v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/d;if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001){const y=u*p[a+1]+v*p[b+1]+(1-u-v)*p[c+1];h=h===null?y:Math.max(h,y);}}return h;};
}
export function refineTriangles(source,indices,relief,divisions=2){const p=[],ix=[],uv=[],keys=new Map();const vertex=(a,b,c,u,v)=>{const w=1-u-v,x=source[a]*w+source[b]*u+source[c]*v,z=source[a+2]*w+source[b+2]*u+source[c+2]*v,key=Math.round(x*1e6)+','+Math.round(z*1e6);if(keys.has(key))return keys.get(key);const y=source[a+1]*w+source[b+1]*u+source[c+1]*v+relief(x,z),n=p.length/3;p.push(x,y,z);uv.push(x/8,z/8);keys.set(key,n);return n;};
  for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;for(let u=0;u<divisions;u++)for(let v=0;v<divisions-u;v++){const q=vertex(a,b,c,u/divisions,v/divisions),r=vertex(a,b,c,(u+1)/divisions,v/divisions),s=vertex(a,b,c,u/divisions,(v+1)/divisions);ix.push(q,r,s);if(u+v<divisions-1)ix.push(r,vertex(a,b,c,(u+1)/divisions,(v+1)/divisions),s);}}
  return {p:new Float32Array(p),ix:new Uint32Array(ix),uv:new Float32Array(uv),n:normalsFor(p,ix)};
}
function empty(){return {p:[],ix:[],uv:[],c:[]};}
function tri(d,a,b,c,tint=[1,1,1]){const i=d.p.length/3;d.p.push(...a,...b,...c);d.ix.push(i,i+2,i+1);d.uv.push(0,0,1,0,.5,1);for(let j=0;j<3;j++)d.c.push(...tint,1);}
function card(d,c,w,h,yaw,tile=0){const right=[Math.cos(yaw)*w/2,0,Math.sin(yaw)*w/2],p=[[-1,-1],[1,-1],[1,1],[-1,1]],i=d.p.length/3;for(const [x,y]of p){d.p.push(c[0]+right[0]*x,c[1]+y*h/2,c[2]+right[2]*x);d.c.push(1,1,1,1);}d.ix.push(i,i+2,i+1,i,i+3,i+2);const col=tile%2,row=Math.floor(tile/2),u=col*.5+.006,v=1-(row+1)*.5+.006;d.uv.push(u,v,u+.488,v,u+.488,v+.488,u,v+.488);}
export function detailGeometry(kind){const d=empty();
  if(kind==='pebble'||kind==='outcrop'){
    const sides=kind==='outcrop'?11:7,rings=[[-.10,.72],[.10,1],[.36,.73],[.51,.24]];
    const point=(r,j)=>{const a=j/sides*Math.PI*2,rad=rings[r][1]*(.87+hash(j,r,5)*.24);return [Math.cos(a)*rad,rings[r][0]+Math.sin(a*3+r)*.026,Math.sin(a)*rad*.72];};
    for(let r=1;r<rings.length;r++)for(let j=0;j<sides;j++){const a=point(r-1,j),b=point(r-1,(j+1)%sides),c=point(r,(j+1)%sides),e=point(r,j);tri(d,a,b,c,[.86+r*.035,.86+r*.035,.82+r*.035]);tri(d,a,c,e,[.90,.90,.87]);}
    for(let j=0;j<sides;j++)tri(d,point(rings.length-1,j),point(rings.length-1,(j+1)%sides),[.035,.535,-.018],[.98,.97,.92]);
  }else if(kind==='grass'||kind==='flower'){
    for(let j=0;j<(kind==='grass'?7:5);j++){const a=j*2.399,r=.04+hash(j,1,2)*.12,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.18+hash(j,2,3)*.26,dx=Math.cos(a+.6)*.035,dz=Math.sin(a+.6)*.035,t=[.63+hash(j,1,7)*.23,.63+hash(j,2,7)*.14,.34+hash(j,3,7)*.12];tri(d,[x-dx,-.015,z-dz],[x+dx,-.015,z+dz],[x+dx*.5+Math.cos(a)*.06,h*.64,z+dz*.5],t);tri(d,[x-dx,-.015,z-dz],[x+dx*.5+Math.cos(a)*.06,h*.64,z+dz*.5],[x+Math.cos(a)*.12,h,z+Math.sin(a)*.06],t);
      if(kind==='flower')for(let k=0;k<5;k++){const angle=k*Math.PI*2/5,rr=.024;tri(d,[x,h,z],[x+Math.cos(angle)*rr,h+.008,z+Math.sin(angle)*rr],[x+Math.cos(angle+.7)*rr,h+.013,z+Math.sin(angle+.7)*rr],[.94,.78,.35]);}
    }
  }else{
    for(let j=0;j<14;j++){const a=j*2.399,r=.12+hash(j,2,22)*.22,h=.13+hash(j,5,33)*.33;card(d,[Math.cos(a)*r,h,Math.sin(a)*r],.30,.25,a,0);}
  }
  // Metre-scaled rock UVs; plant cards retain their actual local atlas layout.
  if(kind==='pebble'||kind==='outcrop')for(let i=0;i<d.p.length/3;i++){d.uv[i*2]=d.p[i*3];d.uv[i*2+1]=d.p[i*3+2];}
  return {...d,n:normalsFor(d.p,d.ix)};
}
export function instanceMatrix(item,origin){const s=item.scale,c=Math.cos(item.yaw),n=Math.sin(item.yaw);return [s*c,0,-s*n,0,0,s,0,0,s*n,0,s*c,0,item.x-origin[0],item.y,item.z-origin[1],1];}
