export function attachWatchdog() {
  const el = document.createElement('div');
  el.id = 'watchdog';
  el.style.cssText = 'position:fixed;left:8px;top:8px;background:rgba(0,0,0,0.6);color:#0f0;font:12px/14px monospace;padding:6px 8px;border-radius:6px;white-space:pre;z-index:99999;pointer-events:none;';
  el.textContent = 'loop: init';
  document.body.appendChild(el);

  let lastTimestamp = performance.now();
  let framesThisSecond = 0;
  let fps = 0;

  return {
    tick() {
      const now = performance.now();
      framesThisSecond += 1;
      if (now - lastTimestamp >= 1000) {
        fps = framesThisSecond;
        framesThisSecond = 0;
        lastTimestamp = now;
      }
      el.style.color = '#0f0';
      el.textContent = `loop: running\nfps: ${fps.toString().padStart(2, ' ')} `;
    },
    error(message) {
      el.style.color = '#f66';
      el.textContent = `loop ERROR: ${message}`;
    }
  };
}

export default attachWatchdog;
