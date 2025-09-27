import * as THREE from 'three';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyLoopFades(data, sampleRate, fadeSeconds = 0.2) {
  const fadeSamples = Math.min(Math.floor(sampleRate * fadeSeconds), Math.floor(data.length / 2));
  if (fadeSamples <= 0) {
    return;
  }

  for (let i = 0; i < fadeSamples; i += 1) {
    const fadeIn = i / fadeSamples;
    const fadeOut = 1 - fadeIn;
    data[i] *= fadeIn;
    data[data.length - 1 - i] *= fadeOut;
  }
}

function createCrowdBuffer(context) {
  const duration = 12;
  const sampleRate = context.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);

  let murmur = 0;
  const voices = new Array(5).fill(null).map(() => ({
    nextEvent: Math.random() * 1.5,
    phase: 0,
    freq: 0,
    remaining: 0,
    duration: 0,
    amplitude: 0,
  }));

  for (let i = 0; i < frameCount; i += 1) {
    const time = i / sampleRate;
    murmur = murmur * 0.995 + (Math.random() * 2 - 1) * 0.005;
    let value = murmur * 0.45;
    value += Math.sin(time * 2 * Math.PI * 0.27) * 0.05;

    voices.forEach((voice) => {
      if (time >= voice.nextEvent) {
        voice.freq = 140 + Math.random() * 160;
        voice.duration = 0.22 + Math.random() * 0.35;
        voice.remaining = voice.duration;
        voice.phase = 0;
        voice.amplitude = 0.12 + Math.random() * 0.08;
        voice.nextEvent = time + 0.8 + Math.random() * 1.6;
      }

      if (voice.remaining > 0) {
        const progress = 1 - (voice.remaining / voice.duration);
        const envelope = Math.sin(Math.PI * clamp(progress, 0, 1));
        value += Math.sin(voice.phase) * voice.amplitude * envelope;
        voice.phase += (2 * Math.PI * voice.freq) / sampleRate;
        voice.remaining -= 1 / sampleRate;
      }
    });

    channel[i] = clamp(value * 0.7, -1, 1);
  }

  applyLoopFades(channel, sampleRate, 0.35);
  return buffer;
}

function createAssemblyBuffer(context) {
  const duration = 14;
  const sampleRate = context.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);

  const drones = [98, 131, 164].map((freq) => ({ freq, phase: 0 }));
  let rustle = 0;
  const call = {
    nextEvent: 0.4,
    freq: 0,
    remaining: 0,
    duration: 0,
    phase: 0,
    amplitude: 0,
  };

  for (let i = 0; i < frameCount; i += 1) {
    const time = i / sampleRate;
    let value = 0;

    drones.forEach((tone, index) => {
      const modulation = 0.07 + index * 0.02;
      const amp = 0.07 + index * 0.03;
      value += Math.sin(tone.phase) * amp * (0.8 + 0.2 * Math.sin(time * 2 * Math.PI * 0.1));
      tone.phase += (2 * Math.PI * tone.freq) / sampleRate;
    });

    rustle = rustle * 0.997 + (Math.random() * 2 - 1) * 0.003;
    value += rustle * 0.2;

    if (time >= call.nextEvent) {
      call.freq = 170 + Math.random() * 90;
      call.duration = 0.9 + Math.random() * 0.9;
      call.remaining = call.duration;
      call.phase = 0;
      call.amplitude = 0.24 + Math.random() * 0.08;
      call.nextEvent = time + 1.5 + Math.random() * 2.7;
    }

    if (call.remaining > 0) {
      const progress = 1 - (call.remaining / call.duration);
      const envelope = Math.sin(Math.PI * clamp(progress, 0, 1));
      value += Math.sin(call.phase) * call.amplitude * envelope;
      call.phase += (2 * Math.PI * call.freq) / sampleRate;
      call.remaining -= 1 / sampleRate;
    }

    channel[i] = clamp(value * 0.75, -1, 1);
  }

  applyLoopFades(channel, sampleRate, 0.4);
  return buffer;
}

function createCountrysideBuffer(context) {
  const duration = 16;
  const sampleRate = context.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);

  let breeze = 0;
  const chirps = new Array(3).fill(null).map(() => ({
    nextEvent: Math.random() * 3,
    freq: 0,
    remaining: 0,
    duration: 0,
    phase: 0,
    amplitude: 0,
  }));

  for (let i = 0; i < frameCount; i += 1) {
    const time = i / sampleRate;
    breeze = breeze * 0.996 + (Math.random() * 2 - 1) * 0.004;
    let value = breeze * 0.55;
    value += Math.sin(time * 2 * Math.PI * 0.08) * 0.03;

    chirps.forEach((chirp) => {
      if (time >= chirp.nextEvent) {
        chirp.freq = 2000 + Math.random() * 1400;
        chirp.duration = 0.18 + Math.random() * 0.22;
        chirp.remaining = chirp.duration;
        chirp.phase = 0;
        chirp.amplitude = 0.22 + Math.random() * 0.1;
        chirp.nextEvent = time + 1.2 + Math.random() * 2.4;
      }

      if (chirp.remaining > 0) {
        const progress = 1 - (chirp.remaining / chirp.duration);
        const envelope = Math.sin(Math.PI * clamp(progress, 0, 1));
        const trill = Math.sin(chirp.phase) * chirp.amplitude * envelope;
        value += trill;
        chirp.phase += (2 * Math.PI * chirp.freq) / sampleRate;
        chirp.remaining -= 1 / sampleRate;
      }
    });

    channel[i] = clamp(value * 0.6, -1, 1);
  }

  applyLoopFades(channel, sampleRate, 0.45);
  return buffer;
}

function generateBuffer(type, context) {
  switch (type) {
    case 'market':
    case 'plaza':
      return createCrowdBuffer(context);
    case 'assembly':
      return createAssemblyBuffer(context);
    case 'countryside':
      return createCountrysideBuffer(context);
    default:
      return createCrowdBuffer(context);
  }
}

export class AmbientZoneManager {
  constructor({ maxActive = 3, fadeTime = 0.65 } = {}) {
    this.maxActive = Math.max(1, maxActive);
    this.fadeTime = fadeTime;
    this.listener = null;
    this.enabled = false;
    this.zones = [];
    this.zoneIndex = new Map();
    this.bufferCache = new Map();
  }

  setCamera(camera) {
    if (!camera) {
      return;
    }

    if (!this.listener) {
      this.listener = new THREE.AudioListener();
    }

    if (this.listener.parent !== camera) {
      camera.add(this.listener);
    }
  }

  registerZone({ id, node, type = 'market', radius = 30, maxDistance, volume = 0.5, rolloff = 1.5 } = {}) {
    if (!node) {
      return null;
    }

    const zoneId = id ?? `zone-${this.zones.length}`;
    let zone = this.zoneIndex.get(zoneId);
    const resolvedMaxDistance = maxDistance ?? radius * 3;

    if (!zone) {
      zone = {
        id: zoneId,
        node,
        type,
        radius,
        maxDistance: resolvedMaxDistance,
        volume: clamp(volume, 0, 1),
        rolloff,
        worldPosition: new THREE.Vector3(),
        currentGain: 0,
        targetGain: 0,
        audio: null,
        loading: null,
        distance: Infinity,
      };
      this.zones.push(zone);
      this.zoneIndex.set(zoneId, zone);
    } else {
      zone.node = node;
      zone.type = type;
      zone.radius = radius;
      zone.maxDistance = resolvedMaxDistance;
      zone.volume = clamp(volume, 0, 1);
      zone.rolloff = rolloff;
      if (zone.audio && zone.audio.parent !== node) {
        zone.audio.removeFromParent();
        node.add(zone.audio);
      }
    }

    return zone;
  }

  setEnabled(value) {
    const enabled = Boolean(value);
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    if (!enabled) {
      this.zones.forEach((zone) => {
        if (zone.audio && zone.audio.isPlaying) {
          zone.audio.stop();
        }
        if (zone.audio) {
          zone.audio.setVolume(0);
        }
        zone.currentGain = 0;
        zone.targetGain = 0;
      });
    }
  }

  async resume() {
    if (!this.listener) {
      return;
    }

    const context = this.listener.context;
    if (context && typeof context.resume === 'function' && context.state === 'suspended') {
      await context.resume();
    }
  }

  ensureZoneAudio(zone) {
    if (!this.listener || !zone || zone.audio || zone.loading) {
      return;
    }

    const audio = new THREE.PositionalAudio(this.listener);
    audio.name = `ambient-zone:${zone.id}`;
    audio.setDistanceModel('linear');
    audio.setRefDistance(zone.radius);
    audio.setMaxDistance(zone.maxDistance);
    audio.setRolloffFactor(zone.rolloff);
    audio.setLoop(true);
    audio.setVolume(0);

    zone.node.add(audio);
    zone.audio = audio;

    const loadBuffer = async () => {
      if (!this.listener) {
        return;
      }
      const context = this.listener.context;
      if (!context) {
        return;
      }

      let buffer = this.bufferCache.get(zone.type);
      if (!buffer) {
        buffer = generateBuffer(zone.type, context);
        this.bufferCache.set(zone.type, buffer);
      }

      if (buffer) {
        audio.setBuffer(buffer);
      }
    };

    zone.loading = loadBuffer()
      .catch((error) => {
        console.warn(`[ambient-zones] Unable to create buffer for ${zone.id}`, error);
        if (zone.audio) {
          zone.audio.removeFromParent();
        }
        zone.audio = null;
      })
      .finally(() => {
        zone.loading = null;
      });
  }

  update(delta, listenerPosition) {
    if (!this.enabled || !this.listener || !listenerPosition) {
      return;
    }

    const availableZones = [];
    this.zones.forEach((zone) => {
      if (!zone.node) {
        zone.targetGain = 0;
        return;
      }
      zone.node.getWorldPosition(zone.worldPosition);
      zone.distance = zone.worldPosition.distanceTo(listenerPosition);
      zone.targetGain = 0;
      availableZones.push(zone);
    });

    availableZones.sort((a, b) => a.distance - b.distance);

    let activated = 0;
    for (const zone of availableZones) {
      if (zone.distance <= zone.maxDistance && activated < this.maxActive) {
        zone.targetGain = zone.volume;
        activated += 1;
      }
    }

    const smoothing = this.fadeTime > 0 ? 1 - Math.exp(-Math.max(delta, 0) / this.fadeTime) : 1;

    this.zones.forEach((zone) => {
      if (zone.targetGain > 0 && !zone.audio && !zone.loading) {
        this.ensureZoneAudio(zone);
      }

      if (!zone.audio || !zone.audio.buffer) {
        return;
      }

      zone.currentGain += (zone.targetGain - zone.currentGain) * smoothing;
      if (Math.abs(zone.currentGain) < 0.0001) {
        zone.currentGain = 0;
      }

      zone.audio.setVolume(clamp(zone.currentGain, 0, 1));

      if (zone.currentGain > 0.002) {
        if (!zone.audio.isPlaying) {
          zone.audio.play();
        }
      } else if (zone.audio.isPlaying && zone.targetGain <= 0) {
        zone.audio.stop();
      }
    });
  }
}

export default AmbientZoneManager;
