import { main } from '../main.js';

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

export default async function boot(opts = {}) {
  startedAt = Date.now();
  lastError = null;
  logPhase('Boot start');

  try {
    const rawOptions = opts && typeof opts === 'object' ? { ...opts } : {};
    const { main: overrideMain, ...candidateOptions } = rawOptions;

    const entryPoint = typeof overrideMain === 'function' ? overrideMain : main;

    if (!candidateOptions?.preset && !candidateOptions?.skydomePreset) {
      candidateOptions.preset = 'High Noon';
    }

    await entryPoint(candidateOptions);
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
