import assert from 'node:assert/strict';
import {stopsCandidate} from './stops-candidate.mjs';

export function finalCandidate(parent, record = () => {}) {
  let source = stopsCandidate(parent, record);
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, 'Expected one native anchor: ' + before.slice(0, 85));
    record({offset: source.indexOf(before), before, after});
    source = source.replace(before, () => after);
  }

  replace('this.pausePanel.append(R,this.pauseStatus,this.resumeButton,M)',
    'this.pausePanel.append(R,this.pauseStatus,this.driveProfileMenu(),this.resumeButton,M)');
  replace('stopControlHint(chainage){', `driveProfile="Balanced";
    driveProfileMenu(){
      const label=document.createElement("label");
      label.textContent="Driving feel ";
      label.style.display="block";
      label.style.marginBottom="14px";
      const select=document.createElement("select");
      for(const name of Object.keys(chariotDriveProfiles)){
        const option=document.createElement("option");
        option.value=option.textContent=name;
        select.append(option);
      }
      select.value=this.driveProfile;
      select.addEventListener("change",()=>{
        if(Object.hasOwn(chariotDriveProfiles,select.value))this.driveProfile=select.value;
      });
      label.append(select);
      return label;
    }
    stopControlHint(chainage){`);
  replace('(this.rideSurface=this.journeyRoadSurface(r.distance,width)),grade,t);',
    '(this.rideSurface=this.journeyRoadSurface(r.distance,width)),grade,t,chariotDriveProfiles[this.driveProfile]);');
  replace('roadStopFlow:true,route:this.road.nearestRoute',
    'roadStopFlow:true,driveProfile:this.driveProfile,finalChariot:true,route:this.road.nearestRoute');
  replace('let e=this.road.nearestRoute(this.x,this.z);for(let t of[0,-2,2,-5,5]){let r=this.road.routeAt(Math.max(5,Math.min(this.road.length-12,e.along+t)));if(!this.teamBlocked(r.x,r.z,r.yaw))',
    `const e=this.road.nearestRoute(this.x,this.z);
    const gateApproach=Nhe-8;
    const limit=mn-this.x>gateApproach-35
      ?this.road.nearestRoute(mn-gateApproach,Wc+Ei(gateApproach)).along
      :this.road.length-12;
    for(const t of[0,-2,2,-5,5,-9,9,-14,14]){
      const r=this.road.routeAt(Math.max(5,Math.min(limit,e.along+t)));
      if(this.road.canDrive(r.x,r.z)&&!this.teamBlocked(r.x,r.z,r.yaw))`);

  // This query runs for each 0.1 m movement substep. Sample terrain only
  // where a native collision test consumes the height.
  replace('teamBlocked(e,t,r){for(let s of[-.6,1.4,3.9])for(let a of[-.95,.95]){let n=e+Math.sin(r)*s+Math.cos(r)*a,o=t+Math.cos(r)*s-Math.sin(r)*a,l=this.height(n,o);if(n>=mn&&(this.support.blocked(n,o,l)||this.scenery.blocked(n,o,l)))return!0;\n    if(n<mn&&chariotRoadWeight(mn-n)>0){\n      const point=bo(n,o);\n      if(Math.abs(chariotRoadMeshOffset(point.x,point.z,Ei,Pv))>9&&this.countryside.walkingBlocked(n,o,l))return!0;\n    }}return!1}',
    `teamBlocked(e,t,r){
      const sin=Math.sin(r),cos=Math.cos(r);
      for(const s of[-.6,1.4,3.9])for(const a of[-.95,.95]){
        const n=e+sin*s+cos*a,o=t+cos*s-sin*a;
        if(n>=mn){
          const height=this.height(n,o);
          if(this.support.blocked(n,o,height)||this.scenery.blocked(n,o,height))return true;
        }else if(chariotRoadWeight(mn-n)>0){
          const point=bo(n,o);
          if(Math.abs(chariotRoadMeshOffset(point.x,point.z,Ei,Pv))>9&&
             this.countryside.walkingBlocked(n,o,this.height(n,o)))return true;
        }
      }
      return false;
    }`);
  return source;
}
