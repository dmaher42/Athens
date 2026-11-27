import fs from 'node:fs';
import assert from 'node:assert/strict';
import {candidate} from './candidate.mjs';

export function rideCandidate(parent, record = () => {}) {
  let source = candidate(parent, record);
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, 'Expected one native anchor: ' + before.slice(0, 90));
    record({offset: source.indexOf(before), before, after});
    source = source.replace(before, () => after);
  }
  const helper = fs.readFileSync(new URL('./helpers/ChariotRide.mjs', import.meta.url), 'utf8')
    .replace(/^export /gm, '');
  // Keep the complete movement loop from Task 1. All hooks are presentation.
  replace('var tU="athens-babylon-sparta-road.reload"', helper + '\nvar tU="athens-babylon-sparta-road.reload"');
  replace('cameraFollowYaw=NaN;steerAngle=0;', 'rideCamera=new ChariotRideCamera();rideAudio=new ChariotRideAudio();steerAngle=0;');
  replace('a=s<.12?"Idle":s*3.6<(chariotTune.gaitKmh[0]+chariotTune.gaitKmh[1])/2?"Walk":s*3.6<(chariotTune.gaitKmh[1]+chariotTune.gaitKmh[2])/2?"Trot":s*3.6<(chariotTune.gaitKmh[2]+chariotTune.gaitKmh[3])/2?"Canter":"Gallop"',
    'a=this.rideGait=chariotVisualGait(s,chariotTune.gaitKmh,this.rideGait)');
  replace('Math.min(e,.1))*12);for(let[f,d]of o.weights)', 'Math.min(e,.1))*8);for(let[f,d]of o.weights)');
  replace('f.speedRatio=p.stride?Math.max(.05,s*p.seconds/p.stride)*(t<0?-1:1):1',
    'f.speedRatio=chariotGaitSpeedRatio(s,h,p)');
  replace('this.mountBlendRemaining=.35,this.groundMode(),this.walkingStop=null', 'this.mountBlendRemaining=.35,this.rideCamera.reset(),this.groundMode(),this.walkingStop=null');
  const recovery = source.indexOf('recenter(){if(!this.mounted)return;');
  assert.ok(recovery > 0);
  const recoveryEnd = source.indexOf('Chariot centred on the road.', recovery);
  const beforeRecovery = source.slice(recovery, recoveryEnd);
  assert.ok(beforeRecovery.includes('this.lookPitch=0,'));
  replace(beforeRecovery, beforeRecovery.replace('this.lookPitch=0,', 'this.lookPitch=0,this.rideCamera.reset(),this.rideAudio.silence(),'));

  const start = source.indexOf('let _=this.yaw+this.look;!Number.isFinite(this.cameraFollowYaw)');
  const end = source.indexOf('if(this.mountBlendRemaining>0)', start);
  assert.ok(start > 0 && end > start && end - start < 1400);
  replace(source.slice(start, end), `const lookYaw=this.yaw+this.look;
    if(this.driverView){
      this.rideCamera.reset();
      this.camera.position.set(this.x+Math.sin(this.yaw)*-.1,this.y+2.14,this.z+Math.cos(this.yaw)*-.1);
      this.camera.setTarget(new V(this.camera.position.x+Math.sin(lookYaw)*15,this.y+1.9+this.lookPitch*12,this.camera.position.z+Math.cos(lookYaw)*15));
    }else{
      const view=this.rideCamera.follow(this.yaw,this.y,this.speed,this.look,this.lookPitch,this.cameraMode===1,t);
      const anchor=new V(this.x,this.y+1.8,this.z);
      const wanted=new V(this.x-Math.sin(view.orbit)*view.distance,this.y+view.height+this.lookPitch*4,this.z-Math.cos(view.orbit)*view.distance);
      const clear=this.support.cameraFraction(anchor.asArray(),wanted.asArray());
      this.camera.position.copyFrom(clear<1?V.Lerp(anchor,wanted,Math.max(.1,clear-.03)):wanted);
      this.camera.setTarget(new V(this.x+Math.sin(view.aim)*view.lead,this.y+view.aimHeight,this.z+Math.cos(view.aim)*view.lead));
    }`);
  replace('this.camera.position.copyFrom(C<1?V.Lerp(R,M,Math.max(0,C-.03)):M),this.camera.setTarget(new V(this.x+Math.sin(this.yaw)*1.6,this.y+1.3,this.z+Math.cos(this.yaw)*1.6))',
    'this.camera.position.copyFrom(C<1?V.Lerp(R,M,Math.max(0,C-.03)):M)');

  replace('update(e){this.inputSuspended()&&this.clearInput(),this.model.setPaused',
    `updateRideAudio(bridge){
      if(!this.mounted){this.rideAudio.dispose();return}
      if(!bridge?.isUnlocked||bridge.muted||document.hidden||this.openingSparta||this.paused()||this.pausePanel.open||this.inputSuspended()){
        this.rideAudio.silence();return
      }
      const engine=dr.audioEngine;
      this.rideAudio.update(engine?.audioContext,engine?.masterGain,this.speed,this.rideSurface??"earth",this.model.team);
    }
    update(e){this.inputSuspended()&&this.clearInput(),this.model.setPaused`);
  replace('chariotSurface(r.distance,width),grade,t);', '(this.rideSurface=chariotSurface(r.distance,width)),grade,t);');
  replace('this.journey?.update(le);let ne=', 'this.journey?.update(le);this.journey?.updateRideAudio(this.audioBridge);let ne=');
  replace('this.audioBridge.update(ne,Ee,this.isWalkMode)', 'this.audioBridge.update(ne,Ee&&!oe,this.isWalkMode)');
  replace('dispose(){this.save(),window.removeEventListener("pointerdown",this.pointerDown', 'dispose(){this.rideAudio.dispose(),this.save(),window.removeEventListener("pointerdown",this.pointerDown');
  replace('handling:chariotTune,route:this.road.nearestRoute', 'handling:chariotTune,ridePresentation:true,route:this.road.nearestRoute');
  return source;
}
