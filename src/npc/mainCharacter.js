import { createNpc } from './npcSystem.js';

function sanitizeVector(input) {
  if (!input) {
    return { x: 0, y: 0, z: 0 };
  }

  if (typeof input.isVector3 === 'boolean' && input.isVector3) {
    return { x: input.x, y: input.y, z: input.z };
  }

  const { x = 0, y = 0, z = 0 } = input;
  const toNumber = (value) => (Number.isFinite(value) ? Number(value) : 0);

  return { x: toNumber(x), y: toNumber(y), z: toNumber(z) };
}

function applyScale(object3d, scale) {
  if (!object3d) {
    return;
  }

  if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
    object3d.scale.setScalar(scale);
    return;
  }

  if (scale && typeof scale === 'object') {
    const { x = 1, y = 1, z = 1 } = scale;
    const toNumber = (value) => (Number.isFinite(value) ? Number(value) : 1);
    object3d.scale.set(toNumber(x), toNumber(y), toNumber(z));
  }
}

/**
 * Creates the primary controllable character using the NPC loader so it shares
 * animation handling and GLTF loading with ambient agents.
 *
 * @param {import('three').Scene | null | undefined} scene
 * @param {object} [options]
 * @param {string} [options.modelUrl]
 * @param {{x?:number,y?:number,z?:number} | import('three').Vector3} [options.initialPosition]
 * @param {number} [options.headingRadians]
 * @param {number|{x?:number,y?:number,z?:number}} [options.scale]
 * @returns {{ object3d: import('three').Object3D; update(deltaSeconds: number): void; dispose(): void; ready: Promise<any>; }}
 */
export function createMainCharacter(scene, options = {}) {
  const {
    modelUrl = 'models/character.glb',
    initialPosition = { x: 0, y: 0, z: 0 },
    headingRadians = 0,
    scale = 1
  } = options;

  const start = sanitizeVector(initialPosition);

  const npc = createNpc({
    modelUrl,
    initialPosition: start,
    waypoints: [start]
  });

  npc.object3d.name = 'MainCharacter';
  npc.object3d.userData.isMainCharacter = true;

  if (typeof headingRadians === 'number' && Number.isFinite(headingRadians)) {
    npc.object3d.rotation.y = headingRadians;
  }

  applyScale(npc.object3d, scale);

  if (scene && typeof scene.add === 'function') {
    scene.add(npc.object3d);
  }

  return npc;
}

export default createMainCharacter;
