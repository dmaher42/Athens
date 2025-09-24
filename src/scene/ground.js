// src/scene/ground.js
import { createGroundLayered } from '../ground/index.js';

// Signature stays the same as your current code expects.
export async function loadGround(scene, renderer, options = {}) {
  const {
    // simple defaults
    size = 400,
    repeat = 32,
    showDirt = true,
    showGrass = false,

    // allow detailed overrides
    dirtOptions = {},
    grassOptions = {},
  } = options;

  const ground = createGroundLayered({
    dirtOptions: { size, repeat, height: 0,    ...dirtOptions },
    grassOptions:{ size, repeat, height: 0.02, ...grassOptions },
    showDirt,
    showGrass,
  });

  if (scene) scene.add(ground.root);

  // ground = { root, dirt, grass }
  return ground;
}
