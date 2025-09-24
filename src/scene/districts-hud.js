import { getDistrictAt, onDistrictsChanged } from './districts.js';

let districtLabel = null;
let activeWatcherStopper = null;

function ensureLabel() {
  if (districtLabel && districtLabel.isConnected) {
    return districtLabel;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const existing = document.getElementById('current-district');
  if (existing) {
    districtLabel = existing;
    return districtLabel;
  }

  const timeElement = document.getElementById('current-time');
  if (!timeElement) {
    return null;
  }

  const label = document.createElement('div');
  label.id = 'current-district';
  label.className = 'hud-district-label';
  label.textContent = 'Current District: Wilderness';

  const parent = timeElement.parentElement;
  if (parent) {
    if (timeElement.nextSibling) {
      parent.insertBefore(label, timeElement.nextSibling);
    } else {
      parent.appendChild(label);
    }
  } else {
    timeElement.insertAdjacentElement('afterend', label);
  }

  districtLabel = label;
  return districtLabel;
}

function updateLabel(district) {
  const label = ensureLabel();
  if (!label) {
    return;
  }

  const name = district?.name ?? 'Wilderness';
  label.textContent = `Current District: ${name}`;
  if (district?.id) {
    label.dataset.districtId = district.id;
  } else {
    delete label.dataset.districtId;
  }
}

export function initDistrictHUD() {
  return ensureLabel();
}

export function watchPlayerPosition(getWorldXZ, { intervalMs = 200 } = {}) {
  if (typeof window === 'undefined' || typeof getWorldXZ !== 'function') {
    return () => {};
  }

  if (typeof activeWatcherStopper === 'function') {
    activeWatcherStopper();
  }

  ensureLabel();

  let lastDistrictId = null;
  let stopped = false;

  const safeInterval = Math.max(50, Math.floor(intervalMs ?? 200));

  const evaluate = () => {
    if (stopped) {
      return;
    }

    let coords;
    try {
      coords = getWorldXZ();
    } catch (error) {
      return;
    }

    let x = null;
    let z = null;

    if (Array.isArray(coords)) {
      [x, z] = coords;
    } else if (coords && typeof coords === 'object') {
      if (typeof coords.x === 'number' && typeof coords.z === 'number') {
        ({ x, z } = coords);
      } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        x = coords[0];
        z = coords[1];
      }
    }

    if (typeof x === 'number' && typeof z === 'number') {
      const district = getDistrictAt(x, z);
      const nextId = district?.id ?? null;
      if (nextId !== lastDistrictId) {
        lastDistrictId = nextId;
        updateLabel(district);
      }
    } else if (lastDistrictId !== null) {
      lastDistrictId = null;
      updateLabel(null);
    }
  };

  const intervalHandle = window.setInterval(evaluate, safeInterval);
  const unsubscribe = onDistrictsChanged(() => {
    lastDistrictId = null;
    evaluate();
  });

  evaluate();

  activeWatcherStopper = () => {
    if (!stopped) {
      stopped = true;
      window.clearInterval(intervalHandle);
      unsubscribe();
      activeWatcherStopper = null;
    }
  };

  return activeWatcherStopper;
}
