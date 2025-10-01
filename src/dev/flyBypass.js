import { HOTKEY_IDS } from '../config/hotkeys.ts';

const ASCEND_ACTION = HOTKEY_IDS.flight.ascend;
const DESCEND_ACTION = HOTKEY_IDS.flight.descend;

export function installFlyBypass({ state, input }){
  if (typeof window==='undefined') return;
  window.dev = window.dev || {};
  let on = false;
  let isFlying = false;
  function toggle(){ isFlying = !isFlying; on = isFlying; if (isFlying) state.position.y += 0.5; }
  window.dev.fly = {
    on(){ isFlying = on = true; }, off(){ isFlying = on = false; }, toggle,
  };
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
    }
  };
}
