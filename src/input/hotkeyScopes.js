import { getActionsByScope } from '../config/hotkeys.ts';

const ALWAYS_ACTIVE_SCOPES = new Set(['gameplay']);

const scopeState = new Map();
const loggedConflicts = new Set();

function ensureScopeState(scope) {
  let state = scopeState.get(scope);
  if (!state) {
    state = {
      sessions: new Set(),
      activeSessions: 0
    };
    scopeState.set(scope, state);
  }
  return state;
}

function buildScopeManifest(scope) {
  const definitions = getActionsByScope(scope);
  return definitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    codes: [...definition.codes],
    default: definition.default,
    scope: definition.scope
  }));
}

function warnDevConflicts(scope, manifest) {
  if (scope !== 'dev') {
    return;
  }

  const gameplayActions = getActionsByScope('gameplay');
  if (!gameplayActions.length || !manifest.length) {
    return;
  }

  const gameplayCodes = new Map();
  for (const action of gameplayActions) {
    for (const code of action.codes) {
      if (typeof code === 'string' && code) {
        gameplayCodes.set(code, action.id);
      }
    }
  }

  for (const action of manifest) {
    for (const code of action.codes) {
      if (typeof code !== 'string' || code === '') {
        continue;
      }
      const conflictId = gameplayCodes.get(code);
      if (!conflictId) {
        continue;
      }
      const key = `${action.id}|${code}|${conflictId}`;
      if (loggedConflicts.has(key)) {
        continue;
      }
      loggedConflicts.add(key);
      if (typeof console !== 'undefined' && console && console.warn) {
        console.warn(
          `[Athens][Hotkeys] Dev action "${action.id}" shares binding "${code}" with gameplay action "${conflictId}".`
        );
      }
    }
  }
}

export function registerScopedHotkeys(scope, callbacks = {}) {
  const state = ensureScopeState(scope);
  const session = {
    active: false,
    callbacks
  };

  state.sessions.add(session);

  const api = {
    activate() {
      if (session.active) {
        return;
      }
      session.active = true;
      state.activeSessions += 1;
      const manifest = buildScopeManifest(scope);
      warnDevConflicts(scope, manifest);
      if (typeof session.callbacks.onActivate === 'function') {
        session.callbacks.onActivate(manifest);
      }
    },
    deactivate() {
      if (!session.active) {
        return;
      }
      session.active = false;
      state.activeSessions = Math.max(0, state.activeSessions - 1);
      if (typeof session.callbacks.onDeactivate === 'function') {
        session.callbacks.onDeactivate();
      }
    },
    isActive() {
      return session.active;
    },
    dispose() {
      api.deactivate();
      state.sessions.delete(session);
    }
  };

  if (ALWAYS_ACTIVE_SCOPES.has(scope)) {
    api.activate();
  }

  return api;
}

export function getActiveScopeCount(scope) {
  const state = scopeState.get(scope);
  if (!state) {
    return ALWAYS_ACTIVE_SCOPES.has(scope) ? 1 : 0;
  }
  return state.activeSessions + (ALWAYS_ACTIVE_SCOPES.has(scope) ? 1 : 0);
}
