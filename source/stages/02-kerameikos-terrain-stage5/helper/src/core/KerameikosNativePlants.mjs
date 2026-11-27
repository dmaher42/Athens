// Full native specimens, statically combined by material and 64m spatial cell.
// All original vertices/UVs/triangles/variants remain; no simplification or cards.
export function batchNativePlants(scene,batches,origin){
 const result=[],groups=new Map();for(const b of batches){if(b.kind==='pebble'){result.push(b);continue;}for(const item of b.items){const cell=Math.floor(item.x/64)+','+Math.floor(item.z/64),key=b.kind+'/'+cell;if(!groups.has(key))groups.set(key,{kind:b.kind,cell,cellSize:64,items:[],material:b.source.material,bakedNativePlants:true});const row=groups.get(key);if(row.material!==b.source.material)throw Error('Preserve distinct native plant materials');row.items.push({...item,sourcePrototype:b.source.name});}}
 for(const b of groups.values()){
  const p=[],n=[],uv=[],ix=[];for(const item of b.items){const source=scene.getMeshByName(item.sourcePrototype),sp=source.getVerticesData('position'),sn=source.getVerticesData('normal'),su=source.getVerticesData('uv'),si=source.getIndices(),offset=p.length/3,c=Math.cos(item.yaw),s=Math.sin(item.yaw),scale=item.scale;
   for(let j=0;j<sp.length;j+=3){p.push((c*sp[j]+s*sp[j+2])*scale+item.x-origin[0],sp[j+1]*scale+item.y,(-s*sp[j]+c*sp[j+2])*scale+item.z-origin[1]);n.push(c*sn[j]+s*sn[j+2],sn[j+1],-s*sn[j]+c*sn[j+2]);}
   for(const v of su)uv.push(v);for(const v of si)ix.push(v+offset);
  }
  b.geometry={p:Float32Array.from(p),n:Float32Array.from(n),uv:Float32Array.from(uv),ix:Uint32Array.from(ix)};result.push(b);
 }
 return result;
}
