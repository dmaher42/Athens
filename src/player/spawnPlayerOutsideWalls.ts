import * as THREE from 'three';
import { computeHalfBodyHeight } from './spawnUtils.ts';
import { findWallsBounds, pickSpawnOutside } from './spawnOutsideWalls.ts';
import { groundYAt } from './placeOnGroundSafe.ts';

export type SkipFlag = { value: number } | null;

const DEFAULT_FALLBACK = { x: 20, z: -20, yaw: 0 };
const UP_AXIS = new THREE.Vector3(0, 1, 0);

function sanitizeNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export async function spawnPlayerOutsideWalls(opts: {
  scene: THREE.Scene;
  player: THREE.Object3D;
  controller?: { setPosition?: (x: number, y: number, z: number) => void } | null;
  groundObjects?: THREE.Object3D[] | null;
  halfBodyOverride?: number;
  margin?: number;
  faceYaw?: number;
  skipSnapFramesFlag?: SkipFlag;
}) {
  const {
    scene,
    player,
    controller,
    groundObjects = null,
    halfBodyOverride,
    margin = 6,
    faceYaw,
    skipSnapFramesFlag
  } = opts;

  if (!scene || !player) return;

  const wallsBox = findWallsBounds(scene);
  const spawnBase = wallsBox ? pickSpawnOutside(wallsBox, margin) : DEFAULT_FALLBACK;
  const x = sanitizeNumber(spawnBase.x, DEFAULT_FALLBACK.x);
  const z = sanitizeNumber(spawnBase.z, DEFAULT_FALLBACK.z);
  const yaw = typeof faceYaw === 'number' && Number.isFinite(faceYaw) ? faceYaw : sanitizeNumber(spawnBase.yaw, 0);

  const groundY = groundYAt(scene, x, z, 1000, groundObjects ?? null);
  const resolvedGroundY = Number.isFinite(groundY) ? groundY : 0;

  let halfHeight: number;
  if (Number.isFinite(halfBodyOverride) && (halfBodyOverride as number) > 0.05) {
    halfHeight = halfBodyOverride as number;
  } else {
    halfHeight = computeHalfBodyHeight(player);
  }
  if (!Number.isFinite(halfHeight) || halfHeight <= 0) {
    halfHeight = 0.9;
  }

  const targetY = resolvedGroundY + halfHeight;

  if (controller?.setPosition) {
    controller.setPosition(x, targetY, z);
  } else if (player.position) {
    player.position.set(x, targetY, z);
  }

  if (player.quaternion) {
    player.quaternion.setFromAxisAngle(UP_AXIS, yaw);
  }

  player.updateMatrixWorld?.(true);

  if (skipSnapFramesFlag && typeof skipSnapFramesFlag === 'object') {
    skipSnapFramesFlag.value = Number.isFinite(skipSnapFramesFlag.value) ? Math.max(1, Math.floor(skipSnapFramesFlag.value)) : 1;
    skipSnapFramesFlag.value += 1;
  }
}
