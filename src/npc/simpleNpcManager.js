import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';

const tempDirection = new THREE.Vector3();
const flatDirection = new THREE.Vector3();
const tempVelocity = new THREE.Vector3();
const forwardVector = new THREE.Vector3(0, 0, 1);
const moveDelta = new THREE.Vector3();
const separationOffset = new THREE.Vector3();
const orientVector = new THREE.Vector3();

function toVector3(input) {
  if (!input) {
    return null;
  }
  if (input.isVector3) {
    return input.clone();
  }
  if (Array.isArray(input) && input.length >= 3) {
    return new THREE.Vector3(Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0);
  }
  const { x, y, z } = input;
  if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') {
    return new THREE.Vector3(x, y, z);
  }
  return null;
}

function buildPlaceholderNpc() {
  const group = new THREE.Group();
  group.name = 'NPC';
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7, metalness: 0.1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4, metalness: 0.05 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 8, 16), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), headMaterial);
  head.position.y = 1.2;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  return group;
}

function deriveYaw(object3d) {
  if (!object3d) {
    return 0;
  }
  tempVelocity.copy(forwardVector).applyQuaternion(object3d.quaternion);
  tempVelocity.y = 0;
  if (tempVelocity.lengthSq() < 1e-6) {
    return 0;
  }
  tempVelocity.normalize();
  return Math.atan2(tempVelocity.x, tempVelocity.z);
}

function normalizeWaypoints(waypoints) {
  const list = Array.isArray(waypoints) ? waypoints : [];
  const result = [];
  for (let i = 0; i < list.length; i += 1) {
    const point = toVector3(list[i]);
    if (point) {
      result.push(point);
    }
  }
  return result;
}

export function createNpcManager(scene, initialGroundMeshes = [], { colliders: initialColliders = [] } = {}) {
  const npcs = [];
  let groundMeshes = Array.isArray(initialGroundMeshes) ? initialGroundMeshes : [];
  let colliderAabbs = Array.isArray(initialColliders) ? initialColliders : [];

  const setGroundMeshes = (meshes) => {
    groundMeshes = Array.isArray(meshes) ? meshes : [];
  };

  const setColliders = (nextColliders) => {
    colliderAabbs = Array.isArray(nextColliders) ? nextColliders : [];
  };

  const spawn = ({ object3d, waypoints, walkSpeed = 1.6, accel = 5.0, turn = 0.18 } = {}) => {
    const npcObject = object3d || buildPlaceholderNpc();
    npcObject.userData.isNpc = true;

    const path = normalizeWaypoints(waypoints);
    if (path.length === 0) {
      path.push(npcObject.position.clone());
    }

    const npcState = {
      object3d: npcObject,
      waypoints: path,
      waypointIndex: 0,
      walkSpeed: Number.isFinite(walkSpeed) && walkSpeed > 0 ? walkSpeed : 1.6,
      accel: Number.isFinite(accel) && accel > 0 ? accel : 5.0,
      turn: Number.isFinite(turn) ? THREE.MathUtils.clamp(turn, 0, 1) : 0.18,
      velocity: new THREE.Vector3(),
      physics: {
        vy: 0,
        lastGoodY: npcObject.position?.y ?? 0
      },
      yaw: deriveYaw(npcObject),
      capsule: new Capsule(0.4, 1.5),
      prevPosition: npcObject.position.clone(),
      lastMove: new THREE.Vector3()
    };

    if (scene && npcObject && !npcObject.parent) {
      scene.add(npcObject);
    }

    snapToGround(npcObject, groundMeshes, npcState.physics, 0);
    npcState.yaw = deriveYaw(npcObject);
    npcState.capsule.setPosition(
      npcObject.position.x,
      npcObject.position.y,
      npcObject.position.z
    );
    npcState.prevPosition.copy(npcObject.position);

    npcs.push(npcState);
    return npcState;
  };

  const updateNpc = (npc, dt) => {
    if (!npc?.object3d || !npc.waypoints.length) {
      return;
    }

    const { object3d } = npc;

    npc.capsule.setPosition(object3d.position.x, object3d.position.y, object3d.position.z);

    let target = npc.waypoints[npc.waypointIndex];
    flatDirection.subVectors(target, object3d.position);
    const flatDistance = Math.sqrt(flatDirection.x * flatDirection.x + flatDirection.z * flatDirection.z);

    if (flatDistance < 0.2) {
      npc.waypointIndex = (npc.waypointIndex + 1) % npc.waypoints.length;
      target = npc.waypoints[npc.waypointIndex];
      flatDirection.subVectors(target, object3d.position);
    }

    flatDirection.y = 0;
    if (flatDirection.lengthSq() > 1e-6) {
      flatDirection.normalize();
      tempVelocity.copy(flatDirection).multiplyScalar(npc.walkSpeed);
    } else {
      tempVelocity.set(0, 0, 0);
    }

    const lerpAlpha = npc.accel > 0 && dt > 0 ? 1 - Math.exp(-npc.accel * dt) : 1;
    npc.velocity.lerp(tempVelocity, THREE.MathUtils.clamp(lerpAlpha, 0, 1));

    if (dt > 0) {
      moveDelta.set(npc.velocity.x * dt, 0, npc.velocity.z * dt);
      const moveLenSq = moveDelta.lengthSq();
      if (moveLenSq > 1e-10) {
        const result = resolveCapsuleVsAABBs(npc.capsule, moveDelta, colliderAabbs, {
          maxIters: 3,
          skin: 0.01
        });
        object3d.position.copy(npc.capsule.position);
      } else if (moveLenSq > 0) {
        object3d.position.add(moveDelta);
        npc.capsule.setPosition(object3d.position.x, object3d.position.y, object3d.position.z);
      }
    }
  };

  const separationRadius = 0.8;
  const separationRadiusSq = separationRadius * separationRadius;

  const applySeparation = () => {
    const limit = Math.min(npcs.length, 20);
    for (let i = 0; i < limit; i += 1) {
      const npcA = npcs[i];
      if (!npcA?.object3d) continue;
      const posA = npcA.object3d.position;
      for (let j = i + 1; j < limit; j += 1) {
        const npcB = npcs[j];
        if (!npcB?.object3d) continue;
        const posB = npcB.object3d.position;
        separationOffset.subVectors(posA, posB);
        separationOffset.y = 0;
        const distSq = separationOffset.lengthSq();
        if (distSq <= 1e-6 || distSq >= separationRadiusSq) continue;
        const dist = Math.sqrt(distSq);
        if (dist <= 1e-6) continue;
        const push = (separationRadius - dist) * 0.5;
        if (push <= 0) continue;
        separationOffset.multiplyScalar(push / dist);
        posA.add(separationOffset);
        posB.addScaledVector(separationOffset, -1);
        npcA.capsule?.setPosition(posA.x, posA.y, posA.z);
        npcB.capsule?.setPosition(posB.x, posB.y, posB.z);
      }
    }
  };

  const update = (deltaSeconds = 0) => {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;

    for (let i = 0; i < npcs.length; i += 1) {
      const npc = npcs[i];
      if (!npc?.object3d) continue;
      npc.prevPosition.copy(npc.object3d.position);
      updateNpc(npc, dt);
    }

    applySeparation();

    for (let i = 0; i < npcs.length; i += 1) {
      const npc = npcs[i];
      if (!npc?.object3d) continue;
      snapToGround(npc.object3d, groundMeshes, npc.physics, dt);
      npc.capsule?.setPosition(
        npc.object3d.position.x,
        npc.object3d.position.y,
        npc.object3d.position.z
      );
      npc.lastMove.subVectors(npc.object3d.position, npc.prevPosition);
      orientVector.copy(npc.lastMove);
      orientVector.y = 0;
      if (orientVector.lengthSq() > 1e-6) {
        orientVector.normalize();
        npc.yaw = Math.atan2(orientVector.x, orientVector.z);
      } else if (npc.velocity.lengthSq() > 1e-6) {
        npc.yaw = Math.atan2(npc.velocity.x, npc.velocity.z);
      }
      keepUpright(npc.object3d, npc.yaw, npc.turn);
    }
  };

  const dispose = () => {
    npcs.length = 0;
  };

  return {
    spawn,
    update,
    dispose,
    setGroundMeshes,
    setColliders
  };
}

export default createNpcManager;
