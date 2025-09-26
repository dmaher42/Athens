let startedAt = null;
let lastError = null;

function showErrorOverlay(msg, err) {
  try {
    const id = 'athens-init-error';
    if (typeof document === 'undefined') {
      return;
    }
    if (document.getElementById(id)) return;
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);color:#fff;padding:24px;z-index:99999;font:14px/1.4 system-ui;overflow:auto;';
    d.innerHTML = '<h2 style="margin-top:0">🏛️ Athens Initialization Error</h2><p>' +
      (msg || 'Unknown error') +
      '</p><pre style="white-space:pre-wrap">' +
      (err?.stack || '') +
      '</pre><p>Press ESC to dismiss</p>';
    document.body.appendChild(d);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') d.remove();
      },
      { once: true }
    );
  } catch (_) {
    // noop
  }
}

function logPhase(label, data) {
  const t = new Date().toISOString();
  if (data !== undefined) {
    console.info(`[Athens][${t}] ${label}`, data);
  } else {
    console.info(`[Athens][${t}] ${label}`);
  }
}

async function fallbackInit() {
  logPhase('Fallback init engaged (no main/init available)');
  showErrorOverlay(
    'Main init function not available. Check that your build exports a `main()` or defines `window.initializeAthens`.'
  );
}

export default async function boot(opts = {}) {
  startedAt = Date.now();
  lastError = null;
  logPhase('Boot start');

  try {
    let candidate = null;
    if (typeof opts.main === 'function') {
      candidate = opts.main;
      logPhase('Using opts.main()');
    } else {
      try {
        const mod = await import('../main.js');
        if (typeof mod.main === 'function') {
          candidate = mod.main;
          logPhase('Using module main() from src/main.js');
        }
      } catch (e) {
        logPhase('Module main() not found (import failed). Will try globals next.');
      }
    }

    if (!candidate && typeof window !== 'undefined' && typeof window.initializeAthens === 'function') {
      candidate = window.initializeAthens;
      logPhase('Using global initializeAthens()');
    }

    if (!candidate) {
      await fallbackInit();
      return;
    }

    await candidate(opts);
    logPhase('Boot complete', { elapsedMs: Date.now() - startedAt });
  } catch (err) {
    lastError = err;
    console.error('🏛️ Athens Initialization Error - Boot Wrapper', err);
    showErrorOverlay('Error during initialization', err);
  }
}

if (typeof window !== 'undefined') {
  window.Athens = window.Athens || {};
  window.Athens.boot = (o) => boot(o);
  window.Athens.getBootInfo = () => ({ startedAt, lastError });
}
