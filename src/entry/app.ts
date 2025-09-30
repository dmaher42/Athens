// @ts-nocheck

import './block-remote-guard.js';
import { createAthensApp } from '../app/lifecycle.ts';

const athensApp = createAthensApp();

const run = athensApp.run;
const getContext = athensApp.getContext;

const wrapRun = (options = {}) => run(options);

if (typeof window !== 'undefined') {
  const globalWindow = /** @type {Window & Record<string, unknown>} */ (window);
  globalWindow.runApp = wrapRun;
  globalWindow.runAthens = wrapRun;
  globalWindow.initializeAthens = wrapRun;
  globalWindow.getAthensContext = async () => {
    try {
      return await getContext();
    } catch {
      return undefined;
    }
  };

  window.dispatchEvent(
    new CustomEvent('athens:initializer-ready', {
      detail: { initializer: wrapRun, source: 'app.ts' }
    })
  );

  console.log('[Athens] initializer ready');
}

wrapRun().catch((error) => {
  console.error('[Athens] Failed to initialize.', error);
});

export { wrapRun as runApp };
export default wrapRun;
