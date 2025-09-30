import { logger } from '../utils/logger.ts';

// SKYSYS_START
export function installSkyDev({ scene, renderer, camera }) {
  if (typeof window === 'undefined') return;
  window.dev = window.dev || {};
  window.dev.sky = window.dev.sky || {};

  window.dev.sky.status = () => {
    logger.info('[sky] status', {
      hasBackground: !!scene.background,
      hasEnvironment: !!scene.environment,
      clearAlpha: renderer.getClearAlpha?.(),
      autoClear: renderer.autoClear,
      fog: !!scene.fog,
      cameraFar: camera.far,
    });
  };
}
// SKYSYS_END
