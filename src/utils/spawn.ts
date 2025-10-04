import * as THREE from 'three';

export type GroundOpts = {
  clearance?: number; // meters to lift above ground
  rayStart?: number; // Y to start the down ray from (relative to world)
  maxStepUp?: number; // per-frame snap up limit
  maxDrop?: number; // per-frame snap down limit
  camera?: THREE.Camera | null; // raycaster camera (required when sprites exist)
  far?: number; // optional override for raycaster far distance
};

const DEF: Required<GroundOpts> = {
  clearance: 0.02,
  rayStart: 1000,
  maxStepUp: 1,
  maxDrop: 4,
  camera: null,
  far: Infinity
};

const RAY = new THREE.Raycaster();
const RAY_ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const WALKABLE = [] as THREE.Object3D[];

function resolveCamera(input?: THREE.Camera | null): THREE.Camera | null {
  if (input && typeof input === 'object') {
    return input;
  }
  const globalObject = typeof window !== 'undefined'
    ? (window as unknown as Record<string, any>)
    : typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, any>)
      : null;
  const candidate = globalObject?.camera;
  if (candidate && typeof candidate === 'object') {
    if ((candidate as any).isCamera || (candidate as any).isPerspectiveCamera || (candidate as any).isOrthographicCamera) {
      return candidate as THREE.Camera;
    }
  }
  return null;
}

export function collectMeshesByName(root: THREE.Object3D, substrings: string[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const match = (s: string) => substrings.some((needle) => s.includes(needle));
  root.traverse((node) => {
    if ((node as any).isSprite || (node as any).isPoints) {
      return;
    }
    if ((node as any).isMesh || (node as any).isInstancedMesh) {
      const name = (node.name || '').toLowerCase();
      if (match(name)) {
        out.push(node as THREE.Mesh);
      }
    }
  });
  return out;
}

function collectWalkable(sceneOrMeshes: THREE.Object3D | THREE.Object3D[]): THREE.Object3D[] {
  WALKABLE.length = 0;
  const pushCandidate = (candidate: THREE.Object3D | null | undefined) => {
    if (!candidate) return;
    if ((candidate as any).isSprite || (candidate as any).isPoints) {
      return;
    }
    if ((candidate as any).isMesh || (candidate as any).isInstancedMesh) {
      WALKABLE.push(candidate);
      return;
    }
    if (typeof candidate.traverse === 'function') {
      candidate.traverse((child) => {
        if (!child) return;
        if ((child as any).isSprite || (child as any).isPoints) {
          return;
        }
        if ((child as any).isMesh || (child as any).isInstancedMesh) {
          WALKABLE.push(child);
        }
      });
    }
  };

  if (Array.isArray(sceneOrMeshes)) {
    for (const candidate of sceneOrMeshes) {
      pushCandidate(candidate);
    }
  } else if (sceneOrMeshes) {
    pushCandidate(sceneOrMeshes);
  }
  return WALKABLE;
}

export function footOffsetY(obj: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.y) || !isFinite(box.max.y)) {
    return 0;
  }
  return box.min.y - obj.position.y;
}

export function ensureFeetAtLocalZero(obj: THREE.Object3D) {
  const offset = footOffsetY(obj);
  if (isFinite(offset) && offset < 0) {
    obj.position.y -= offset;
    obj.updateMatrixWorld(true);
  }
}

type GroundRayOptions = {
  rayStart?: number;
  camera?: THREE.Camera | null;
  far?: number;
};

function normalizeGroundRayOptions(input?: number | GroundRayOptions): GroundRayOptions {
  if (typeof input === 'number') {
    return { rayStart: input };
  }
  if (input && typeof input === 'object') {
    return input;
  }
  return {};
}

export function groundYAt(
  x: number,
  z: number,
  sceneOrMeshes: THREE.Object3D | THREE.Object3D[],
  opts?: number | GroundRayOptions
): number | null {
  const options = normalizeGroundRayOptions(opts);
  const baseTargets = Array.isArray(sceneOrMeshes)
    ? sceneOrMeshes
    : collectMeshesByName(sceneOrMeshes, ['ground', 'floor', 'terrain', 'plane', 'tile']);
  const targets = collectWalkable(baseTargets);
  if (!targets.length) {
    return null;
  }

  const originY = Number.isFinite(options.rayStart) ? options.rayStart! : DEF.rayStart;
  RAY_ORIGIN.set(x, originY, z);
  RAY.set(RAY_ORIGIN, DOWN);
  const far = Number.isFinite(options.far) && options.far! > 0 ? options.far! : Infinity;
  RAY.far = far;
  RAY.camera = resolveCamera(options.camera);
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
  const y = groundYAt(obj.position.x, obj.position.z, sceneOrMeshes, {
    rayStart: options.rayStart,
    camera: options.camera ?? null,
    far: options.far
  });
  if (y != null) {
    obj.position.y = y + options.clearance;
    obj.updateMatrixWorld(true);
  }
}
