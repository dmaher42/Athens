import { loadGround } from './scene/ground.js';

export async function setupGround(scene, renderer) {
  const ground = await loadGround(scene, renderer);

  if (ground && scene && !scene.children.includes(ground)) {
    scene.add(ground);
  }

  return ground;
}
