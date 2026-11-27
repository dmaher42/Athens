import survey from './KerameikosWallSurvey.json';
import {smooth,noise,nearestOnRoad} from './terrain/TerrainPlan.mjs';
import {DIPYLON_ACADEMY} from '../district-reference/world/cityGatesLayout.js';
export const WALL_BOUNDS=Object.freeze({west:-338,east:-273,south:72,north:178});
export const WALL_PATCH=Object.freeze({x:-305.5,z:125,width:65,depth:106,feather:6,cell:32});
export const WALL_ROADS=[{id:'existing-academy-connection',width:4,points:DIPYLON_ACADEMY}];
export const WALL_FOOTINGS=survey.wallRecords.map(r=>({id:r.id,x:r.x,z:r.z,w:r.length,d:r.depth,rotation:r.rotation}));
const road=DIPYLON_ACADEMY.map(p=>({x:p[0],z:p[1]}));
const farmPaths=[survey.farm1Site.path,survey.farm2Site.approach].map(points=>points.map(p=>({x:p[0],z:p[1]})));
const box=(x,z,b,f)=>smooth(0,f,Math.min(x-b.west,b.east-x,z-b.south,b.north-z));
export function wallCoverage(x,z){const limit=box(x,z,WALL_BOUNDS,4);if(!limit)return 0;const retainedFarmApproach=Math.min(...farmPaths.map(p=>nearestOnRoad(x,z,p).distance));if(retainedFarmApproach<=2.2)return 0;const wall=(1-smooth(.8,4.8,Math.abs(x+279)))*box(x,z,{west:-285,east:-273,south:72,north:178},3),r=nearestOnRoad(x,z,road),route=1-smooth(2.3,6.4,r.distance);return limit*Math.max(wall,route)*smooth(2.2,4.5,retainedFarmApproach);}
export function wallControl(x,z,nearest){const r=nearest(x,z),tread=1-smooth(1.8,3.2,r.rawDistance),base=1-smooth(1,4,Math.abs(x+279)),grain=noise(x/3.7,z/4.1,181);return{wear:Math.max(.12+grain*.16,tread*.94),gravel:.16+grain*.18+base*.27,rock:smooth(.62,.88,noise(x/5,z/5,184))*(1-tread)*.16};}
export function assertWallContract(scene){const m=scene.getMeshByName('BabylonGatePompeionDistrict')?.metadata;if(!m?.walls||m.outerLandscape?.status!=='ready')throw Error('Native wall/country landscape required');for(const old of survey.wallRecords){const current=m.walls.records.find(r=>r.id===old.id);if(!current||['x','z','length','rotation','depth','bottom','top'].some(k=>Math.abs(current[k]-old[k])>1e-8))throw Error('Native wall footprint changed: '+old.id);}for(const k of ['grass','shrubs','trees'])if(m.outerLandscape.plan[k].length!==survey.nativePlantsCount[k])throw Error('Retained countryside planting contract changed');const one=scene.metadata.farmstead1.getState().site,two=scene.metadata.farmstead2.getState().site;if(JSON.stringify(one)!==JSON.stringify(survey.farm1Site)||JSON.stringify(two)!==JSON.stringify(survey.farm2Site))throw Error('Existing farm approach changed; resurvey before terrain integration');}
