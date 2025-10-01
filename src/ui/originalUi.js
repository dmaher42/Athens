import { logger } from '../utils/logger.ts';

const ENVIRONMENT_LABELS = {
  high_noon: 'High Noon',
  day: 'High Noon',
  golden_hour: 'Golden Hour',
  dawn: 'Golden Dawn',
  dusk: 'Dusk',
  midnight: 'Midnight',
  night: 'Midnight'
};

const STATUS_UPDATE_INTERVAL = 0.1; // seconds

const applyStyles = (element, styles = {}) => {
  if (!element) {
    return;
  }
  Object.assign(element.style, styles);
};

const formatEnvironmentLabel = (mode) => {
  if (!mode) {
    return '';
  }
  const normalized = String(mode).toLowerCase();
  return ENVIRONMENT_LABELS[normalized] || normalized.replace(/_/g, ' ');
};

export function createOriginalUi({
  container,
  overlayCanvas,
  environmentController
} = {}) {
  const doc = container?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!container || !doc) {
    return null;
  }

  container.style.position = container.style.position || 'relative';

  const createdNodes = [];
  const cleanupFns = [];

  const root = doc.createElement('div');
  root.className = 'athens-ui-root';
  applyStyles(root, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    fontFamily: "'Cormorant Garamond', serif",
    color: '#fef9e6',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.55)',
    zIndex: '220',
    display: 'flex',
    flexDirection: 'column'
  });
  container.appendChild(root);
  createdNodes.push(root);

  const startOverlay = doc.createElement('div');
  startOverlay.className = 'athens-start-overlay';
  applyStyles(startOverlay, {
    position: 'absolute',
    inset: '0',
    background: 'rgba(0, 0, 0, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    backdropFilter: 'blur(5px)',
    transition: 'opacity 0.6s ease',
    zIndex: '260'
  });
  const startButton = doc.createElement('button');
  startButton.type = 'button';
  startButton.textContent = 'Enter Ancient Athens';
  applyStyles(startButton, {
    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.85), rgba(255, 165, 0, 0.75))',
    border: '2px solid rgba(255, 215, 0, 0.95)',
    color: '#fff',
    fontFamily: "'Cinzel', serif",
    padding: '16px 32px',
    borderRadius: '16px',
    cursor: 'pointer',
    fontSize: '20px',
    letterSpacing: '0.03em',
    textShadow: '0 0 18px rgba(255, 215, 0, 0.55)',
    boxShadow: '0 0 25px rgba(255, 215, 0, 0.45)',
    pointerEvents: 'auto'
  });
  startOverlay.appendChild(startButton);
  container.appendChild(startOverlay);
  createdNodes.push(startOverlay);

  let overlayHidden = false;
  const hideStartOverlay = () => {
    if (!startOverlay.parentNode || overlayHidden) {
      return;
    }
    overlayHidden = true;
    startOverlay.style.opacity = '0';
    startOverlay.style.pointerEvents = 'none';
    const timeout = setTimeout(() => {
      if (startOverlay.parentNode) {
        startOverlay.parentNode.removeChild(startOverlay);
      }
    }, 650);
    cleanupFns.push(() => clearTimeout(timeout));
  };

  const handleStart = (event) => {
    event?.preventDefault?.();
    hideStartOverlay();
  };
  startButton.addEventListener('click', handleStart);
  cleanupFns.push(() => startButton.removeEventListener('click', handleStart));

  const hud = doc.createElement('div');
  hud.id = 'athens-hud';
  applyStyles(hud, {
    marginTop: 'auto',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    padding: '16px 24px 22px',
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.55) 55%, transparent 100%)',
    pointerEvents: 'none',
    transition: 'transform 0.4s ease-in-out'
  });
  root.appendChild(hud);

  const hudLeft = doc.createElement('div');
  applyStyles(hudLeft, {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    pointerEvents: 'auto'
  });
  hud.appendChild(hudLeft);

  const miniMapWrapper = doc.createElement('div');
  miniMapWrapper.className = 'athens-mini-map-wrapper';
  applyStyles(miniMapWrapper, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-start',
    transition: 'opacity 0.25s ease, transform 0.25s ease'
  });
  hudLeft.appendChild(miniMapWrapper);

  const miniMapContainer = doc.createElement('div');
  miniMapContainer.className = 'athens-mini-map';
  applyStyles(miniMapContainer, {
    width: '180px',
    height: '180px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 215, 0, 0.85)',
    background: 'rgba(14, 23, 42, 0.45)',
    boxShadow: '0 0 18px rgba(255, 215, 0, 0.28)',
    overflow: 'hidden',
    position: 'relative',
    pointerEvents: 'auto',
    transition: 'opacity 0.2s ease, transform 0.2s ease'
  });
  miniMapWrapper.appendChild(miniMapContainer);

  const miniMapToggle = doc.createElement('button');
  miniMapToggle.type = 'button';
  miniMapToggle.textContent = 'Hide Map';
  applyStyles(miniMapToggle, {
    background: 'rgba(0, 0, 0, 0.65)',
    color: '#fcefb4',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    borderRadius: '999px',
    padding: '6px 14px',
    border: '1px solid rgba(255, 215, 0, 0.65)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    letterSpacing: '0.04em'
  });
  miniMapWrapper.appendChild(miniMapToggle);

  let miniMapCollapsed = false;
  const updateMiniMapState = () => {
    if (miniMapCollapsed) {
      miniMapWrapper.style.opacity = '0.65';
      miniMapWrapper.style.transform = 'scale(0.9)';
      miniMapToggle.textContent = 'Show Map';
      miniMapContainer.style.pointerEvents = 'none';
      miniMapContainer.style.opacity = '0';
    } else {
      miniMapWrapper.style.opacity = '1';
      miniMapWrapper.style.transform = 'scale(1)';
      miniMapToggle.textContent = 'Hide Map';
      miniMapContainer.style.pointerEvents = 'auto';
      miniMapContainer.style.opacity = '1';
    }
  };

  const handleMiniMapToggle = (event) => {
    event?.preventDefault?.();
    miniMapCollapsed = !miniMapCollapsed;
    updateMiniMapState();
  };
  miniMapToggle.addEventListener('click', handleMiniMapToggle);
  cleanupFns.push(() => miniMapToggle.removeEventListener('click', handleMiniMapToggle));

  const originalCanvasStyle = overlayCanvas instanceof HTMLCanvasElement ? overlayCanvas.getAttribute('style') ?? '' : '';
  if (overlayCanvas instanceof HTMLCanvasElement) {
    applyStyles(overlayCanvas, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      pointerEvents: 'auto'
    });
    miniMapContainer.appendChild(overlayCanvas);
    cleanupFns.push(() => {
      if (overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
      }
      overlayCanvas.setAttribute('style', originalCanvasStyle);
    });
  }

  const title = doc.createElement('h3');
  title.textContent = '⚱️ Ancient Athens';
  applyStyles(title, {
    margin: '0',
    fontSize: '20px',
    fontFamily: "'Cinzel', serif",
    letterSpacing: '0.04em'
  });
  hudLeft.appendChild(title);

  const currentLocationEl = doc.createElement('div');
  currentLocationEl.textContent = 'Exploring Athens';
  applyStyles(currentLocationEl, {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '300'
  });
  hudLeft.appendChild(currentLocationEl);

  const hudCenter = doc.createElement('div');
  applyStyles(hudCenter, {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    pointerEvents: 'none',
    maxWidth: '40%',
    fontSize: '13px'
  });
  hud.appendChild(hudCenter);

  const instructionRow = doc.createElement('div');
  applyStyles(instructionRow, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    rowGap: '8px'
  });
  hudCenter.appendChild(instructionRow);

  const createKeyBadge = (label) => {
    const badge = doc.createElement('span');
    badge.textContent = label;
    applyStyles(badge, {
      background: 'linear-gradient(145deg, rgba(255, 215, 0, 0.25), rgba(255, 215, 0, 0.12))',
      border: '1px solid rgba(255, 215, 0, 0.35)',
      borderRadius: '6px',
      padding: '2px 6px',
      fontWeight: '600',
      color: '#FFD700',
      letterSpacing: '0.02em'
    });
    return badge;
  };

  let hotkeyInstructions = [];

  const renderInstructions = () => {
    while (instructionRow.firstChild) {
      instructionRow.removeChild(instructionRow.firstChild);
    }
    if (!hotkeyInstructions.length) {
      return;
    }
    const fragment = doc.createDocumentFragment();
    hotkeyInstructions.forEach((entry, index) => {
      if (index > 0) {
        const divider = doc.createElement('span');
        divider.textContent = '|';
        applyStyles(divider, { opacity: '0.65' });
        fragment.appendChild(divider);
      }
      fragment.appendChild(createKeyBadge(entry.label));
      const text = doc.createElement('span');
      text.textContent = ` ${entry.description}`;
      applyStyles(text, { opacity: '0.85' });
      fragment.appendChild(text);
    });
    instructionRow.appendChild(fragment);
  };

  const setHotkeyInstructions = (instructions = []) => {
    if (!Array.isArray(instructions)) {
      hotkeyInstructions = [];
      renderInstructions();
      return;
    }
    hotkeyInstructions = instructions
      .filter((entry) => entry && typeof entry.label === 'string' && entry.label && typeof entry.description === 'string')
      .map((entry) => ({
        label: entry.label,
        description: entry.description
      }));
    renderInstructions();
  };

  setHotkeyInstructions();

  const hudRight = doc.createElement('div');
  applyStyles(hudRight, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    pointerEvents: 'auto'
  });
  hud.appendChild(hudRight);

  const timeRow = doc.createElement('div');
  applyStyles(timeRow, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });
  hudRight.appendChild(timeRow);

  const timeLabelPrefix = doc.createElement('span');
  timeLabelPrefix.textContent = '🌅 Time:';
  applyStyles(timeLabelPrefix, {
    fontFamily: "'Cinzel', serif",
    fontWeight: '600',
    letterSpacing: '0.05em'
  });
  timeRow.appendChild(timeLabelPrefix);

  const timeLabel = doc.createElement('span');
  timeLabel.textContent = formatEnvironmentLabel(environmentController?.mode) || 'High Noon';
  applyStyles(timeLabel, {
    fontSize: '15px',
    fontWeight: '500'
  });
  timeRow.appendChild(timeLabel);

  const statusRow = doc.createElement('div');
  applyStyles(statusRow, {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase'
  });
  hudRight.appendChild(statusRow);

  const flightStatus = doc.createElement('span');
  flightStatus.textContent = 'Grounded';
  applyStyles(flightStatus, { opacity: '0.75' });
  statusRow.appendChild(flightStatus);

  const speedStatus = doc.createElement('span');
  speedStatus.textContent = 'Walking';
  applyStyles(speedStatus, { opacity: '0.75' });
  statusRow.appendChild(speedStatus);

  const toggleHudButton = doc.createElement('button');
  toggleHudButton.type = 'button';
  toggleHudButton.textContent = 'Hide UI';
  applyStyles(toggleHudButton, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'calc(100% - 1px)',
    padding: '6px 18px',
    borderRadius: '12px 12px 0 0',
    background: 'rgba(0, 0, 0, 0.65)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#fff',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    letterSpacing: '0.04em'
  });
  hud.appendChild(toggleHudButton);

  let hudHidden = false;
  const updateHudVisibility = () => {
    hud.style.transform = hudHidden ? 'translateY(100%)' : 'translateY(0)';
    toggleHudButton.textContent = hudHidden ? 'Show UI' : 'Hide UI';
  };

  const handleHudToggle = (event) => {
    event?.preventDefault?.();
    hudHidden = !hudHidden;
    updateHudVisibility();
  };
  toggleHudButton.addEventListener('click', handleHudToggle);
  cleanupFns.push(() => toggleHudButton.removeEventListener('click', handleHudToggle));

  updateMiniMapState();
  updateHudVisibility();

  let statusAccumulator = 0;
  const updateStatus = (deltaSeconds = 0, { position, isFlying, isRunning } = {}) => {
    if (!Number.isFinite(deltaSeconds)) {
      deltaSeconds = 0;
    }
    statusAccumulator += Math.max(deltaSeconds, 0);
    if (statusAccumulator < STATUS_UPDATE_INTERVAL) {
      return;
    }
    statusAccumulator = 0;

    if (position && typeof position.x === 'number' && typeof position.z === 'number') {
      currentLocationEl.textContent = `Position: X ${Math.round(position.x)} · Z ${Math.round(position.z)}`;
    }

    if (typeof isFlying === 'boolean') {
      flightStatus.textContent = isFlying ? 'Flight Mode' : 'Grounded';
      flightStatus.style.opacity = isFlying ? '1' : '0.75';
    }

    if (typeof isRunning === 'boolean' || typeof isFlying === 'boolean') {
      if (isFlying) {
        speedStatus.textContent = 'Airborne';
      } else if (isRunning) {
        speedStatus.textContent = 'Running';
      } else {
        speedStatus.textContent = 'Walking';
      }
    }
  };

  const api = {
    setTimeLabel(value) {
      timeLabel.textContent = value || '';
    },
    setCurrentLocation(value) {
      currentLocationEl.textContent = value || '';
    },
    setHotkeyInstructions,
    update(deltaSeconds, state) {
      updateStatus(deltaSeconds, state);
    },
    hideStartOverlay,
    dispose() {
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch (error) {
          logger.warn('[Athens][UI] Failed to run cleanup handler.', error);
        }
      });
      cleanupFns.length = 0;
      while (createdNodes.length) {
        const node = createdNodes.pop();
        if (node?.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    }
  };

  return api;
}

export default createOriginalUi;
