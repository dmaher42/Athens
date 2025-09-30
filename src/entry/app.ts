import './block-remote-guard.js';
import runApp, { getAthensContext, getInitializationState, type AthensContext } from '../runtime/runApp.ts';

export type { AthensContext };
export { getAthensContext, getInitializationState, runApp };
export default runApp;

const globalWindow = window as Window & {
  runAthens?: typeof runApp;
  getAthensContext?: () => ReturnType<typeof getAthensContext>;
};

globalWindow.runAthens = runApp;
globalWindow.getAthensContext = getAthensContext;

window.dispatchEvent(
  new CustomEvent('athens:initializer-ready', {
    detail: { initializer: runApp, source: 'app.ts' }
  })
);
console.log('[Athens] initializer ready');

runApp().catch((error) => {
  console.error('[Athens] Failed to initialize.', error);
});
