import './block-remote-guard.js';
import { createAthensApp, type AthensApp } from '../app/lifecycle.ts';
import type { AthensContext, RunAppOptions } from '../app/runApp.ts';

const athensApp: AthensApp = createAthensApp();

const { run, getContext } = athensApp;

const wrapRun = (options: RunAppOptions = {}): Promise<AthensContext> => run(options);

declare global {
  interface Window {
    runApp?: typeof wrapRun;
    runAthens?: typeof wrapRun;
    initializeAthens?: typeof wrapRun;
    getAthensContext?: () => Promise<AthensContext | undefined>;
  }
}

if (typeof window !== 'undefined') {
  window.runApp = wrapRun;
  window.runAthens = wrapRun;
  window.initializeAthens = wrapRun;
  window.getAthensContext = async () => {
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

wrapRun().catch((error: unknown) => {
  console.error('[Athens] Failed to initialize.', error);
});

export { wrapRun as runApp };
export default wrapRun;
