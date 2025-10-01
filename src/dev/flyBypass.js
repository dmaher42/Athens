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
      const up = Boolean(input?.held?.('flyUp'));
      const down = Boolean(input?.held?.('flyDown'));
      const speed = 6;
      if (up)   state.position.y += speed * dt;
      if (down) state.position.y -= speed * dt;
      if (state.velocity) state.velocity.y = 0;
    }
  };
}
