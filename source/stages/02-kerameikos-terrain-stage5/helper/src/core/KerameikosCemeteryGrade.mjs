import survey from './KerameikosCemeterySurvey.json';
import {reliefAt,protectedTriangleVertices,nearestOnRoad} from './terrain/TerrainPlan.mjs';
export {survey as cemeterySurvey};
// The native height index retains this position buffer. Grade before its native
// normals/upload, without creating another height interface or Babylon objects.
export function gradeCemeteryTerrain(scene,p,ix){
 if(scene.metadata?.kerameikosCemeteryGrade)throw Error('Cemetery already graded');
 const b=survey.bounds,local=[],boundary=new Set();
 for(let i=0;i<ix.length;i+=3){const ids=[ix[i],ix[i+1],ix[i+2]],xs=ids.map(j=>p[j*3]),zs=ids.map(j=>p[j*3+2]);if(Math.max(...xs)<b.west||Math.min(...xs)>b.east||Math.max(...zs)<b.south||Math.min(...zs)>b.north)continue;local.push(...ids);if(ids.some(j=>p[j*3]<b.west||p[j*3]>b.east||p[j*3+2]<b.south||p[j*3+2]>b.north))for(const j of ids)boundary.add(j);}
 const protect=protectedTriangleVertices(p,local,{roads:[],foundations:survey.footings});for(const r of survey.roads)for(const id of protectedTriangleVertices(p,local,{roads:r.points,foundations:[]}))protect.add(id);for(const id of boundary)protect.add(id);
 const ctx={patch:survey.patch,profile:'kerameikos',foundations:survey.footings,nearestRoad:(x,z)=>({distance:Math.min(...survey.roads.map(r=>nearestOnRoad(x,z,r.points).distance))})},changes=[];
 for(let id=0;id<p.length/3;id++){const x=p[id*3],z=p[id*3+2];if(protect.has(id)||x<b.west||x>b.east||z<b.south||z>b.north)continue;const before=p[id*3+1],after=Math.fround(before+reliefAt(x,z,ctx));if(before!==after)changes.push({id,x,z,before,after,delta:after-before});}
 if(JSON.stringify(changes)!==JSON.stringify(survey.changes))throw Error('Cemetery geometry no longer matches the GPU-verified survey; resurvey before grading');
 for(const c of changes)p[c.id*3+1]=c.after;
 scene.metadata??={};const state={prototype:'terrain-study-bdab992b116f',bounds:b,changes,maxAbsDelta:survey.maxAbsDelta,originalTopology:true,originalHeightIndex:true,essentialNativeTerrain:true,protectedVertices:protect.size};scene.metadata.kerameikosCemeteryGrade=state;return state;
}
