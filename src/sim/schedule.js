const MINUTES_PER_DAY = 24 * 60;

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return Number.NaN;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }
  const parts = trimmed.split(':');
  const hours = Number(parts[0]);
  const minutes = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const total = ((Math.floor(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeMinutes(value) {
  const minutes = Number.isFinite(value) ? value : 0;
  let normalized = minutes % MINUTES_PER_DAY;
  if (normalized < 0) {
    normalized += MINUTES_PER_DAY;
  }
  return normalized;
}

export function createScheduler({ now = '08:00', npcManager = null } = {}) {
  let currentMinutes = normalizeMinutes(parseTime(now));
  let managerRef = npcManager || null;
  const events = new Map();
  const firedToday = new Map();

  const scheduler = {
    on(timeString, callback) {
      if (typeof callback !== 'function') {
        return () => {};
      }
      const rawMinutes = parseTime(timeString);
      if (!Number.isFinite(rawMinutes)) {
        return () => {};
      }
      const minute = normalizeMinutes(rawMinutes);
      const listeners = events.get(minute) || [];
      listeners.push(callback);
      events.set(minute, listeners);
      if (!firedToday.has(minute)) {
        firedToday.set(minute, false);
      }
      if (Math.floor(currentMinutes) === minute) {
        callback(formatTime(minute), scheduler);
        firedToday.set(minute, true);
      }
      return () => {
        const list = events.get(minute);
        if (!list) return;
        const index = list.indexOf(callback);
        if (index >= 0) {
          list.splice(index, 1);
        }
      };
    },
    tick(dtSeconds) {
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
        return;
      }
      const prevMinutes = currentMinutes;
      currentMinutes += dtSeconds * 60;
      let wrapped = false;
      if (currentMinutes >= MINUTES_PER_DAY) {
        currentMinutes = normalizeMinutes(currentMinutes);
        wrapped = true;
      }

      const prevFloor = Math.floor(prevMinutes);
      const currentFloor = Math.floor(currentMinutes);

      if (wrapped) {
        firedToday.forEach((_, minute) => {
          firedToday.set(minute, false);
        });
      }

      events.forEach((listeners, minute) => {
        if (!listeners || listeners.length === 0) {
          return;
        }
        const alreadyFired = firedToday.get(minute) === true;
        let shouldFire = false;
        if (wrapped) {
          shouldFire = minute > prevFloor || minute <= currentFloor;
        } else if (!alreadyFired) {
          shouldFire = minute > prevFloor && minute <= currentFloor;
        }
        if (shouldFire) {
          const label = formatTime(minute);
          for (let i = 0; i < listeners.length; i += 1) {
            try {
              listeners[i](label, scheduler);
            } catch (error) {
              console.warn('[schedule] event handler failed', error);
            }
          }
          firedToday.set(minute, true);
        }
      });
    },
    getTime() {
      return formatTime(currentMinutes);
    },
    setNpcManager(manager) {
      managerRef = manager || null;
    },
    getNpcManager() {
      return managerRef;
    }
  };

  const dispatchToJob = () => {
    const manager = managerRef;
    if (!manager || typeof manager.getNpcs !== 'function') {
      return;
    }
    const npcs = manager.getNpcs();
    if (!Array.isArray(npcs)) {
      return;
    }
    for (let i = 0; i < npcs.length; i += 1) {
      const npc = npcs[i];
      if (!npc || !npc.job) continue;
      manager.goto?.(npc, npc.job);
    }
  };

  const dispatchToHome = () => {
    const manager = managerRef;
    if (!manager || typeof manager.getNpcs !== 'function') {
      return;
    }
    const npcs = manager.getNpcs();
    if (!Array.isArray(npcs)) {
      return;
    }
    for (let i = 0; i < npcs.length; i += 1) {
      const npc = npcs[i];
      if (!npc || !npc.home) continue;
      manager.goto?.(npc, npc.home);
    }
  };

  scheduler.on('08:00', dispatchToJob);
  scheduler.on('18:00', dispatchToHome);

  return scheduler;
}

export default createScheduler;
