const STORAGE_KEY = 'athens.hud.state';
const DEFAULT_STATE = {
  timeMode: 'day',
  volume: 1,
  quality: 'high'
};

const TIME_OPTIONS = ['dawn', 'day', 'dusk', 'night'];
const VOLUME_OPTIONS = [0, 0.5, 1];
const QUALITY_OPTIONS = ['low', 'medium', 'high'];

function getLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (_) {
    // ignored
  }
  return null;
}

function readStoredState() {
  const storage = getLocalStorage();
  if (!storage) {
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_STATE };
    }
    const parsed = JSON.parse(raw);
    const normalized = {
      timeMode: TIME_OPTIONS.includes(parsed?.timeMode) ? parsed.timeMode : DEFAULT_STATE.timeMode,
      volume: VOLUME_OPTIONS.includes(parsed?.volume) ? parsed.volume : DEFAULT_STATE.volume,
      quality: QUALITY_OPTIONS.includes(parsed?.quality) ? parsed.quality : DEFAULT_STATE.quality
    };
    return normalized;
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

function persistState(state) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // ignored
  }
}

function callMaybeAsync(fn, value) {
  if (typeof fn !== 'function') {
    return;
  }
  try {
    const result = fn(value);
    if (result && typeof result.then === 'function') {
      result.catch(() => {});
    }
  } catch (_) {
    // ignored
  }
}

function styleButton(button, active = false) {
  button.style.margin = '0 6px 6px 0';
  button.style.padding = '4px 10px';
  button.style.border = active ? '1px solid rgba(255, 255, 255, 0.9)' : '1px solid rgba(255, 255, 255, 0.45)';
  button.style.borderRadius = '4px';
  button.style.background = active ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.18)';
  button.style.color = '#ffffff';
  button.style.fontSize = '12px';
  button.style.fontWeight = active ? '600' : '500';
  button.style.cursor = 'pointer';
  button.style.textTransform = 'none';
  button.style.lineHeight = '1.4';
  button.style.letterSpacing = '0.01em';
  button.style.backdropFilter = 'blur(1px)';
  button.style.transition = 'background 0.2s ease, border-color 0.2s ease';
  button.style.whiteSpace = 'nowrap';
  button.setAttribute('data-active', active ? 'true' : 'false');
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function updateActiveButtons(map, selectedValue) {
  map.forEach((button, value) => {
    const active = value === selectedValue;
    styleButton(button, active);
  });
}

function createSection(container, title) {
  const section = document.createElement('div');
  section.style.marginBottom = '10px';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.fontSize = '12px';
  heading.style.fontWeight = '600';
  heading.style.letterSpacing = '0.05em';
  heading.style.textTransform = 'uppercase';
  heading.style.marginBottom = '4px';
  heading.style.opacity = '0.85';

  section.appendChild(heading);
  container.appendChild(section);

  return section;
}

export function createHUD(callbacks = {}) {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const previous = document.getElementById('hud');
  if (previous?.parentNode) {
    previous.parentNode.removeChild(previous);
  }

  const root = document.createElement('div');
  root.id = 'hud';
  root.style.position = 'fixed';
  root.style.top = '16px';
  root.style.left = '16px';
  root.style.zIndex = '20';
  root.style.background = 'rgba(15, 23, 42, 0.72)';
  root.style.borderRadius = '10px';
  root.style.padding = '12px';
  root.style.color = '#ffffff';
  root.style.fontFamily = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
  root.style.fontSize = '12px';
  root.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.35)';
  root.style.backdropFilter = 'blur(6px)';
  root.style.pointerEvents = 'auto';
  root.style.minWidth = '180px';
  root.style.userSelect = 'none';

  const buttonMaps = {
    time: new Map(),
    volume: new Map(),
    quality: new Map()
  };

  const state = readStoredState();

  const applyState = (updates = {}, { persist = true, callHandlers = true } = {}) => {
    if (!updates || typeof updates !== 'object') {
      updates = {};
    }
    if ('timeMode' in updates && !TIME_OPTIONS.includes(updates.timeMode)) {
      delete updates.timeMode;
    }
    if ('volume' in updates && !VOLUME_OPTIONS.includes(updates.volume)) {
      delete updates.volume;
    }
    if ('quality' in updates && !QUALITY_OPTIONS.includes(updates.quality)) {
      delete updates.quality;
    }

    Object.assign(state, updates);

    if (persist) {
      persistState(state);
    }

    if (callHandlers) {
      if ('timeMode' in updates) {
        callMaybeAsync(callbacks.setTimeOfDay, state.timeMode);
      }
      if ('volume' in updates) {
        callMaybeAsync(callbacks.setVolume, state.volume);
      }
      if ('quality' in updates) {
        callMaybeAsync(callbacks.setQuality, state.quality);
      }
    }
  };

  const timeSection = createSection(root, 'Time');
  [
    ['Dawn', 'dawn'],
    ['Day', 'day'],
    ['Dusk', 'dusk'],
    ['Night', 'night']
  ].forEach(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (state.timeMode === value) {
        return;
      }
      applyState({ timeMode: value });
      updateActiveButtons(buttonMaps.time, value);
    });
    timeSection.appendChild(button);
    buttonMaps.time.set(value, button);
  });

  const audioSection = createSection(root, 'Audio');
  [
    ['Mute', 0],
    ['50%', 0.5],
    ['100%', 1]
  ].forEach(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (state.volume === value) {
        return;
      }
      applyState({ volume: value });
      updateActiveButtons(buttonMaps.volume, value);
    });
    audioSection.appendChild(button);
    buttonMaps.volume.set(value, button);
  });

  const qualitySection = createSection(root, 'Quality');
  [
    ['Low', 'low'],
    ['Medium', 'medium'],
    ['High', 'high']
  ].forEach(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (state.quality === value) {
        return;
      }
      applyState({ quality: value });
      updateActiveButtons(buttonMaps.quality, value);
    });
    qualitySection.appendChild(button);
    buttonMaps.quality.set(value, button);
  });

  document.body.appendChild(root);

  updateActiveButtons(buttonMaps.time, state.timeMode);
  updateActiveButtons(buttonMaps.volume, state.volume);
  updateActiveButtons(buttonMaps.quality, state.quality);

  // Ensure handlers run once on initialization with stored values.
  callMaybeAsync(callbacks.setTimeOfDay, state.timeMode);
  callMaybeAsync(callbacks.setVolume, state.volume);
  callMaybeAsync(callbacks.setQuality, state.quality);
  persistState(state);

  return {
    element: root,
    getState() {
      return { ...state };
    },
    setState(partial) {
      applyState(partial, { persist: true, callHandlers: true });
      if (partial?.timeMode) {
        updateActiveButtons(buttonMaps.time, state.timeMode);
      }
      if (partial?.volume != null) {
        updateActiveButtons(buttonMaps.volume, state.volume);
      }
      if (partial?.quality) {
        updateActiveButtons(buttonMaps.quality, state.quality);
      }
    }
  };
}
