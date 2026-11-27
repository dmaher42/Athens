// Distances in metres, time in seconds, angles in radians. Grip limits lateral
// acceleration. Shoulder bands use the existing road width as a surface proxy.
export const chariotTune = {
  gaitKmh: [8, 20, 35, 55], encouragedKmh: 62,
  pull: [4.0, 3.5, 2.8, 1.4], brake: 4.6, roll: 0.36,
  wheelbase: 2.9, steerAngle: 0.54, steerTime: 0.085, returnTime: 0.07,
  fastSteerReduction: 0.43, lateralGrip: 5.4, velocityTime: 0.16,
  gravityScale: 4.8, cameraTime: 0.125,
  // grip multiplier, rolling drag multiplier, available horse power
  earth: [1, 1, 1], gravel: [0.86, 1.35, 0.94],
  grass: [0.78, 3.6, 0.76], rough: [0.66, 4.4, 0.67]
};

export const chariotDriveProfiles = {
  Relaxed: {...chariotTune, gaitKmh: [8, 18, 29, 43], encouragedKmh: 49,
    lateralGrip: 5.9, brake: 4.9, fastSteerReduction: 0.49, velocityTime: 0.13},
  Balanced: chariotTune,
  Sport: {...chariotTune, gaitKmh: [8, 21, 38, 62], encouragedKmh: 70,
    pull: [4.0, 3.5, 2.8, 1.65], lateralGrip: 5.2, brake: 4.4,
    fastSteerReduction: 0.46, velocityTime: 0.18}
};

export function chariotSurface(distance, width) {
  if (distance < width * 0.8) return 'earth';
  if (distance < width + 0.7) return 'gravel';
  return distance < width + 5 ? 'grass' : 'rough';
}

export function advanceChariot(speed, steer, slip, yaw, input, throttle, brake, boost, surface, grade, elapsed, p = chariotTune) {
  const [grip, drag, power] = p[surface];
  const limit = (boost ? p.encouragedKmh : p.gaitKmh[3]) / 3.6;
  let x = 0, z = 0, distance = 0;
  const steps = Math.max(1, Math.ceil(elapsed * 120 - 1e-9));
  const dt = elapsed / steps;
  const slope = Math.max(-0.35, Math.min(0.35, grade)) * p.gravityScale;
  const steerEase = -Math.expm1(-dt / (input ? p.steerTime : p.returnTime));
  const slipDecay = Math.exp(-dt * grip / p.velocityTime);
  for (let step = 0; step < steps; step++) {
    const oldSpeed = speed;
    const kmh = speed * 3.6;
    const gait = kmh < p.gaitKmh[0] ? 0 : kmh < p.gaitKmh[1] ? 1 : kmh < p.gaitKmh[2] ? 2 : 3;
    const effort = brake ? 0 : Math.max(0, throttle) * p.pull[gait] * power;
    const resistance = p.roll * drag * (1 + speed * speed / 360);
    if (speed > 0 || effort > 0) {
      const acceleration = effort * Math.min(1, Math.max(0, limit - speed)) - resistance - slope - (brake ? p.brake : 0);
      speed = Math.max(0, Math.min(p.encouragedKmh / 3.6, speed + acceleration * dt));
    }
    const v = (oldSpeed + speed) / 2;
    const target = input * p.steerAngle * (1 - p.fastSteerReduction * Math.min(1, v * 3.6 / p.gaitKmh[3]));
    steer += (target - steer) * steerEase;
    const maxYaw = p.lateralGrip * grip / Math.max(0.5, v);
    const yawRate = maxYaw * Math.tanh(v * Math.tan(steer) / (p.wheelbase * maxYaw));
    const turn = yawRate * dt;
    // Velocity keeps its old bearing as the vehicle rotates, then grip catches up.
    slip = (slip - turn) * slipDecay;
    const bearing = yaw + turn / 2 + slip;
    yaw += turn;
    distance += v * dt;
    x += Math.sin(bearing) * v * dt;
    z += Math.cos(bearing) * v * dt;
  }
  return {speed, steer, slip, yaw, x, z, distance};
}
