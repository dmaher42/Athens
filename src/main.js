import { loadGround } from './scene/ground.js';

let groundOptions = {};

export function configureGround(options = {}) {
  if (!options || typeof options !== 'object') {
    return;
  }

  groundOptions = { ...groundOptions, ...options };
}

export async function setupGround(scene, renderer) {
  const ground = await loadGround(scene, renderer, groundOptions);

  if (ground && scene && !scene.children.includes(ground)) {
    scene.add(ground);
  }

  return ground;
}
