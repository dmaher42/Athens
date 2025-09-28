import * as THREE from 'three';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';

const tempDirection = new THREE.Vector3();
const flatDirection = new THREE.Vector3();
const tempVelocity = new THREE.Vector3();
const forwardVector = new THREE.Vector3(0, 0, 1);

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

export function createNpcManager(scene, initialGroundMeshes = []) {
  const npcs = [];
  let groundMeshes = Array.isArray(initialGroundMeshes) ? initialGroundMeshes : [];

  const setGroundMeshes = (meshes) => {
    groundMeshes = Array.isArray(meshes) ? meshes : [];
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
      yaw: deriveYaw(npcObject)
    };

    if (scene && npcObject && !npcObject.parent) {
      scene.add(npcObject);
    }

    snapToGround(npcObject, groundMeshes, npcState.physics, 0);
    npcState.yaw = deriveYaw(npcObject);

    npcs.push(npcState);
    return npcState;
  };

  const updateNpc = (npc, dt) => {
    if (!npc?.object3d || !npc.waypoints.length) {
      return;
    }

    const { object3d } = npc;

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
      object3d.position.addScaledVector(npc.velocity, dt);
    }

    if (npc.velocity.lengthSq() > 1e-6) {
      npc.yaw = Math.atan2(npc.velocity.x, npc.velocity.z);
    }

    snapToGround(object3d, groundMeshes, npc.physics, dt);
    keepUpright(object3d, npc.yaw, npc.turn);
  };

  const update = (deltaSeconds = 0) => {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (let i = 0; i < npcs.length; i += 1) {
      updateNpc(npcs[i], dt);
    }
  };

  const dispose = () => {
    npcs.length = 0;
  };

  return {
    spawn,
    update,
    dispose,
    setGroundMeshes
  };
}

export default createNpcManager;
