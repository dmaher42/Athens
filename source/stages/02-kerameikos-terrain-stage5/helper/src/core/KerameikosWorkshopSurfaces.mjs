// Extend only the two existing compacted-earth floors. Keep every vertex,
// normal, UV, triangle and collider, and all vertical edges with native material.
export function integrateWorkshopSurfaces(scene,api,terrain,own,SubMesh){
 const Material=terrain.material.constructor,variant=api.variants.find(v=>v.sourceIndex===1),result=[];
 for(const id of ['workshop','firing-yard']){
  const name='master-potter-'+id+' / babylonCityGroundMat',mesh=scene.getMeshByName(name);if(!mesh||mesh.material!==variant.source)throw Error('Original workshop earth owner required: '+name);const p=mesh.getVerticesData('position'),n=mesh.getVerticesData('normal'),ix=mesh.getIndices();if(p.length!==72||ix.length!==36)throw Error('Resurvey changed workshop floor geometry');const originalMaterial=mesh.material,originalGroups=mesh.subMeshes.map(s=>({materialIndex:s.materialIndex,start:s.indexStart,count:s.indexCount})),multi=own.own(new Material('Kerameikos terrain / '+id+' floor materials',scene),'material',m=>m.dispose(false,false,false));multi.subMaterials.push(originalMaterial,variant.material);const ranges=[];
  for(let j=0;j<ix.length;j+=3){const top=[ix[j],ix[j+1],ix[j+2]].every(v=>n[v*3+1]>.99),materialIndex=top?1:0,last=ranges.at(-1);if(last&&last.materialIndex===materialIndex)last.count+=3;else ranges.push({materialIndex,start:j,count:3});}
  if(ranges.filter(r=>r.materialIndex===1).reduce((n,r)=>n+r.count,0)!==6)throw Error('Exactly the two original upward floor triangles must be adapted');mesh.material=multi;mesh.releaseSubMeshes();for(const r of ranges)new SubMesh(r.materialIndex,0,mesh.getTotalVertices(),r.start,r.count,mesh);result.push({name,mesh,originalMaterial,originalGroups,multi,ranges,topSubMeshes:mesh.subMeshes.filter(s=>s.materialIndex===1)});
 }
 const sync=()=>{for(const r of result)for(const s of r.topSubMeshes){const next=api.enabled?1:0;if(s.materialIndex!==next){s.materialIndex=next;s.resetDrawCache();}}};
 const dispose=()=>{for(const r of result){r.mesh.material=r.originalMaterial;r.mesh.releaseSubMeshes();for(const g of r.originalGroups)new SubMesh(g.materialIndex,0,r.mesh.getTotalVertices(),g.start,g.count,r.mesh);}};
 return{rows:result,sync,dispose,state:()=>result.map(r=>({name:r.name,topTriangles:2,originalVertices:r.mesh.getTotalVertices(),originalTriangles:r.mesh.getTotalIndices()/3,positionsChanged:0,collisionChanged:false,verticalFacesNative:true,pavingChanged:false,enabled:api.enabled}))};
}
