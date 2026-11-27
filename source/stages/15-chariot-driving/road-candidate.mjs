import fs from 'node:fs';
import assert from 'node:assert/strict';
import {rideCandidate} from './ride-candidate.mjs';

export function roadCandidate(parent, record = () => {}) {
  let source = rideCandidate(parent, record);
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, 'Expected one native anchor: ' + before.slice(0, 85));
    record({offset: source.indexOf(before), before, after});
    source = source.replace(before, () => after);
  }
  const helper = fs.readFileSync(new URL('./helpers/ChariotRoadFinish.mjs', import.meta.url), 'utf8')
    .replace(/^export /gm, '');
  replace('var a1=Bhe(0,pI),Cm=Bhe(Bf,0);', helper + '\nvar a1=Bhe(0,pI),Cm=Bhe(Bf,0);');
  // Keep existing checkpoint acceptance, including the historical road corridor.
  replace('Math.min(Math.abs(s-Ei(a)),Math.abs(s-mV(a)))<=(i<0&&a>=-3?11.75:11)',
    '(Math.min(Math.abs(s-Ei(a)),Math.abs(s-mV(a)))<=(i<0&&a>=-3?11.75:11)||chariotRoadRecovery(s,a,Ei,Pv))');
  replace('return Le.Lerp(rgt.scale(1-p),Le.Lerp(igt,m?g:h,vr(5,11,Math.abs(e))),n).scale(.88+o*.21)',
    `const finish=chariotRoadWeight(i),offset=Math.abs(e);
    const edge=n+(chariotRoadSmooth(2.8,5.3,offset)-n)*finish;
    const verge=vr(5,11,offset)+(chariotRoadSmooth(5.3,9.5,offset)-vr(5,11,offset))*finish;
    return Le.Lerp(rgt.scale(1-p),Le.Lerp(igt,m?g:h,verge),edge).scale(.88+o*.21)`);
  replace('(this.rideSurface=chariotSurface(r.distance,width)),grade,t);',
    '(this.rideSurface=this.journeyRoadSurface(r.distance,width)),grade,t);');
  replace('updateRideAudio(bridge){', `journeyRoadSurface(distance,width){
      const fallback=chariotSurface(distance,width);
      if(this.x>=mn)return fallback;
      const point=bo(this.x,this.z);
      return chariotRoadSurface(point.x,point.z,Ei,Pv,fallback);
    }
    updateRideAudio(bridge){`);
  replace('if(n>=mn&&(this.support.blocked(n,o,l)||this.scenery.blocked(n,o,l)))return!0',
    `if(n>=mn&&(this.support.blocked(n,o,l)||this.scenery.blocked(n,o,l)))return!0;
    if(n<mn&&chariotRoadWeight(mn-n)>0){
      const point=bo(n,o);
      if(Math.abs(chariotRoadMeshOffset(point.x,point.z,Ei,Pv))>9&&this.countryside.walkingBlocked(n,o,l))return!0;
    }`);
  replace('ridePresentation:true,route:this.road.nearestRoute',
    'ridePresentation:true,roadFinish:true,route:this.road.nearestRoute');
  return source;
}
