import { main } from '../main.js';

const describeBootstrapEntrypoint = (entrypoint) => {
  if (typeof entrypoint !== 'function') {
    return 'unavailable';
  }

  const name = entrypoint.name || 'anonymous';
  const source = entrypoint?.[Symbol.for('athens.initializer.source')] || 'module:unknown';

  return `${name} (${source})`;
};

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

export default async function boot(opts = {}) {
  startedAt = Date.now();
  lastError = null;

  const options = opts && typeof opts === 'object' ? { ...opts } : {};

  if (!options?.preset && !options?.skydomePreset) {
    options.preset = 'High Noon';
  }

  console.info('[Athens][Bootstrap] Booting', {
    entrypoint: describeBootstrapEntrypoint(main),
    options
  });

  try {
    await main(options);
    console.info('[Athens][Bootstrap] Boot complete', {
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    lastError = err;
    console.error('🏛️ Athens Initialization Error - Boot Wrapper', err);
    showErrorOverlay('Error during initialization', err);
    throw err;
  }
}

if (typeof window !== 'undefined') {
  window.Athens = window.Athens || {};
  window.Athens.boot = (o) => {
    const startBoot = () => boot(o);

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', startBoot, { once: true });
    } else {
      startBoot();
    }
  };
  window.Athens.getBootInfo = () => ({ startedAt, lastError });
}
