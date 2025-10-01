import {
  HOTKEY_IDS,
  KEY_FALLBACK_MAP,
  getActionCodes
} from '../config/hotkeys.ts';
import { registerScopedHotkeys } from '../input/hotkeyScopes.js';

const ASCEND_ACTION = HOTKEY_IDS.flight.ascend;
const DESCEND_ACTION = HOTKEY_IDS.flight.descend;
const FLY_BYPASS_TOGGLE_ACTION = HOTKEY_IDS.dev.flyBypass.toggle;

function resolveEventCode(event) {
  const code = typeof event?.code === 'string' && event.code !== 'Unidentified' ? event.code : '';
  if (code) {
    return code;
  }
  const key = typeof event?.key === 'string' ? event.key.toLowerCase() : '';
  if (!key) {
    return '';
  }
  return KEY_FALLBACK_MAP.get(key) || '';
}

function shouldIgnoreKeyEvent(event) {
  const target = event?.target;
  if (!target || typeof target !== 'object') {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }
  return false;
}

export function installFlyBypass({ state, input }){
  if (typeof window==='undefined') return;
  window.dev = window.dev || {};
  let on = false;
  let isFlying = false;
  function toggle(){ isFlying = !isFlying; on = isFlying; if (isFlying) state.position.y += 0.5; }
  window.dev.fly = {
    on(){ isFlying = on = true; }, off(){ isFlying = on = false; }, toggle,
  };

  const toggleCodes = new Set();
  let devHotkeysActive = false;
  let keydownListener = null;

  const devSession = registerScopedHotkeys('dev', {
    onActivate(manifest) {
      toggleCodes.clear();
      const entry = Array.isArray(manifest)
        ? manifest.find((action) => action?.id === FLY_BYPASS_TOGGLE_ACTION)
        : null;
      const codes = entry?.codes ?? getActionCodes(FLY_BYPASS_TOGGLE_ACTION);
      for (const code of codes) {
        if (typeof code === 'string' && code) {
          toggleCodes.add(code);
        }
      }
      devHotkeysActive = true;
      bindKeyListener();
    },
    onDeactivate() {
      devHotkeysActive = false;
      toggleCodes.clear();
      unbindKeyListener();
    }
  });

  function matchesToggle(event) {
    if (!devHotkeysActive || toggleCodes.size === 0) {
      return false;
    }
    const resolved = resolveEventCode(event);
    return resolved ? toggleCodes.has(resolved) : false;
  }

  function handleToggleKeydown(event) {
    if (!devHotkeysActive) {
      return;
    }
    if (event?.repeat) {
      return;
    }
    if (shouldIgnoreKeyEvent(event)) {
      return;
    }
    if (matchesToggle(event)) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      toggle();
    }
  }

  function bindKeyListener() {
    if (keydownListener || typeof window === 'undefined') {
      return;
    }
    keydownListener = handleToggleKeydown;
    window.addEventListener('keydown', keydownListener, true);
  }

  function unbindKeyListener() {
    if (keydownListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', keydownListener, true);
    }
    keydownListener = null;
  }

  devSession.activate();

  return {
    tick(dt){
      if (!on) return;
      const up =
        input?.held?.(ASCEND_ACTION) ||
        input?.held?.('flyUp') ||
        input?.held?.('Space');
      const down =
        input?.held?.(DESCEND_ACTION) ||
        input?.held?.('flyDown') ||
        input?.held?.('ShiftLeft') ||
        input?.held?.('ShiftRight') ||
        input?.held?.('ControlLeft') ||
        input?.held?.('ControlRight');
      const speed = 6;
      if (up)   state.position.y += speed * dt;
      if (down) state.position.y -= speed * dt;
      if (state.velocity) state.velocity.y = 0;
    },
    dispose(){
      if (typeof devSession.dispose === 'function') {
        devSession.dispose();
      } else {
        devSession.deactivate();
      }
      unbindKeyListener();
    }
  };
}
