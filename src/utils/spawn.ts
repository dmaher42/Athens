import * as THREE from 'three';

export type GroundOpts = {
  clearance?: number; // meters to lift above ground
  rayStart?: number; // Y to start the down ray from (relative to world)
  maxStepUp?: number; // per-frame snap up limit
  maxDrop?: number; // per-frame snap down limit
};

const DEF: Required<GroundOpts> = {
  clearance: 0.02,
  rayStart: 1000,
  maxStepUp: 1,
  maxDrop: 4,
};

const RAY = new THREE.Raycaster();
const RAY_ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export function collectMeshesByName(root: THREE.Object3D, substrings: string[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const match = (s: string) => substrings.some((needle) => s.includes(needle));
  root.traverse((node) => {
    if ((node as any).isMesh) {
      const name = (node.name || '').toLowerCase();
      if (match(name)) {
        out.push(node as THREE.Mesh);
      }
    }
  });
  return out;
}

export function footOffsetY(obj: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(obj);
  if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) {
    return 0;
  }

  const parent = obj.parent;
  const min = box.min.clone();

  if (parent?.isObject3D) {
    parent.worldToLocal(min);
  }

  return Number.isFinite(min.y) ? min.y : 0;
}

export function ensureFeetAtLocalZero(obj: THREE.Object3D) {
  if (!obj) {
    return;
  }

  obj.updateMatrixWorld(true);

  const offset = footOffsetY(obj);
  if (!Number.isFinite(offset) || Math.abs(offset) <= 1e-6) {
    return;
  }

  obj.position.y -= offset;
  obj.updateMatrixWorld(true);
}

export function groundYAt(
  x: number,
  z: number,
  sceneOrMeshes: THREE.Object3D | THREE.Object3D[],
  rayStart = DEF.rayStart
): number | null {
  const targets = Array.isArray(sceneOrMeshes)
    ? sceneOrMeshes
    : collectMeshesByName(sceneOrMeshes, ['ground', 'floor', 'terrain', 'plane', 'tile']);
  if (!targets.length) {
    return null;
  }

  const originY = Number.isFinite(rayStart) ? rayStart : DEF.rayStart;
  RAY_ORIGIN.set(x, originY, z);
  RAY.set(RAY_ORIGIN, DOWN);
  const hits = RAY.intersectObjects(targets, true);
  if (!hits.length) {
    return null;
  }
  return hits[0].point.y;
}

export function placeOnGround(
  obj: THREE.Object3D,
  sceneOrMeshes: THREE.Object3D | THREE.Object3D[],
  opts?: GroundOpts
) {
  const options = { ...DEF, ...(opts || {}) };
  ensureFeetAtLocalZero(obj);
  const y = groundYAt(obj.position.x, obj.position.z, sceneOrMeshes, options.rayStart);
  if (y != null) {
    obj.position.y = y + options.clearance;
    obj.updateMatrixWorld(true);
  }
}
