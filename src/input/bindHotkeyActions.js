import { getActionCodes } from '../config/hotkeys.ts';
import { logger } from '../utils/logger.ts';
import { registerScopedHotkeys } from './hotkeyScopes.js';
import { resolveEventCode, shouldIgnoreKeyEvent } from './keyEventUtils.js';

function normalizeHandlers(actionHandlers = {}) {
  const map = new Map();
  if (!actionHandlers || typeof actionHandlers !== 'object') {
    return map;
  }
  for (const [actionId, handler] of Object.entries(actionHandlers)) {
    if (typeof handler === 'function' && typeof actionId === 'string' && actionId) {
      map.set(actionId, handler);
    }
  }
  return map;
}

export function bindHotkeyActions(actionHandlers, { scope = 'gameplay' } = {}) {
  if (typeof window === 'undefined') {
    return {
      dispose() {}
    };
  }

  const handlers = normalizeHandlers(actionHandlers);
  if (!handlers.size) {
    return {
      dispose() {}
    };
  }

  const codeToHandlers = new Map();
  let keydownListener = null;
  let active = false;

  function rebuild(manifest) {
    codeToHandlers.clear();
    const manifestMap = new Map();
    if (Array.isArray(manifest)) {
      for (const entry of manifest) {
        if (entry && typeof entry.id === 'string') {
          manifestMap.set(entry.id, entry);
        }
      }
    }

    for (const [actionId, handler] of handlers.entries()) {
      const manifestEntry = manifestMap.get(actionId);
      const codes = Array.isArray(manifestEntry?.codes) && manifestEntry.codes.length
        ? manifestEntry.codes
        : getActionCodes(actionId);
      for (const code of codes) {
        if (typeof code !== 'string' || code === '') {
          continue;
        }
        const existing = codeToHandlers.get(code);
        if (existing) {
          existing.push({ id: actionId, handler });
        } else {
          codeToHandlers.set(code, [{ id: actionId, handler }]);
        }
      }
    }
  }

  function handleKeydown(event) {
    if (!active || event?.repeat) {
      return;
    }
    if (shouldIgnoreKeyEvent(event)) {
      return;
    }
    const resolved = resolveEventCode(event);
    if (!resolved) {
      return;
    }
    const mapped = codeToHandlers.get(resolved);
    if (!mapped || !mapped.length) {
      return;
    }
    let handled = false;
    for (const entry of mapped) {
      try {
        const result = entry.handler({ actionId: entry.id, event });
        if (result !== false) {
          handled = true;
        }
      } catch (error) {
        logger.warn('[Athens][Hotkeys] Action handler failed.', error);
      }
    }
    if (handled) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  }

  function bindListener() {
    if (keydownListener || typeof window === 'undefined') {
      return;
    }
    keydownListener = handleKeydown;
    window.addEventListener('keydown', keydownListener, true);
  }

  function unbindListener() {
    if (keydownListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', keydownListener, true);
    }
    keydownListener = null;
  }

  const session = registerScopedHotkeys(scope, {
    onActivate(manifest) {
      active = true;
      rebuild(manifest);
      bindListener();
    },
    onDeactivate() {
      active = false;
      codeToHandlers.clear();
      unbindListener();
    }
  });

  session.activate?.();

  return {
    dispose() {
      unbindListener();
      codeToHandlers.clear();
      if (typeof session.dispose === 'function') {
        session.dispose();
      } else if (typeof session.deactivate === 'function') {
        session.deactivate();
      }
    }
  };
}
