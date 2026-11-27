/** Static staging adapter for the existing architectural G operations. It emits
 * one native mesh per material without allocating a Babylon mesh per block.
 * All position/normal/UV/colour/index data is retained; there is no LOD or
 * simplification. The staging arrays are relinquished immediately after flush.
 */
export function createBouleuterionCollector(native,G){
 const groups=new Map();let pieces=0,vertices=0,triangles=0,flushed=false;
 const collector={box(name,x,y,z,w,h,d,material){
  if(flushed)throw Error('Council geometry already flushed');
  const attributes={},stub={name,setVerticesData(kind,values){attributes[kind]=values;},setIndices(values){attributes.indices=values;},refreshBoundingInfo(){
   const p=attributes.position,n=attributes.normal,uv=attributes.uv,c=attributes.color,ix=attributes.indices;
   if(!p||!n||!uv||!c||!ix||p.length%3||n.length!==p.length||uv.length!==p.length/3*2||c.length!==p.length/3*4)throw Error('Incomplete council geometry: '+name);
   let target=groups.get(material);if(!target){target=G.data();groups.set(material,target);}const offset=target.p.length/3;
   for(const [dest,source]of[[target.p,p],[target.n,n],[target.uv,uv],[target.c,c]])for(const value of source){if(!Number.isFinite(value))throw Error('Non-finite council geometry: '+name);dest.push(value);}
   for(const value of ix){if(!Number.isInteger(value)||value<0||value>=p.length/3)throw Error('Invalid council index: '+name);target.ix.push(value+offset);}
   pieces++;vertices+=p.length/3;triangles+=ix.length/3;
   for(const key of Object.keys(attributes))delete attributes[key];
  }};return stub;
 }};
 return {builder:collector,flush(){if(flushed)throw Error('Council geometry flushed twice');flushed=true;const meshes=groups.size;for(const [material,data]of groups)G.mesh(native,'New Bouleuterion / '+material.name,data,material);groups.clear();return {pieces,vertices,triangles,meshes,stagingReleased:true,allAttributesPreserved:true};}};
}
