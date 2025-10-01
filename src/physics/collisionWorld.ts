import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { Capsule as ExampleCapsule } from 'three/examples/jsm/math/Capsule.js';

import { logger } from '../utils/logger.ts';

export type Capsule = ExampleCapsule;

export interface CollisionWorld {
  colliderMesh: THREE.Mesh | null;
  bvh: MeshBVH | null;
}

type CapsuleHit = {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  depth: number;
};

const _loader = new GLTFLoader();
const _matrixWorld = new THREE.Matrix4();
const _expandedBox = new THREE.Box3();
const _segment = new THREE.Line3();
const _trianglePoint = new THREE.Vector3();
const _segmentPoint = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _defaultCapsuleHit: CapsuleHit = {
  normal: new THREE.Vector3(0, 1, 0),
  point: new THREE.Vector3(),
  depth: 0
};

let warnedMissingColliderTags = false;
let acceleratedRaycastEnabled = false;

function ensureAcceleratedRaycast() {
  if (acceleratedRaycastEnabled) {
    return;
  }
  try {
    const meshProto = (THREE.Mesh as unknown as { prototype: { raycast: unknown } }).prototype;
    meshProto.raycast = acceleratedRaycast as unknown as typeof meshProto.raycast;
    acceleratedRaycastEnabled = true;
  } catch (error) {
    logger.warn('[collisionWorld] Failed to enable accelerated raycast.', error);
  }
}

function attachCapsuleIntersect(bvh: MeshBVH) {
  const internal = bvh as MeshBVH & {
    capsuleIntersect?: (capsule: Capsule, target?: CapsuleHit) => CapsuleHit | null;
  };
  if (typeof internal.capsuleIntersect === 'function') {
    return;
  }

  internal.capsuleIntersect = (capsule: Capsule, target: CapsuleHit = _defaultCapsuleHit) => {
    if (!capsule) {
      return null;
    }

    const result = target;
    let hit = false;
    let bestDepth = 0;

    result.depth = 0;
    result.point.set(0, 0, 0);
    result.normal.set(0, 1, 0);

    const radius = capsule.radius ?? 0;
    _segment.start.copy(capsule.start);
    _segment.end.copy(capsule.end);

    bvh.shapecast({
      intersectsBounds(box) {
        _expandedBox.copy(box);
        _expandedBox.min.addScalar(-radius);
        _expandedBox.max.addScalar(radius);
        return (
          _expandedBox.intersectsLine(_segment) ||
          _expandedBox.containsPoint(_segment.start) ||
          _expandedBox.containsPoint(_segment.end)
        );
      },
      intersectsTriangle(tri) {
        tri.needsUpdate = true;
        tri.update();
        const distance = tri.closestPointToSegment(_segment, _trianglePoint, _segmentPoint);
        if (distance <= radius) {
          const depth = radius - distance;
          if (depth > bestDepth) {
            bestDepth = depth;
            hit = true;
            result.depth = depth;
            result.point.copy(_segmentPoint);
            _normal.copy(_segmentPoint).sub(_trianglePoint);
            if (_normal.lengthSq() > 1e-10) {
              _normal.normalize();
            } else {
              tri.getNormal(_normal);
            }
            result.normal.copy(_normal);
          }
        }
        return false;
      }
    });

    return hit ? result : null;
  };
}

function collectColliderMeshes(root: THREE.Object3D) {
  const tagged: THREE.Mesh[] = [];
  const fallback: THREE.Mesh[] = [];

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }
    const mesh = child as THREE.Mesh;
    const hasTag = typeof mesh.name === 'string' && mesh.name.startsWith('COL_');
    const hasUserData = mesh.userData?.collision === true;
    if (hasTag || hasUserData) {
      tagged.push(mesh);
    } else if (mesh.visible !== false) {
      fallback.push(mesh);
    }
  });

  if (!tagged.length && fallback.length && !warnedMissingColliderTags) {
    warnedMissingColliderTags = true;
    logger.warn(
      '[collisionWorld] No meshes tagged for collision were found. Falling back to all visible meshes.'
    );
  }

  return tagged.length ? tagged : fallback;
}

function bakeGeometry(mesh: THREE.Mesh) {
  const original = mesh.geometry;
  if (!original || !original.attributes?.position) {
    return null;
  }

  const cloned = original.clone();
  mesh.updateWorldMatrix(true, false);
  _matrixWorld.copy(mesh.matrixWorld);
  cloned.applyMatrix4(_matrixWorld);
  const withIndex = cloned.index ? cloned : mergeVertices(cloned, 1e-4);
  return withIndex;
}

export function ensureCapsuleIntersection(bvh: MeshBVH | null | undefined) {
  if (!bvh) {
    return;
  }
  attachCapsuleIntersect(bvh);
}

export async function loadWorldWithColliders(
  url: string,
  scene: THREE.Scene
): Promise<CollisionWorld> {
  if (!url) {
    return { colliderMesh: null, bvh: null };
  }

  const gltf = await _loader.loadAsync(url);
  const root = gltf?.scene ?? gltf?.scenes?.[0] ?? null;
  if (!root) {
    logger.warn('[collisionWorld] GLB scene is empty:', url);
    return { colliderMesh: null, bvh: null };
  }

  if (!scene.children.includes(root)) {
    scene.add(root);
  }

  const candidates = collectColliderMeshes(root);
  if (!candidates.length) {
    return { colliderMesh: null, bvh: null };
  }

  const baked: THREE.BufferGeometry[] = [];
  for (const mesh of candidates) {
    const geometry = bakeGeometry(mesh);
    if (geometry) {
      baked.push(geometry);
    }
  }

  if (!baked.length) {
    logger.warn('[collisionWorld] Unable to bake any collider geometry from GLB:', url);
    return { colliderMesh: null, bvh: null };
  }

  const merged = mergeGeometries(baked, false);
  if (!merged) {
    logger.warn('[collisionWorld] Failed to merge collider geometries:', url);
    return { colliderMesh: null, bvh: null };
  }

  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const bvh = new MeshBVH(merged, { lazyGeneration: false });
  attachCapsuleIntersect(bvh);
  (merged as unknown as { boundsTree?: MeshBVH }).boundsTree = bvh;

  ensureAcceleratedRaycast();

  const material = new THREE.MeshBasicMaterial({ visible: false });
  const colliderMesh = new THREE.Mesh(merged, material);
  colliderMesh.name = 'CollisionWorld';
  colliderMesh.matrixAutoUpdate = false;
  colliderMesh.visible = false;
  colliderMesh.updateMatrix();
  colliderMesh.frustumCulled = false;
  scene.add(colliderMesh);

  return { colliderMesh, bvh };
}

export default loadWorldWithColliders;
