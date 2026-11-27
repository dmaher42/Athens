/** Conservative material selection from the approved factory's static mask.
 * A triangle remains native only when its complete texture-space bounding box,
 * including a two-texel bilinear/rounding guard, contains no contribution. */
export function makeCoverageQuery(control,bounds){
 const {width,height,pixels}=control;
 if(!(width>0&&height>0&&pixels.length===width*height*4&&bounds.east>bounds.west&&bounds.north>bounds.south))throw Error('Invalid terrain coverage atlas');
 const stride=width+1,sums=new Uint32Array(stride*(height+1));
 for(let z=0;z<height;z++){
  let row=0;
  for(let x=0;x<width;x++){
   row+=pixels[(z*width+x)*4+3]>0?1:0;
   sums[(z+1)*stride+x+1]=sums[z*stride+x+1]+row;
  }
 }
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 return(minX,maxX,minZ,maxZ)=>{
  const x0=clamp(Math.floor((minX-bounds.west)/(bounds.east-bounds.west)*width)-2,width-1),x1=clamp(Math.ceil((maxX-bounds.west)/(bounds.east-bounds.west)*width)+2,width-1);
  const z0=clamp(Math.floor((minZ-bounds.south)/(bounds.north-bounds.south)*height)-2,height-1),z1=clamp(Math.ceil((maxZ-bounds.south)/(bounds.north-bounds.south)*height)+2,height-1);
  return sums[(z1+1)*stride+x1+1]-sums[z0*stride+x1+1]-sums[(z1+1)*stride+x0]+sums[z0*stride+x0]>0;
 };
}
