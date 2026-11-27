const rideClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rideEase = (seconds, dt) => -Math.expm1(-dt / seconds);
const rideAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export class ChariotRideCamera {
  reset() {
    this.heading = undefined;
  }

  follow(yaw, ground, speed, look, pitch, wide, dt) {
    if (this.heading === undefined || dt === 0) {
      this.heading = this.lastYaw = yaw;
      this.ground = ground;
      this.turn = 0;
    }
    const pace = rideClamp(speed / 15, 0, 1);
    const yawRate = dt > 0 ? rideClamp(rideAngle(yaw - this.lastYaw) / dt, -1.2, 1.2) : 0;
    this.lastYaw = yaw;
    this.turn += (yawRate - this.turn) * rideEase(0.22, dt);
    this.heading += rideAngle(yaw - this.heading) * rideEase(0.16, dt);
    this.ground += (ground - this.ground) * rideEase(0.2, dt);
    return {
      orbit: this.heading + look,
      aim: this.heading + look + rideClamp(this.turn * (0.19 + pace * 0.23), -0.22, 0.22),
      lead: 3.2 + pace * 3.8,
      distance: (wide ? 8.5 : 5.4) + pace * 0.65,
      height: (wide ? 3.4 : 2.65) + pace * 0.27 + rideClamp(this.ground - ground, -0.3, 0.3),
      aimHeight: 1.5 + pitch * 7
    };
  }
}

export function chariotVisualGait(speed, targets, previous) {
  const kmh = Math.abs(speed) * 3.6;
  if (kmh < 0.45) return 'Idle';
  const bands = ['Walk', 'Trot', 'Canter', 'Gallop'];
  const boundaries = targets.slice(0, 3).map((speed, index) => (speed + targets[index + 1]) / 2);
  // Keep the blend from changing direction repeatedly on the verge or a slope.
  const current = bands.indexOf(previous);
  if (current >= 0 && kmh >= (boundaries[current - 1] ?? 0) - 1.2 &&
      kmh < (boundaries[current] ?? Infinity) + 1.2) return previous;
  const next = boundaries.findIndex(limit => kmh < limit);
  return bands[next === -1 ? 3 : next];
}

const rideCycleCeiling = {Walk: 1.55, Trot: 2.1, Canter: 2.35, Gallop: 2.55};

export function chariotGaitSpeedRatio(speed, gait, clip) {
  if (!clip.stride) return 1;
  const cycles = Math.min(Math.abs(speed) / clip.stride, rideCycleCeiling[gait]);
  return Math.max(0.05, cycles * clip.seconds);
}

// Descending hoof positions near ground level in nisean-chariot-v02's baked
// clips. Phases are clip-relative and sampled from the authored bone tracks.
const rideContacts = {
  Walk: [0.300, 0.483, 0.858, 0.983],
  Trot: [0.050, 0.471, 0.550, 0.971],
  Canter: [0.279, 0.342, 0.675, 0.958],
  Gallop: [0.083, 0.438, 0.571, 0.954]
};

export function chariotHoofContacts(gait, previousPhase, phase) {
  if (!Number.isFinite(phase) || !Number.isFinite(previousPhase) || !rideContacts[gait]) return 0;
  const travel = (phase - previousPhase + 1) % 1;
  if (travel > 0.48) return 0;
  let hits = 0;
  for (const contact of rideContacts[gait]) {
    const offset = (contact - previousPhase + 1) % 1;
    if (offset > 0 && offset <= travel) hits++;
  }
  return hits;
}

const rideSurfaceSound = {
  earth: {cutoff: 310, roll: 0.075, hoof: 0.94, harness: 1},
  gravel: {cutoff: 970, roll: 0.13, hoof: 1.08, harness: 1.1},
  grass: {cutoff: 540, roll: 0.085, hoof: 0.81, harness: 0.9},
  rough: {cutoff: 750, roll: 0.11, hoof: 0.89, harness: 1.25}
};

function chariotRideBuffer(context, seconds, sample) {
  const buffer = context.createBuffer(1, Math.ceil(seconds * context.sampleRate), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 93271;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = sample(i / context.sampleRate, seed / 2147483648 - 1, i / data.length);
  }
  return buffer;
}

export class ChariotRideAudio {
  phases = [];
  voices = new Map();
  nextHarness = 0;
  audible = false;
  onVisibility = () => { if (document.hidden) this.silence(); };

  connect(context, output) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(output);
    this.hoof = chariotRideBuffer(context, 0.115, (t, noise) =>
      (0.59 * Math.sin(t * 2 * Math.PI * 112) * Math.exp(-t * 49) +
        noise * 0.28 * Math.exp(-t * 97)) * Math.min(1, t * 650));
    this.harness = chariotRideBuffer(context, 0.09, (t, noise) =>
      (noise * 0.19 + 0.41 * Math.sin(t * 2 * Math.PI * 620) +
        0.21 * Math.sin(t * 2 * Math.PI * 1110)) * Math.exp(-t * 76) * Math.min(1, t * 650));
    this.wheel = context.createBufferSource();
    this.wheel.buffer = chariotRideBuffer(context, 1.4, (t, noise, phase) =>
      (noise * 0.38 + 0.036 * Math.sin(t * 2 * Math.PI * 55)) *
      Math.min(1, phase * 50, (1 - phase) * 50));
    this.wheel.loop = true;
    this.wheelFilter = context.createBiquadFilter();
    this.wheelFilter.type = 'lowpass';
    this.wheelGain = context.createGain();
    this.wheelGain.gain.value = 0;
    this.wheel.connect(this.wheelFilter);
    this.wheelFilter.connect(this.wheelGain);
    this.wheelGain.connect(this.bus);
    this.wheel.start();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  strike(buffer, volume, pitch) {
    if (this.voices.size >= 12) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.bus);
    this.voices.set(source, gain);
    source.onended = () => this.stopVoice(source);
    source.start();
  }

  stopVoice(source) {
    const gain = this.voices.get(source);
    if (!gain) return;
    this.voices.delete(source);
    source.onended = null;
    source.stop();
    source.disconnect();
    gain.disconnect();
  }

  silence() {
    this.phases.length = 0;
    if (!this.audible) return;
    this.audible = false;
    const now = this.context.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setTargetAtTime(0, now, 0.022);
    this.wheelGain.gain.cancelScheduledValues(now);
    this.wheelGain.gain.setTargetAtTime(0, now, 0.022);
    for (const source of this.voices.keys()) this.stopVoice(source);
  }

  update(context, output, speed, surface, team) {
    if (context?.state !== 'running' || !output || speed < 0.16) {
      this.silence();
      return;
    }
    if (this.context !== context) {
      this.dispose();
      this.connect(context, output);
    }
    const now = context.currentTime;
    const pace = rideClamp(speed / 15, 0, 1);
    const profile = rideSurfaceSound[surface];
    if (!this.audible) {
      this.audible = true;
      this.nextHarness = now;
      this.bus.gain.setTargetAtTime(0.6, now, 0.075);
    }
    this.wheelGain.gain.setTargetAtTime(profile.roll * Math.sqrt(pace), now, 0.14);
    this.wheelFilter.frequency.setTargetAtTime(profile.cutoff + pace * 290, now, 0.15);
    this.wheel.playbackRate.setTargetAtTime(0.78 + pace * 1.15, now, 0.15);

    const entries = team?.ready ? team.entries : [];
    this.phases.length = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const horse = entries[i];
      const clip = horse.groups.find(group => group.isPlaying && group.name.endsWith(horse.active));
      const phase = clip && clip.to > clip.from ? rideClamp((clip.getCurrentFrame() - clip.from) / (clip.to - clip.from), 0, 1) : NaN;
      const sample = this.phases[i] ??= {clip, phase};
      const hits = clip === sample.clip ? chariotHoofContacts(horse.active, sample.phase, phase) : 0;
      sample.clip = clip;
      sample.phase = phase;
      if (!hits) continue;
      const weight = horse.weights.get(clip) ?? 0;
      const strength = Math.sqrt(hits) * weight * (0.65 + pace * 0.35);
      if (strength < 0.1) continue;
      this.strike(this.hoof, 0.31 * strength, profile.hoof * (i === 0 ? 1 : 1.06));
      if (pace > 0.24 && now >= this.nextHarness) {
        this.strike(this.harness, 0.055 * pace * profile.harness, 0.9 + pace * 0.18);
        this.nextHarness = now + 0.29;
      }
    }
  }

  dispose() {
    this.silence();
    if (!this.context) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.wheel.stop();
    for (const node of [this.wheel, this.wheelFilter, this.wheelGain, this.bus]) node.disconnect();
    this.context = this.wheel = this.wheelFilter = this.wheelGain = this.bus = this.hoof = this.harness = null;
  }
}
