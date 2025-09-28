const MODE_TO_CLIP = {
  dawn: 'ambience_dawn.mp3',
  day: 'ambience_day.mp3',
  dusk: 'ambience_dusk.mp3',
  night: 'ambience_night.mp3'
};

const VALID_MODES = new Set(Object.keys(MODE_TO_CLIP));
const DEFAULT_VOLUME = 0.6;
const FADE_SECONDS = 0.6;

const stateMap = new WeakMap();

function getState(audio) {
  if (!audio) {
    return null;
  }
  let state = stateMap.get(audio);
  if (!state) {
    state = {
      currentMode: null,
      currentAudio: null,
      loops: new Map()
    };
    stateMap.set(audio, state);
  }
  return state;
}

function scheduleStop(audioNode, delaySeconds) {
  if (!audioNode) return;
  const delayMs = Math.max(0, delaySeconds * 1000 + 20);
  const stopFn = () => {
    if (audioNode.isPlaying) {
      try {
        audioNode.stop();
      } catch (_) {
        // noop
      }
    }
  };
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(stopFn, delayMs);
  } else if (typeof setTimeout === 'function') {
    setTimeout(stopFn, delayMs);
  } else {
    stopFn();
  }
}

function fadeVolume(audioNode, targetVolume, durationSeconds) {
  if (!audioNode) {
    return;
  }
  const gainNode = audioNode.gain;
  const context = gainNode?.context || audioNode.context || audioNode.listener?.context;
  const param = gainNode?.gain;
  const now = context?.currentTime ?? 0;
  const currentVolume = typeof audioNode.getVolume === 'function' ? audioNode.getVolume() : targetVolume;

  if (param && typeof param.cancelScheduledValues === 'function' && typeof param.setValueAtTime === 'function') {
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(currentVolume, now);
      param.linearRampToValueAtTime(targetVolume, now + durationSeconds);
      return;
    } catch (_) {
      // fall through
    }
  }

  audioNode.setVolume(targetVolume);
}

async function ensureLoop(audio, mode) {
  const state = getState(audio);
  if (!state || !VALID_MODES.has(mode)) {
    return null;
  }
  if (state.loops.has(mode)) {
    return state.loops.get(mode);
  }
  const clip = MODE_TO_CLIP[mode];
  const name = `ambience:${mode}`;
  const loop = await audio.load(name, clip);
  if (loop) {
    loop.userData = loop.userData || {};
    loop.userData.baseVolume = DEFAULT_VOLUME;
    state.loops.set(mode, loop);
  }
  return loop;
}

export async function initAmbience(audio, initial = 'day') {
  const state = getState(audio);
  if (!state) {
    return;
  }
  const promises = [];
  for (const mode of VALID_MODES) {
    promises.push(audio.load(`ambience:${mode}`, MODE_TO_CLIP[mode]));
  }
  await Promise.all(promises);
  await setAmbience(audio, VALID_MODES.has(initial) ? initial : 'day');
}

export async function setAmbience(audio, mode) {
  const state = getState(audio);
  if (!state) {
    return;
  }
  if (!VALID_MODES.has(mode)) {
    mode = 'day';
  }
  if (state.currentMode === mode) {
    return;
  }

  const nextLoop = await ensureLoop(audio, mode);
  if (!nextLoop) {
    state.currentMode = mode;
    state.currentAudio = null;
    return;
  }

  const previous = state.currentAudio && state.currentAudio !== nextLoop ? state.currentAudio : null;
  const masterVolume = typeof audio.getMasterVolume === 'function' ? audio.getMasterVolume() : 1;
  const targetVolume = masterVolume * DEFAULT_VOLUME;

  if (previous) {
    fadeVolume(previous, 0, FADE_SECONDS);
    scheduleStop(previous, FADE_SECONDS);
  }

  const playing = await audio.playLoop(`ambience:${mode}`, { volume: DEFAULT_VOLUME, startVolume: 0 });
  const suspended = typeof audio.isContextSuspended === 'function' ? audio.isContextSuspended() : false;
  if (playing && !suspended) {
    fadeVolume(playing, targetVolume, FADE_SECONDS);
  } else if (playing) {
    playing.setVolume(targetVolume);
  }

  state.currentMode = mode;
  state.currentAudio = nextLoop;
}
