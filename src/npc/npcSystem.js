import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { assetUrl } from '../utils/assetUrl.js';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';

const loader = new GLTFLoader();
const DEFAULT_SPEED = 1.6; // meters per second
const DEFAULT_IDLE_SECONDS = 2.5;
const tempDirection = new THREE.Vector3();
const moveDelta = new THREE.Vector3();
const actualMove = new THREE.Vector3();
const separationBuffer = [];
const separationVector = new THREE.Vector3();

function toVector3(value) {
  if (!value) {
    return null;
  }
  if (value.isVector3) {
    return value.clone();
  }
  const { x, y, z } = value;
  if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
    return new THREE.Vector3(x, y, z);
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  }
  return null;
}

function buildPlaceholderModel() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.8, metalness: 0.1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5, metalness: 0.05 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.0, 8, 16), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), headMaterial);
  head.position.y = 1.6;
  head.castShadow = true;
  head.receiveShadow = true;

  group.add(body, head);
  return group;
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    }
    if (child.isSprite) {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
}

export function createNpc({
  modelUrl = null,
  initialPosition = null,
  waypoints = [],
  speed = DEFAULT_SPEED,
  idleSeconds = DEFAULT_IDLE_SECONDS,
  colliders = null
} = {}) {
  const object3d = new THREE.Group();
  object3d.name = 'NPC';
  object3d.userData.isNpc = true;

  const path = Array.isArray(waypoints)
    ? waypoints.map((point) => toVector3(point)).filter((point) => point && point.isVector3)
    : [];

  const startPosition = toVector3(initialPosition) || path[0]?.clone() || new THREE.Vector3();
  object3d.position.copy(startPosition);

  if (!path.length) {
    path.push(startPosition.clone());
  }

  let nextIndex = path.length > 1 ? 1 : 0;
  let dwellTime = 0;
  let disposed = false;

  const npcState = {
    mixer: null,
    root: null,
    ready: null,
    physics: {
      vy: 0,
      lastGoodY: startPosition.y,
      yaw: 0
    },
    capsule: new Capsule(0.4, 1.5),
    colliders: Array.isArray(colliders) ? colliders : null
  };
  const capsuleOffset = npcState.capsule.height * 0.5 + npcState.capsule.radius;
  npcState.capsuleOffset = capsuleOffset;

  const syncCapsule = () => {
    npcState.capsule.setPosition(
      object3d.position.x,
      object3d.position.y + capsuleOffset,
      object3d.position.z
    );
  };

  syncCapsule();

  if (path.length > 1) {
    tempDirection.subVectors(path[1], startPosition);
    tempDirection.y = 0;
    if (tempDirection.lengthSq() > 1e-6) {
      npcState.physics.yaw = Math.atan2(tempDirection.x, tempDirection.z);
    }
  }

  const normalizedSpeed = Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED;
  const normalizedIdle = Number.isFinite(idleSeconds) && idleSeconds >= 0 ? idleSeconds : DEFAULT_IDLE_SECONDS;

  const attachModel = (modelGroup) => {
    if (!modelGroup) {
      return;
    }
    npcState.root = modelGroup;
    object3d.add(modelGroup);

    const euler = new THREE.Euler();
    euler.setFromQuaternion(modelGroup.quaternion, 'YXZ');
    const pitch = Math.abs(THREE.MathUtils.radToDeg(euler.x));
    const roll = Math.abs(THREE.MathUtils.radToDeg(euler.z));
    if (pitch > 15 || roll > 15) {
      modelGroup.rotation.x = 0;
      modelGroup.rotation.z = 0;
    }
  };

  const normalizeModelUrl = (input) => {
    if (!input) {
      return null;
    }

    if (typeof input !== 'string') {
      return resolveAssetUrl(input);
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (/^(https?:)?\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (/^\/assets\/models\//i.test(trimmed)) {
      return assetUrl(trimmed);
    }

    if (/^assets\/models\//i.test(trimmed)) {
      return assetUrl(trimmed);
    }

    const assetsIndex = trimmed.toLowerCase().indexOf('assets/models/');
    if (assetsIndex >= 0) {
      const relativeAssetPath = trimmed.slice(assetsIndex).replace(/^\/+/, '');
      return assetUrl(relativeAssetPath);
    }

    const normalized = trimmed.replace(/^\/+/, '');
    if (normalized.toLowerCase().startsWith('models/')) {
      return assetUrl(`assets/models/${normalized.slice('models/'.length)}`);
    }

    return resolveAssetUrl(trimmed);
  };

  const loadModel = async () => {
    if (!modelUrl) {
      attachModel(buildPlaceholderModel());
      return null;
    }

    try {
      const resolvedUrl = normalizeModelUrl(modelUrl);
      if (!resolvedUrl) {
        attachModel(buildPlaceholderModel());
        return null;
      }
      const gltf = await loader.loadAsync(resolvedUrl);
      const scene = gltf?.scene || gltf?.scenes?.[0];
      if (scene) {
        scene.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        attachModel(scene);
      } else {
        attachModel(buildPlaceholderModel());
      }

      if (Array.isArray(gltf?.animations) && gltf.animations.length) {
        npcState.mixer = new THREE.AnimationMixer(scene || object3d);
        const clip = gltf.animations[0];
        const action = npcState.mixer.clipAction(clip);
        action.play();
      }
    } catch (error) {
      console.warn('[npc] Failed to load NPC model, using placeholder instead.', error);
      attachModel(buildPlaceholderModel());
    }

    return npcState.root;
  };

  npcState.ready = loadModel();

  const update = (deltaSeconds, context = {}) => {
    if (disposed) {
      return;
    }
    const dt = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    npcState.mixer?.update(dt);

    syncCapsule();

    if (path.length < 2) {
      return;
    }

    if (dwellTime > 0) {
      dwellTime -= dt;
      return;
    }

    const target = path[nextIndex];
    if (!target) {
      return;
    }

    tempDirection.subVectors(target, object3d.position);
    tempDirection.y = 0;
    const distance = tempDirection.length();
    if (distance < 1e-4) {
      object3d.position.x = target.x;
      object3d.position.z = target.z;
      nextIndex = (nextIndex + 1) % path.length;
      dwellTime = normalizedIdle;
      syncCapsule();
      const groundMeshes = context.groundMeshes;
      snapToGround(object3d, groundMeshes, npcState.physics, dt);
      keepUpright(object3d, npcState.physics.yaw, 0.18);
      syncCapsule();
      return;
    }

    tempDirection.normalize();
    const dirX = tempDirection.x;
    const dirZ = tempDirection.z;
    const step = normalizedSpeed * dt;

    if (step >= distance) {
      moveDelta.set(target.x - object3d.position.x, 0, target.z - object3d.position.z);
    } else {
      moveDelta.set(dirX * step, 0, dirZ * step);
    }

    const colliderEntries = Array.isArray(context.colliders) ? context.colliders : npcState.colliders;
    let movedVector = moveDelta;
    if (colliderEntries && colliderEntries.length) {
      const result = resolveCapsuleVsAABBs(npcState.capsule, moveDelta, colliderEntries);
      movedVector = result?.moved ?? moveDelta;
    }

    object3d.position.add(movedVector);

    actualMove.copy(movedVector);
    actualMove.y = 0;
    if (actualMove.lengthSq() > 1e-6) {
      npcState.physics.yaw = Math.atan2(actualMove.x, actualMove.z);
    } else if (distance > 1e-6) {
      npcState.physics.yaw = Math.atan2(dirX, dirZ);
    }

    let reachedTarget = false;
    if (step >= distance) {
      tempDirection.subVectors(target, object3d.position);
      tempDirection.y = 0;
      if (tempDirection.lengthSq() <= 0.04) {
        object3d.position.x = target.x;
        object3d.position.z = target.z;
        reachedTarget = true;
      }
    }

    if (reachedTarget) {
      nextIndex = (nextIndex + 1) % path.length;
      dwellTime = normalizedIdle;
    }

    const groundMeshes = context.groundMeshes;
    snapToGround(object3d, groundMeshes, npcState.physics, dt);

    keepUpright(object3d, npcState.physics.yaw, 0.18);

    syncCapsule();
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    npcState.mixer?.stopAllAction?.();
    if (object3d.parent) {
      object3d.parent.remove(object3d);
    }
    if (npcState.root) {
      disposeObject3D(npcState.root);
    }
    disposeObject3D(object3d);
  };

  return {
    object3d,
    update,
    dispose,
    ready: npcState.ready,
    capsule: npcState.capsule,
    capsuleOffset
  };
}

const MAX_SEPARATION_NPCS = 20;
const NPC_SEPARATION_DISTANCE = 0.8;
const NPC_SEPARATION_DISTANCE_SQ = NPC_SEPARATION_DISTANCE * NPC_SEPARATION_DISTANCE;
const NPC_SEPARATION_MAX_PUSH = 0.1;

export function createNpcManager(scene, options = {}) {
  const group = new THREE.Group();
  group.name = 'NPCs';
  group.userData.isNpcContainer = true;
  if (scene) {
    scene.add(group);
  }

  const npcs = new Set();
  let disposed = false;
  const managerColliders = Array.isArray(options?.colliders) ? options.colliders : null;
  const updateContext = { groundMeshes: null, colliders: null };

  return {
    group,
    spawn(config = {}) {
      if (disposed) {
        return null;
      }
      const npc = createNpc({ ...config, colliders: managerColliders });
      group.add(npc.object3d);
      npcs.add(npc);
      const originalDispose = npc.dispose;
      npc.dispose = () => {
        npcs.delete(npc);
        originalDispose();
      };
      return npc;
    },
    update(deltaSeconds, context = {}) {
      if (disposed) {
        return;
      }
      const activeColliders = Array.isArray(context.colliders) ? context.colliders : managerColliders;
      updateContext.groundMeshes = context.groundMeshes;
      updateContext.colliders = activeColliders;
      for (const npc of npcs) {
        npc.update?.(deltaSeconds, updateContext);
      }

      separationBuffer.length = 0;
      let count = 0;
      for (const npc of npcs) {
        if (count >= MAX_SEPARATION_NPCS) {
          break;
        }
        separationBuffer[count] = npc;
        count += 1;
      }
      separationBuffer.length = count;

      for (let i = 0; i < count; i += 1) {
        const npcA = separationBuffer[i];
        const posA = npcA?.object3d?.position;
        if (!posA) {
          continue;
        }
        for (let j = i + 1; j < count; j += 1) {
          const npcB = separationBuffer[j];
          const posB = npcB?.object3d?.position;
          if (!posB) {
            continue;
          }
          separationVector.subVectors(posB, posA);
          separationVector.y = 0;
          const distSq = separationVector.x * separationVector.x + separationVector.z * separationVector.z;
          if (distSq <= 0 || distSq >= NPC_SEPARATION_DISTANCE_SQ) {
            continue;
          }
          const dist = Math.sqrt(distSq);
          if (dist <= 1e-5) {
            continue;
          }
          const push = Math.min((NPC_SEPARATION_DISTANCE - dist) * 0.5, NPC_SEPARATION_MAX_PUSH);
          if (push <= 0) {
            continue;
          }
          const invDist = 1 / dist;
          const offsetX = separationVector.x * invDist * push;
          const offsetZ = separationVector.z * invDist * push;
          posA.x -= offsetX;
          posA.z -= offsetZ;
          posB.x += offsetX;
          posB.z += offsetZ;
          const capsuleA = npcA.capsule;
          if (capsuleA && npcA.capsuleOffset !== undefined) {
            capsuleA.setPosition(posA.x, posA.y + npcA.capsuleOffset, posA.z);
          }
          const capsuleB = npcB.capsule;
          if (capsuleB && npcB.capsuleOffset !== undefined) {
            capsuleB.setPosition(posB.x, posB.y + npcB.capsuleOffset, posB.z);
          }
        }
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const npc of npcs) {
        npc.dispose?.();
      }
      npcs.clear();
      if (group.parent) {
        group.parent.remove(group);
      }
    }
  };
}

/**
 * Example NPC configuration:
 *
 * createNpcManager(scene).spawn({
 *   modelUrl: 'assets/models/npc_athenian.glb',
 *   initialPosition: { x: 12, y: 0, z: -6 },
 *   waypoints: [
 *     { x: 12, y: 0, z: -6 },
 *     { x: -4, y: 0, z: -8 },
 *     { x: -2, y: 0, z: 10 },
 *     { x: 14, y: 0, z: 8 }
 *   ]
 * });
 */
