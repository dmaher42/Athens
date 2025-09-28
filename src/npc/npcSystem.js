import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';

const loader = new GLTFLoader();
const DEFAULT_SPEED = 1.6; // meters per second
const DEFAULT_IDLE_SECONDS = 2.5;
const tempDirection = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

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
  idleSeconds = DEFAULT_IDLE_SECONDS
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
    ready: null
  };

  const normalizedSpeed = Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED;
  const normalizedIdle = Number.isFinite(idleSeconds) && idleSeconds >= 0 ? idleSeconds : DEFAULT_IDLE_SECONDS;

  const attachModel = (modelGroup) => {
    if (!modelGroup) {
      return;
    }
    npcState.root = modelGroup;
    object3d.add(modelGroup);
  };

  const loadModel = async () => {
    if (!modelUrl) {
      attachModel(buildPlaceholderModel());
      return null;
    }

    try {
      const resolvedUrl = resolveAssetUrl(modelUrl);
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

  const update = (deltaSeconds) => {
    if (disposed) {
      return;
    }
    const dt = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    npcState.mixer?.update(dt);

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
    const distance = tempDirection.length();
    if (distance < 1e-4) {
      object3d.position.copy(target);
      nextIndex = (nextIndex + 1) % path.length;
      dwellTime = normalizedIdle;
      return;
    }

    tempDirection.normalize();
    const step = normalizedSpeed * dt;
    if (step >= distance) {
      object3d.position.copy(target);
      nextIndex = (nextIndex + 1) % path.length;
      dwellTime = normalizedIdle;
    } else {
      object3d.position.addScaledVector(tempDirection, step);
    }

    // Face movement direction smoothly
    if (tempDirection.lengthSq() > 0) {
      const yaw = Math.atan2(tempDirection.x, tempDirection.z);
      tempQuaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
      object3d.quaternion.slerp(tempQuaternion, Math.min(1, dt * 6));
    }
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
    ready: npcState.ready
  };
}

export function createNpcManager(scene) {
  const group = new THREE.Group();
  group.name = 'NPCs';
  group.userData.isNpcContainer = true;
  if (scene) {
    scene.add(group);
  }

  const npcs = new Set();
  let disposed = false;

  return {
    group,
    spawn(config = {}) {
      if (disposed) {
        return null;
      }
      const npc = createNpc(config);
      group.add(npc.object3d);
      npcs.add(npc);
      const originalDispose = npc.dispose;
      npc.dispose = () => {
        npcs.delete(npc);
        originalDispose();
      };
      return npc;
    },
    update(deltaSeconds) {
      if (disposed) {
        return;
      }
      for (const npc of npcs) {
        npc.update?.(deltaSeconds);
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
 *   modelUrl: 'models/npc_athenian.glb',
 *   initialPosition: { x: 12, y: 0, z: -6 },
 *   waypoints: [
 *     { x: 12, y: 0, z: -6 },
 *     { x: -4, y: 0, z: -8 },
 *     { x: -2, y: 0, z: 10 },
 *     { x: 14, y: 0, z: 8 }
 *   ]
 * });
 */
