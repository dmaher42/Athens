import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _box = new THREE.Box3();

// Find ground Y under a world-space (x,z) by raycasting down from a safe height.
export function sampleGroundY(x, z, groundMeshes, { fromY = 200, far = 500 } = {}) {
  _ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  _ray.far = far;
  const hit = _ray.intersectObjects(groundMeshes, true)[0];
  return hit ? hit.point.y : null;
}

// Snap a single object so its bottom touches ground under its pivot.
export function snapObjectToGround(obj, groundMeshes, { hover = 0.02, fromY = 200 } = {}) {
  if (!obj || !groundMeshes?.length) return false;
  const y = sampleGroundY(obj.position.x, obj.position.z, groundMeshes, { fromY });
  if (y == null) return false;

  // Compute object's bottom Y in world to account for pivot not at base.
  _box.setFromObject(obj);
  const bottomY = _box.min.y;
  const delta = (y + hover) - bottomY;
  obj.position.y += delta;
  obj.updateMatrixWorld?.();
  return true;
}

// Snap a group using multiple footprint samples (center + corners of its bbox).
export function snapGroupToGround(group, groundMeshes, { hover = 0.02, fromY = 200 } = {}) {
  if (!group || !groundMeshes?.length) return false;
  _box.setFromObject(group);
  const cx = (_box.min.x + _box.max.x) * 0.5;
  const cz = (_box.min.z + _box.max.z) * 0.5;
  const sx = (_box.max.x - _box.min.x) * 0.5;
  const sz = (_box.max.z - _box.min.z) * 0.5;

  const points = [
    [cx, cz],
    [cx - sx, cz - sz],
    [cx + sx, cz - sz],
    [cx + sx, cz + sz],
    [cx - sx, cz + sz],
  ];

  const ys = points.map(([x,z]) => sampleGroundY(x, z, groundMeshes, { fromY })).filter(y => y != null);
  if (!ys.length) return false;

  // Use the median of samples to avoid single high rock pushing whole group up.
  ys.sort((a,b)=>a-b);
  const median = ys[Math.floor(ys.length/2)];

  // Shift the entire group so its bottom rests on the median ground height.
  _box.setFromObject(group);
  const bottomY = _box.min.y;
  const delta = (median + hover) - bottomY;
  group.position.y += delta;
  group.updateMatrixWorld?.();
  return true;
}

// Convenience: snap all direct children meshes/groups under a root.
export function snapChildrenToGround(root, groundMeshes, options) {
  if (!root || !groundMeshes?.length) return;
  root.children.forEach(child => {
    if (!child.visible) return;
    // Prefer group-level snap; fallback to object snap if very small
    const ok = snapGroupToGround(child, groundMeshes, options);
    if (!ok) snapObjectToGround(child, groundMeshes, options);
  });
}
