// src/safety/hardenPositions.ts
import * as THREE from 'three';

export type Defaults = {
  player: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
};

function clampFiniteVec3(v: THREE.Vector3, def: { x:number; y:number; z:number }) {
  if (!Number.isFinite(v.x)) v.x = def.x;
  if (!Number.isFinite(v.y)) v.y = def.y;
  if (!Number.isFinite(v.z)) v.z = def.z;
  const C = 1e6;
  v.x = Math.max(-C, Math.min(C, v.x));
  v.y = Math.max(-C, Math.min(C, v.y));
  v.z = Math.max(-C, Math.min(C, v.z));
  return v;
}
function isFiniteVec3(v: THREE.Vector3) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * Wraps renderer.render() so positions are sanitized *right before every draw*.
 * This mirrors the manual console fix users applied with ?headlessSmoke=1.
 */
export function installRenderGuard(opts: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls?: { target?: THREE.Vector3; addEventListener?: (t: string, cb: () => void) => void };
  defaults?: Defaults;
  playerNameCandidates?: string[];
}) {
  const {
    scene, camera, renderer, controls,
    defaults = { player: { x:0, y:1, z:0 }, camera: { x:20, y:12, z:20 } },
    playerNameCandidates = ['MainCharacter', 'Player']
  } = opts;

  function getPlayer(): THREE.Object3D | undefined {
    for (const name of playerNameCandidates) {
      const o = scene.getObjectByName(name);
      if (o) return o;
    }
    return undefined;
  }

  function harden() {
    const player = getPlayer();

    // Camera & player must be finite every frame
    clampFiniteVec3(camera.position, defaults.camera);
    if (player) clampFiniteVec3((player as any).position, defaults.player);

    // Keep controls target valid if present
    const tgt = (controls as any)?.target as THREE.Vector3 | undefined;
    if (tgt) {
      if (!isFiniteVec3(tgt)) {
        if (player) tgt.copy((player as any).position);
        else tgt.set(defaults.player.x, defaults.player.y, defaults.player.z);
      }
    }

    // Always look at something valid
    const look = player
      ? (player as any).position
      : new THREE.Vector3(defaults.player.x, defaults.player.y, defaults.player.z);
    camera.lookAt(look);
  }

  // Run once now (covers first paint) and on every draw
  harden();
  const origRender = renderer.render.bind(renderer);
  (renderer as any).render = (sc: THREE.Scene, cam: THREE.Camera) => {
    try { harden(); } catch {}
    return origRender(sc, cam);
  };

  // Also harden when controls emit changes
  if (controls?.addEventListener) controls.addEventListener('change', harden);
}
