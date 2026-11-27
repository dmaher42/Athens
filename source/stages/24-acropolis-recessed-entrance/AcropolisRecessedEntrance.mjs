// Dimensions are in world metres. The first flight is tucked west/south
// into the existing bank, with a feather to the untouched upper ascent.
export const entrance = Object.freeze({
  upperJoinZ: 13.0,
  oldStreetZ: 30.0,
  setBack: 5.6,
  westShift: 2.4,
  entranceWidthScale: .63,
  oldCentreX: -160,
  roadEdgeZ: 30.45,
});

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (low, high, value) => {
  const t = clamp((value-low)/(high-low));
  return t*t*(3-2*t);
};
const lerp = (a,b,t) => a+(b-a)*t;

export function recessedStairPoint(x,z) {
  const moved = smooth(entrance.upperJoinZ,entrance.oldStreetZ,z);
  if(!moved) return [x,z];
  const width = lerp(1,entrance.entranceWidthScale,moved);
  const centre = entrance.oldCentreX - .35*(1-smooth(13,18,z));
  return [
    centre + (x-centre)*width - entrance.westShift*moved,
    z - entrance.setBack*moved,
  ];
}

export function seatRecessedLandingProp(object) {
  const {x,z}=object.position;
  const moved=smooth(entrance.upperJoinZ,entrance.oldStreetZ,z);
  if(!moved)return;
  const [u,v]=recessedStairPoint(x,z);
  object.position.x=u;
  object.position.z=v;
  object.scale.x*=lerp(1,entrance.entranceWidthScale,moved);
  object.scale.z*=lerp(1,entrance.entranceWidthScale,moved);
}

function closestOnPath(x,z,path) {
  let best = null;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz));
    const distance=Math.hypot(x-lerp(a.x,b.x,t),z-lerp(a.z,b.z,t));
    if(!best||distance<best.distance) best={distance,height:lerp(a.y,b.y,t),moved:lerp(a.moved,b.moved,t)};
  }
  return best;
}

// Across the curve, a nearest-centre query can choose a higher stair station
// on the east edge. The lower east tread lane needs a transverse floor cap,
// feathered into the same bank before the neighbouring building.
function crossSection(z,stairs) {
  for(let i=1;i<stairs.length;i++){
    const a=stairs[i-1],b=stairs[i];
    if(z<b.z)continue;
    const t=clamp((a.z-z)/(a.z-b.z));
    return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),moved:lerp(a.moved,b.moved,t)};
  }
  return stairs.at(-1);
}

export function gradeRecessedStairEntrance(positions,indices,indexHeight,path,fit) {
  const stairs=path.filter(row=>row[1]>=entrance.upperJoinZ-1&&row[1]<=entrance.oldStreetZ+.01)
    .map(([x,z,height])=>{
      const [u,v]=recessedStairPoint(x,z);
      return {x:u,z:v,y:fit.footY+(height-4)*fit.ratio,moved:smooth(entrance.upperJoinZ,entrance.oldStreetZ,z)};
    });
  if(stairs.length<12)throw Error('The retained lower stair is missing its terrain profile');
  const foot=stairs[0], raw=indexHeight(positions,indices);
  const edgeHeight=raw(foot.x,entrance.roadEdgeZ+.20);
  if(!Number.isFinite(edgeHeight))throw Error('The recessed entrance needs its existing street shoulder');
  const changes=[];
  let maximumCut=0,maximumFill=0;
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    if(x< -170.5||x> -155||z<entrance.upperJoinZ||z>=entrance.roadEdgeZ)continue;
    const near=closestOnPath(x,z,stairs);
    const lowerZ=1-smooth(foot.z,foot.z+1.35,z);
    const half=4.25*lerp(1,entrance.entranceWidthScale,near.moved);
    const channel=(1-smooth(half,half+2.1,near.distance))*lowerZ*smooth(13,17,z);
    const walkAcross=1-smooth(2.04,3.8,Math.abs(x-foot.x));
    const walk=walkAcross*smooth(foot.z-1.55,foot.z+.35,z)*(1-smooth(entrance.roadEdgeZ-1.15,entrance.roadEdgeZ,z));
    const approachY=lerp(foot.y-.035,edgeHeight,clamp((z-foot.z)/(entrance.roadEdgeZ-foot.z)));
    const bed=near.height-.20;
    const fitted=y+(bed-y)*channel;
    let next=fitted+(approachY-fitted)*walk;
    if(z>15&&z<24.4){
      const section=crossSection(z,stairs),offset=x-section.x;
      const side=4.46*lerp(1,entrance.entranceWidthScale,section.moved);
      const cheek=smooth(.20,.80,offset)*(1-smooth(side+.85,side+2.5,offset))
        *smooth(15,17,z)*(1-smooth(23.4,24.4,z))*(1-smooth(-156.8,-155.6,x));
      next+=Math.min(0,section.y-.40-next)*cheek;
    }
    if(Math.abs(next-y)<=.0001)continue;
    maximumCut=Math.max(maximumCut,y-next);
    maximumFill=Math.max(maximumFill,next-y);
    changes.push([i+1,next]);
  }
  for(const [i,next]of changes)positions[i]=next;
  return {vertices:changes.length,maximumCut,maximumFill,foot,edgeHeight,upperJoinZ:entrance.upperJoinZ, protectedRoadZ:entrance.roadEdgeZ};
}
