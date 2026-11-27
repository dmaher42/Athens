import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const parentId = 'e1fbd728581f';
export const parentHash = '85455ba9523cb378964ab93459b92b194ea6cf56c60f1ef6a7b89e3642bf5957';
export const parentAsset = 'babylon-athens-east-edge-85455ba9523c.js';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function selectedEntry() {
  const city = path.join(process.env.USERPROFILE, 'AppData/Local/Athens-Babylon/apps/athens');
  const selector = JSON.parse(fs.readFileSync(path.join(city, 'current.json')));
  assert.equal(selector.id, parentId, 'Rebase onto the newly selected city first');
  const release = path.join(city, 'releases', selector.id);
  assert.equal(hash(fs.readFileSync(path.join(release, 'release.json'))), selector.manifestSHA256);
  const html = fs.readFileSync(path.join(release, 'build/index.html'), 'utf8');
  const entry = /<script type="module" src="([^"]+)"/.exec(html)[1];
  assert.equal(path.basename(entry), parentAsset);
  return fs.readFileSync(path.join(release, 'build', entry), 'utf8');
}

export function candidate(parent, record = () => {}) {
  assert.equal(hash(parent), parentHash);
  let source = parent;
  function replace(before, after) {
    assert.equal(source.split(before).length, 2, 'Expected one native anchor: ' + before.slice(0, 70));
    record({offset: source.indexOf(before), before, after});
    source = source.replace(before, () => after);
  }
  const helper = fs.readFileSync(new URL('./helpers/ChariotDrive.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
  replace('function p9e(', helper + '\nfunction p9e(');
  replace('this.mounted&&["KeyW","KeyS","KeyA","KeyD","Space"', 'this.mounted&&["ShiftLeft","ShiftRight","KeyW","KeyS","KeyA","KeyD","Space"');
  replace('let t=Math.max(0,Math.min(.05,e)),r=this.road.nearestRoute', 'let t=Math.max(0,Math.min(.15,e)),r=this.road.nearestRoute');
  const start = source.indexOf('let d=p9e(this.speed');
  const end = source.indexOf('M=this.height(I,R)', start);
  assert.ok(start > 0 && end > start && end-start < 750);
  replace(source.slice(start,end), `const width=this.x>=-1e3?IA(Math.min(r.along,Ea)):3.4;
    const grade=(this.height(this.x+Math.sin(this.yaw),this.z+Math.cos(this.yaw))-this.y);
    const motion=advanceChariot(this.speed,this.steerAngle,this.driftAngle,this.yaw,c,l,
      f||l<0||this.keys.has("KeyS"),this.keys.has("ShiftLeft")||this.keys.has("ShiftRight"),
      chariotSurface(r.distance,width),grade,t);
    let u=this.yaw;this.yaw=motion.yaw;this.speed=motion.speed;this.steerAngle=motion.steer;this.driftAngle=motion.slip;
    let h=motion.distance,p=Math.max(1,Math.ceil(h/.1));
    for(let y=0;y<p;y++){let I=this.x+motion.x/p,R=this.z+motion.z/p,`);
  replace('Math.exp(-t*8));let b=this.driverView?', 'Math.exp(-t/chariotTune.cameraTime));let b=this.driverView?');
  replace('s<.12?"Idle":s<1.1?"Walk":s<3?"Trot":s<6?"Canter":"Gallop"',
    's<.12?"Idle":s*3.6<(chariotTune.gaitKmh[0]+chariotTune.gaitKmh[1])/2?"Walk":s*3.6<(chariotTune.gaitKmh[1]+chariotTune.gaitKmh[2])/2?"Trot":s*3.6<(chariotTune.gaitKmh[2]+chariotTune.gaitKmh[3])/2?"Canter":"Gallop"');
  replace('M=this.height(I,R),C=this.road.nearestRoute(I,R),w=', 'M=this.height(I,R),w=');
  replace('this.message(C.along>this.road.length-8?', 'this.message(this.road.nearestRoute(I,R).along>this.road.length-8?');
  replace('handling:eU,route:this.road.nearestRoute', 'handling:chariotTune,route:this.road.nearestRoute');
  return source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Private candidate SHA256', hash(candidate(selectedEntry())));
}
