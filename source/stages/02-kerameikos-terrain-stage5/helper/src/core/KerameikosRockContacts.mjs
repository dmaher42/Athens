import {nearestOnRoad,smooth,noise} from './terrain/TerrainPlan.mjs';

/** Read the existing rock/soil contact; never change its geometry or material. */
export function nativeForecourtRockContacts(scene){
 const terrain=scene.getMeshByName('athensCanonicalTerrain'),p=terrain.getVerticesData('position'),ix=terrain.getIndices(),edges=new Map(),region={west:-285,east:-195,south:-29,north:22};
 const material=terrain.material.subMaterials[3];
 if(!material||!/rock/i.test(material.name))throw Error('Native preserved-rock material changed; resurvey the forecourt');
 let triangles=0;
 for(const g of terrain.subMeshes){if(g.materialIndex!==3)continue;
  for(let i=g.indexStart;i<g.indexStart+g.indexCount;i+=3){
   const ids=[ix[i],ix[i+1],ix[i+2]],xs=ids.map(id=>p[id*3]),zs=ids.map(id=>p[id*3+2]);
   if(Math.max(...xs)<region.west-24||Math.min(...xs)>region.east+24||Math.max(...zs)<region.south-24||Math.min(...zs)>region.north+24)continue;
   triangles++;
   for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=Math.min(a,b)+','+Math.max(a,b),old=edges.get(key);if(old)old.count++;else edges.set(key,{count:1,a:{x:p[a*3],z:p[a*3+2]},b:{x:p[b*3],z:p[b*3+2]}});}
  }
 }
 const segments=[],cells=new Map(),cell=8;
 for(const e of edges.values()){
  if(e.count!==1)continue;
  const x=(e.a.x+e.b.x)/2,z=(e.a.z+e.b.z)/2;
  if(x<region.west-3||x>region.east+3||z<region.south-3||z>region.north+3)continue;
  if(Math.hypot(e.a.x-e.b.x,e.a.z-e.b.z)>20)throw Error('Unexpected coarse forecourt rock edge; resurvey before blending');
  const points=[e.a,e.b];segments.push(points);
  for(let cx=Math.floor((Math.min(e.a.x,e.b.x)-3.2)/cell);cx<=Math.floor((Math.max(e.a.x,e.b.x)+3.2)/cell);cx++)for(let cz=Math.floor((Math.min(e.a.z,e.b.z)-3.2)/cell);cz<=Math.floor((Math.max(e.a.z,e.b.z)+3.2)/cell);cz++){const key=cx+','+cz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(points);}
 }
 return{metadata:{material:material.name,materialIndex:3,nearbyTriangles:triangles,boundaryEdges:segments.length,rockGeometryChanged:false,rockMaterialChanged:false},near(x,z){let distance=Infinity;for(const points of cells.get(Math.floor(x/cell)+','+Math.floor(z/cell))??[])distance=Math.min(distance,nearestOnRoad(x,z,points).distance);return 1-smooth(.35,2.75,Math.max(0,distance+(noise(x/.9,z/.9,141)-.5)*.35));}};
}
