// Scale-comparable Pompeion: northeast corner restored after the approved
// relocation of the adjacent ordinary houses. Southern road cut-out remains.
export const POMPEION_SCALE_PLAN=Object.freeze({
 status:'first-district-implemented-owner-acceptance-pending',
 scholarlyOverallReference:{length:55.3,width:30,approximate:true},
 mainBody:{west:-275,east:-223,south:-19.2,north:5.8},
 // Retain the southern Sacred Gate bend; the former house no longer clips the north range.
 eastWing:{west:-230.6,east:-223,south:-16.4,north:5.8},
 courtyard:{west:-268.3,east:-233.5,south:-16.6,north:-1},
 propylon:{backX:-223,frontX:-219.7,centreZ:-6.5,width:6.8,columns:4,columnOffsets:[-2.95,-1.6,1.6,2.95],plinthWidth:.58},
 entrance:{centreZ:-6.5,clearWidth:2.7,outerRamp:{innerX:-219.6,outerX:-216.8,width:3.2},maxRampGradient:.10},
 publicPassage:{owner:'potter-wall-household-walk',x:-242,width:3.2,clearHeight:3.2,northRamp:{innerZ:5.7,outerZ:8.6},southRamp:{innerZ:-19.1,outerZ:-21.2}},
 roofOverhang:.4,
 floor:{kind:'continuous-eastward-plane',slopeX:-.019,fitToActualTerrain:true,maxAbsSlope:.025,minimumClearance:.045,centralCrossingsFlush:true},
 humanDetails:{courtyardColumnHeight:4,frontColumnHeight:4.15,shaftDiameter:.46,roomDoorWidth:1.2,roomDoorHeight:2.5,maxStepRise:.15,minStepTread:.30,clearGalleryWidth:2.3},
 banquetRooms:{count:6,north:4,west:2,minDepth:3.6},
 requiredLocalPropMoves:[{owner:'PLAZA_HERMS',from:[-263,5],to:[-276,5]},{owner:'PLAZA_HOROI',from:[-237,6],to:[-237,7.3]}],
 relocatedHouseId:'gate-avenue-south-0',
 protectedOwners:['CITY_GATES','CITY_GATE_ROUTES','DIPYLON_AGORA_AVENUE','SACRED_GATE_CITY_ROAD','WALL_RUNS'],
});
export function pompeionPlanContains(x,z,p=POMPEION_SCALE_PLAN){
 const b=p.mainBody;if(x<b.west||x>b.east||z<b.south||z>b.north)return false;
 return x<=p.eastWing.west||(z>=p.eastWing.south&&z<=p.eastWing.north);
}
export function pompeionPlanSamples(step=1,p=POMPEION_SCALE_PLAN){
 const b=p.mainBody,xs=[],zs=[];for(let x=b.west;x<b.east;x+=step)xs.push(x);xs.push(b.east);for(let z=b.south;z<b.north;z+=step)zs.push(z);zs.push(b.north);
 xs.push(p.eastWing.west);zs.push(p.eastWing.south,p.eastWing.north);
 return xs.flatMap(x=>zs.filter(z=>pompeionPlanContains(x,z,p)).map(z=>[x,z]));
}
export function fitPompeionFloorPlane(sample,p=POMPEION_SCALE_PLAN){
 const points=pompeionPlanSamples(1,p),heights=points.map(([x,z])=>sample(x,z)),west=p.mainBody.west;
 let slope=p.floor.slopeX;
 if(p.floor.fitToActualTerrain){const mx=points.reduce((n,a)=>n+a[0],0)/points.length,my=heights.reduce((n,y)=>n+y,0)/points.length;let cov=0,variance=0;for(let i=0;i<points.length;i++){const dx=points[i][0]-mx;cov+=dx*(heights[i]-my);variance+=dx*dx;}slope=Math.max(-p.floor.maxAbsSlope,Math.min(p.floor.maxAbsSlope,cov/variance));}
 const intercept=Math.max(...points.map(([x,z],i)=>heights[i]-slope*(x-west)))+p.floor.minimumClearance;
 const at=(x,z)=>intercept+slope*(x-west);
 const r=p.entrance.outerRamp,z=p.entrance.centreZ,street=sample(r.outerX,z),rise=at(r.innerX,z)-street,run=r.outerX-r.innerX;
 return {at,westDatum:intercept,slopeX:slope,entrance:{streetY:street,finishedFloorY:at(r.innerX,z),rise,run,gradient:rise/run},maxFloorAboveTerrain:Math.max(...points.map(([x,z])=>at(x,z)-sample(x,z)))};
}
