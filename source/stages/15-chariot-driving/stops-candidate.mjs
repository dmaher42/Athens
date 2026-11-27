import fs from 'node:fs';
import assert from 'node:assert/strict';
import {roadCandidate} from './road-candidate.mjs';

export function stopsCandidate(parent, record = () => {}) {
  let source = roadCandidate(parent, record);
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, 'Expected one native anchor: ' + before.slice(0, 85));
    record({offset: source.indexOf(before), before, after});
    source = source.replace(before, () => after);
  }
  const helper = fs.readFileSync(new URL('./helpers/ChariotRoadStop.mjs', import.meta.url), 'utf8')
    .replace(/^export /gm, '');
  replace('var tU="athens-babylon-sparta-road.reload"', helper + '\nvar tU="athens-babylon-sparta-road.reload"');
  replace('return t.sort((s,a)=>r(a)-r(s))[0]??null}canMount(){',
    `return t.sort((s,a)=>r(a)-r(s))[0]??this.roadStopExit(e,r)}
    roadStopExit(stop,siteSide){
      const carHeight=this.height(this.x,this.z);
      return chariotStopExit(this.x,this.z,this.yaw,(x,z,approachX,approachZ)=>{
        const ground=this.height(x,z);
        const approach=this.height(approachX,approachZ);
        if(this.roadWalkBlocked(stop,approachX,approachZ,approach)||this.roadWalkBlocked(stop,x,z,ground))return null;
        const feet=this.countryside.walkingHeight(x,z,ground);
        if(Math.abs(feet-carHeight)>.65||Math.abs(feet-approach)>.65)return null;
        return new V(x,feet,z);
      },siteSide);
    }
    canMount(){`);
  replace('if(Math.abs(this.speed)>.35){this.message("The chariot is still moving.")',
    'if(Math.abs(this.speed)>chariotStopSpeed){this.message("The chariot is still moving.")');
  replace('this.journal.update(a.z,this.walkingStop??(this.mounted?gI(a.z,44):null),this.persistent&&n,this.persistent?o:"")',
    `this.journal.update(a.z,this.walkingStop??(this.mounted?gI(a.z,44):null),this.persistent&&n,this.persistent?o||this.stopControlHint(a.z):"")`);
  replace('updateRideAudio(bridge){', `stopControlHint(chainage){
      if(this.openingSparta||this.paused()||this.pausePanel.open||this.inputSuspended())return "";
      const stop=this.mounted?(this.onSpartaRoad()?gI(chainage):null):this.walkingStop;
      return chariotStopHint(this.mounted,this.speed,stop,!this.mounted&&!!stop&&this.canMount(),chariotStopSpeed);
    }
    updateRideAudio(bridge){`);
  replace('roadFinish:true,route:this.road.nearestRoute',
    'roadFinish:true,roadStopFlow:true,route:this.road.nearestRoute');
  return source;
}
