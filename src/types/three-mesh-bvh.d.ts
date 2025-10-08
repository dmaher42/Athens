import type { Capsule as ExampleCapsule } from 'three/examples/jsm/math/Capsule.js';

declare module 'three-mesh-bvh' {
  interface MeshBVH {
    capsuleIntersect?: (
      capsule: ExampleCapsule,
      target?: { normal: import('three').Vector3; point: import('three').Vector3; depth: number }
    ) => { normal: import('three').Vector3; point: import('three').Vector3; depth: number } | null;
  }
}