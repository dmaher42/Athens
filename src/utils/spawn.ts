import * as THREE from 'three';

export type GroundOpts = {
  clearance?: number;  // meters to lift above ground
  rayStart?: number;   // Y to start the down ray from (relative to world)
  maxStepUp?: number;  // per-frame snap up limit
  maxDrop?: number;    // per-frame snap down limit
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
const UP   = new THREE.Vector3(0, 1, 0);

export function collectMeshesByName(root: THREE.Object3D, substrings: string[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const match = (s:string) => substrings.some(t => s.includes(t));
  root.traverse(o => {
    if ((o as any).isMesh) {
      const name = (o.name || '').toLowerCase();
      if (match(name)) out.push(o as THREE.Mesh);
    }
  });
  return out;
}

/** Compute how far below the object's origin its lowest point is (negative => origin above feet). */
export function footOffsetY(obj: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.y) || !isFinite(box.max.y)) return 0;
  return box.min.y - obj.position.y;
}

/** Adjust local position so the object's local min.y is 0 (feet at pivot). */
export function ensureFeetAtLocalZero(obj: THREE.Object3D) {
  const dy = footOffsetY(obj);
  if (isFinite(dy) && dy < 0) {
    obj.position.y -= dy;
    obj.updateMatrixWorld(true);
  }
}

/** Raycast world (x,z) down to find ground Y from provided ground meshes (or whole scene). */
export function groundYAt(
  x:number,
  z:number,
  sceneOrMeshes: THREE.Object3D | THREE.Object3D[],
  rayStart = DEF.rayStart
): number | null {
  const targets = Array.isArray(sceneOrMeshes)
    ? sceneOrMeshes
    : collectMeshesByName(sceneOrMeshes, ['ground', 'floor', 'terrain', 'plane', 'tile']);
  if (!targets.length) return null;
  const originY = Number.isFinite(rayStart) ? rayStart : DEF.rayStart;
  RAY_ORIGIN.set(x, originY, z);
  RAY.set(RAY_ORIGIN, DOWN);
  const hits = RAY.intersectObjects(targets, true);
  if (!hits.length) return null;
  return hits[0].point.y;
}

/** Place an object on ground directly under its (x,z). */
export function placeOnGround(obj: THREE.Object3D, sceneOrMeshes: THREE.Object3D | THREE.Object3D[], opts?: GroundOpts) {
  const O = { ...DEF, ...(opts||{}) };
  ensureFeetAtLocalZero(obj);
  const y = groundYAt(obj.position.x, obj.position.z, sceneOrMeshes, O.rayStart);
  if (y != null) {
    obj.position.y = y + O.clearance;
    obj.updateMatrixWorld(true);
  }
}

/** Quick test: is there a roof/ceiling directly above this world position within `height`? */
export function isIndoors(worldPos: THREE.Vector3, sceneOrMeshes: THREE.Object3D | THREE.Object3D[], height = 5): boolean {
  const targets = Array.isArray(sceneOrMeshes) ? sceneOrMeshes : collectMeshesByName(sceneOrMeshes, ['building', 'house', 'roof', 'wall']);
  if (!targets.length) return false;
  RAY.set(worldPos, UP);
  const hits = RAY.intersectObjects(targets, true);
  if (!hits.length) return false;
  return hits[0].distance < height;
}

/** Find a spawn outdoors near origin by sampling rings; returns position or null. */
export function findOutdoorSpawn(scene: THREE.Scene, opts?: { radiusStart?: number; radiusMax?: number; step?: number; samplesPerRing?: number; clearance?: number }) {
  const cfg = { radiusStart: 2, radiusMax: 80, step: 3, samplesPerRing: 12, clearance: 0.02, ...(opts||{}) };
  const grounds = collectMeshesByName(scene, ['ground', 'floor', 'terrain', 'plane', 'tile']);
  const buildings = collectMeshesByName(scene, ['building', 'house', 'roof', 'wall']);
  if (!grounds.length) return null;

  for (let r = cfg.radiusStart; r <= cfg.radiusMax; r += cfg.step) {
    for (let i = 0; i < cfg.samplesPerRing; i++) {
      const a = (i / cfg.samplesPerRing) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const gy = groundYAt(x, z, grounds);
      if (gy == null) continue;
      const pos = new THREE.Vector3(x, gy + cfg.clearance, z);
      if (!isIndoors(pos.clone().addScaledVector(UP, 0.2), buildings, 3)) {
        return pos;
      }
    }
  }
  return null;
}

/** Try a set of explicit spawn markers, else sample outdoors. */
export function chooseSpawn(scene: THREE.Scene, preferMarkers = true): THREE.Vector3 {
  if (preferMarkers) {
    const candidates: THREE.Object3D[] = [];
    scene.traverse(o => {
      const n = (o.name || '').toLowerCase();
      if (n.startsWith('spawn') || n.includes('spawnpoint') || (o.userData && (o.userData.spawn || o.userData.playerSpawn))) {
        candidates.push(o);
      }
    });
    for (const s of candidates) {
      const p = s.getWorldPosition(new THREE.Vector3());
      // Lift onto ground in case marker is slightly buried
      const g = groundYAt(p.x, p.z, scene);
      const pos = new THREE.Vector3(p.x, (g ?? p.y) + 0.02, p.z);
      if (!isIndoors(pos.clone().addScaledVector(UP, 0.2), scene, 3)) return pos;
    }
  }
  const fallback = findOutdoorSpawn(scene);
  return fallback ?? new THREE.Vector3(0, (groundYAt(0,0,scene) ?? 0) + 0.02, 0);
}
