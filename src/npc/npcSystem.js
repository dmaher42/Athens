import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { assetUrl } from '../utils/assetUrl.js';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { Capsule, resolveCapsuleVsAABBs } from '../physics/collision.js';
import { findPath } from '../nav/astar.js';
import { buildPathPoints, createPathFollower } from '../nav/pathfollow.js';

const loader = new GLTFLoader();

const SNAP_OPTIONS = { gravity: 12, stepMax: 0.6, hover: 0.03 };
const DEFAULT_WALK_SPEED = 1.6;
const DEFAULT_TURN = 0.18;
const DEFAULT_ACCEL = 6.0;
const STUCK_SECONDS = 2.0;
const PROGRESS_EPSILON_SQ = 0.04;

const TEMP_PROGRESS = new THREE.Vector3();
const TEMP_MOVE = new THREE.Vector3();

function toVector3(value) {
  if (!value) return null;
  if (value.isVector3) return value.clone();
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]) || 0;
    const y = Number(value[1]) || 0;
    const z = Number(value[2]) || 0;
    return new THREE.Vector3(x, y, z);
  }
  if (typeof value === 'object') {
    const { x = 0, y = 0, z = 0 } = value;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return new THREE.Vector3(x, y, z);
    }
  }
  return null;
}

function buildPlaceholderModel() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.75, metalness: 0.1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5, metalness: 0.05 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.6, 8, 16), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), headMaterial);
  head.position.y = 1.2;
  head.castShadow = true;
  head.receiveShadow = true;

  group.add(body, head);
  return group;
}

function enableMeshShadows(root) {
  root?.traverse?.((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse?.((child) => {
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

function normalizeModelUrl(input) {
  if (!input) return null;
  if (typeof input !== 'string') return resolveAssetUrl(input);
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (/^\/assets\/models\//i.test(trimmed)) return assetUrl(trimmed);
  if (/^assets\/models\//i.test(trimmed)) return assetUrl(trimmed);
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
}

function attachModelToNpc(npc, model) {
  if (!npc || !npc.object3d) return;
  const { object3d } = npc;
  if (npc.modelRoot && npc.modelRoot.parent === object3d) {
    object3d.remove(npc.modelRoot);
  }
  if (npc.modelRoot && npc.modelRoot !== model) {
    disposeObject3D(npc.modelRoot);
  }
  npc.modelRoot = model || null;
  if (model) {
    model.position.set(0, 0, 0);
    model.rotation.set(0, model.rotation.y || 0, 0);
    enableMeshShadows(model);
    object3d.add(model);
  }
}

function loadNpcModel(npc, modelUrl) {
  const resolvedUrl = normalizeModelUrl(modelUrl);
  if (!resolvedUrl) {
    const placeholder = buildPlaceholderModel();
    attachModelToNpc(npc, placeholder);
    return Promise.resolve(placeholder);
  }
  return loader
    .loadAsync(resolvedUrl)
    .then((gltf) => {
      const scene = gltf?.scene || gltf?.scenes?.[0] || null;
      if (scene) {
        attachModelToNpc(npc, scene);
      } else {
        attachModelToNpc(npc, buildPlaceholderModel());
      }
      npc.mixer?.stopAllAction?.();
      npc.mixer?.uncacheRoot?.(npc.modelRoot || npc.object3d);
      npc.mixer = null;
      if (Array.isArray(gltf?.animations) && gltf.animations.length) {
        npc.mixer = new THREE.AnimationMixer(scene || npc.object3d);
        const clip = gltf.animations[0];
        const action = npc.mixer.clipAction(clip);
        action?.play();
      }
      return npc.modelRoot;
    })
    .catch((error) => {
      console.warn('[npc] Failed to load NPC model, using placeholder instead.', error);
      const placeholder = buildPlaceholderModel();
      attachModelToNpc(npc, placeholder);
      return placeholder;
    });
}

function disposeNpcEntity(npc) {
  if (!npc || npc.disposed) return;
  npc.disposed = true;
  try {
    npc.mixer?.stopAllAction?.();
    npc.mixer?.uncacheRoot?.(npc.modelRoot || npc.object3d);
  } catch (error) {
    console.warn('[npc] mixer cleanup failed', error);
  }
  npc.mixer = null;
  if (npc.modelRoot && npc.modelRoot.parent === npc.object3d) {
    npc.object3d.remove(npc.modelRoot);
  }
  disposeObject3D(npc.modelRoot);
  npc.modelRoot = null;
  if (npc.object3d?.parent) {
    npc.object3d.parent.remove(npc.object3d);
  }
}

function createNpcState(config = {}, scene = null, groundMeshes = []) {
  const {
    object3d: providedObject = null,
    modelUrl = null,
    initialPosition = null,
    walkSpeed = DEFAULT_WALK_SPEED,
    turn = DEFAULT_TURN,
    accel = DEFAULT_ACCEL
  } = config;

  const object3d = providedObject || new THREE.Group();
  object3d.userData = { ...(object3d.userData || {}), isNpc: true };
  object3d.rotation.x = 0;
  object3d.rotation.z = 0;

  const startPosition = toVector3(initialPosition) || object3d.position.clone();
  object3d.position.copy(startPosition);

  if (scene && !object3d.parent) {
    scene.add(object3d);
  }

  const npc = {
    object3d,
    walkSpeed: Number.isFinite(walkSpeed) ? walkSpeed : DEFAULT_WALK_SPEED,
    accel: Number.isFinite(accel) ? accel : DEFAULT_ACCEL,
    turn: THREE.MathUtils.clamp(Number.isFinite(turn) ? turn : DEFAULT_TURN, 0, 1),
    state: {
      vy: 0,
      lastGoodY: object3d.position.y || 0,
      yaw: object3d.rotation.y || 0
    },
    follower: createPathFollower(),
    capsule: new Capsule(0.4, 1.6),
    waypoints: [],
    home: toVector3(config.home),
    job: toVector3(config.job),
    currentTarget: null,
    navPathCells: null,
    repathCooldown: 0,
    stuckTimer: 0,
    lastProgressPosition: object3d.position.clone(),
    prevPosition: object3d.position.clone(),
    modelRoot: null,
    mixer: null,
    ready: null,
    disposed: false
  };

  if (Array.isArray(config.waypoints)) {
    for (let i = 0; i < config.waypoints.length; i += 1) {
      const vec = toVector3(config.waypoints[i]);
      if (vec) npc.waypoints.push(vec);
    }
  }
  if (npc.home) {
    npc.waypoints.push(npc.home.clone());
  }
  if (npc.job) {
    npc.waypoints.push(npc.job.clone());
  }

  if (Array.isArray(groundMeshes) && groundMeshes.length) {
    snapToGround(object3d, groundMeshes, npc.state, 0, SNAP_OPTIONS);
  }

  npc.capsule.setPosition(object3d.position.x, object3d.position.y, object3d.position.z);
  npc.prevPosition.copy(object3d.position);
  npc.lastProgressPosition.copy(object3d.position);

  npc.ready = loadNpcModel(npc, modelUrl);
  npc.dispose = () => disposeNpcEntity(npc);
  return npc;
}

function findNearestWalkableCell(grid, hintCell, target) {
  if (!grid) return null;
  const cols = grid.cols | 0;
  const rows = grid.rows | 0;
  if (cols <= 0 || rows <= 0) return null;

  let centerCx = hintCell?.cx;
  let centerCz = hintCell?.cz;
  if (!Number.isInteger(centerCx) || !Number.isInteger(centerCz)) {
    const derived = target ? grid.worldToCell(target.x, target.z) : null;
    centerCx = derived?.cx ?? 0;
    centerCz = derived?.cz ?? 0;
  }

  centerCx = THREE.MathUtils.clamp(centerCx, 0, cols - 1);
  centerCz = THREE.MathUtils.clamp(centerCz, 0, rows - 1);

  const maxRadius = Math.max(cols, rows);
  let best = null;
  let bestDist = Infinity;

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let foundThisRadius = false;
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) {
          continue;
        }
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) {
          continue;
        }
        if (!grid.isWalkable(cx, cz)) {
          continue;
        }
        const world = grid.cellToWorld(cx, cz);
        if (!world) continue;
        const distSq = target ? world.distanceToSquared(target) : dx * dx + dz * dz;
        if (distSq < bestDist) {
          bestDist = distSq;
          best = { cx, cz };
          foundThisRadius = true;
        }
      }
    }
    if (foundThisRadius && best) {
      break;
    }
  }

  return best;
}

export function createNpc(options = {}) {
  const npc = createNpcState(options, null, []);
  return {
    object3d: npc.object3d,
    update(deltaSeconds, context = {}) {
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      npc.mixer?.update?.(dt);
      const ground = context.groundMeshes;
      if (Array.isArray(ground) && ground.length) {
        snapToGround(npc.object3d, ground, npc.state, dt, SNAP_OPTIONS);
      }
      keepUpright(npc.object3d, npc.state.yaw, npc.turn);
    },
    dispose() {
      npc.dispose();
    },
    ready: npc.ready
  };
}

export function createNpcManager(scene, initialGroundMeshes = [], { colliders: initialColliders = [], navGrid: initialNavGrid = null } = {}) {
  const npcs = [];
  let groundMeshes = Array.isArray(initialGroundMeshes) ? initialGroundMeshes : [];
  let colliderAabbs = Array.isArray(initialColliders) ? initialColliders : [];
  let navGrid = initialNavGrid;

  const setGroundMeshes = (meshes) => {
    groundMeshes = Array.isArray(meshes) ? meshes : [];
  };

  const setColliders = (list) => {
    colliderAabbs = Array.isArray(list) ? list : [];
  };

  const setNavGrid = (grid) => {
    navGrid = grid || null;
  };

  const spawn = (config = {}) => {
    const npc = createNpcState(config, scene, groundMeshes);
    npcs.push(npc);
    return npc;
  };

  const getNpcs = () => npcs;

  const goto = (npc, target) => {
    if (!npc || npc.disposed) {
      return false;
    }
    const targetVec = toVector3(target);
    if (!targetVec) {
      return false;
    }
    npc.currentTarget = targetVec.clone();
    npc.stuckTimer = 0;
    npc.repathCooldown = 0.5;

    if (!navGrid) {
      const points = [npc.object3d.position.clone(), targetVec.clone()];
      npc.follower.setPath(points);
      return true;
    }

    const startCell = navGrid.worldToCell(npc.object3d.position.x, npc.object3d.position.z) || findNearestWalkableCell(navGrid, null, npc.object3d.position);
    let goalCell = navGrid.worldToCell(targetVec.x, targetVec.z);
    if (!goalCell || !navGrid.isWalkable(goalCell.cx, goalCell.cz)) {
      goalCell = findNearestWalkableCell(navGrid, goalCell, targetVec);
    }
    if (!startCell || !goalCell) {
      return false;
    }

    const cells = findPath(navGrid, startCell, goalCell);
    if (!cells || cells.length === 0) {
      return false;
    }
    const points = buildPathPoints(navGrid, cells);
    if (!points.length) {
      return false;
    }
    points.unshift(npc.object3d.position.clone());
    npc.follower.setPath(points);
    npc.navPathCells = cells;
    return true;
  };

  const update = (deltaSeconds) => {
    const rawDt = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    if (rawDt <= 0) {
      return;
    }
    const dt = Math.min(rawDt, 0.25);
    for (let i = 0; i < npcs.length; i += 1) {
      const npc = npcs[i];
      if (!npc || npc.disposed) continue;

      npc.mixer?.update?.(dt);
      npc.repathCooldown = Math.max(0, npc.repathCooldown - dt);

      npc.prevPosition.copy(npc.object3d.position);
      const followResult = npc.follower.update(npc.object3d, dt, { speed: npc.walkSpeed, turn: npc.turn });

      TEMP_MOVE.subVectors(npc.object3d.position, npc.prevPosition);
      TEMP_MOVE.y = 0;
      const moveLenSq = TEMP_MOVE.lengthSq();

      if (moveLenSq > 0 && colliderAabbs.length) {
        npc.capsule.setPosition(npc.prevPosition.x, npc.object3d.position.y, npc.prevPosition.z);
        resolveCapsuleVsAABBs(npc.capsule, TEMP_MOVE, colliderAabbs, { maxIters: 4, skin: 0.02 });
        npc.object3d.position.copy(npc.capsule.position);
      } else {
        npc.capsule.setPosition(npc.object3d.position.x, npc.object3d.position.y, npc.object3d.position.z);
      }

      if (groundMeshes.length) {
        snapToGround(npc.object3d, groundMeshes, npc.state, dt, SNAP_OPTIONS);
      }

      npc.state.yaw = npc.follower.getYaw();
      keepUpright(npc.object3d, npc.state.yaw, npc.turn);

      TEMP_PROGRESS.subVectors(npc.object3d.position, npc.lastProgressPosition);
      TEMP_PROGRESS.y = 0;
      if (TEMP_PROGRESS.lengthSq() > PROGRESS_EPSILON_SQ) {
        npc.stuckTimer = 0;
        npc.lastProgressPosition.copy(npc.object3d.position);
      } else {
        npc.stuckTimer += dt;
        if (npc.stuckTimer > STUCK_SECONDS && npc.currentTarget && npc.repathCooldown <= 0) {
          goto(npc, npc.currentTarget);
        }
      }

      if (followResult.arrived && npc.currentTarget) {
        npc.currentTarget = null;
        npc.navPathCells = null;
      }

      if (navGrid) {
        const cell = navGrid.worldToCell(npc.object3d.position.x, npc.object3d.position.z);
        if ((!cell || !navGrid.isWalkable(cell.cx, cell.cz)) && npc.currentTarget && npc.repathCooldown <= 0) {
          goto(npc, npc.currentTarget);
        }
      }
    }
  };

  const dispose = () => {
    while (npcs.length) {
      const npc = npcs.pop();
      npc?.dispose?.();
    }
  };

  return {
    spawn,
    update,
    dispose,
    goto,
    getNpcs,
    setGroundMeshes,
    setColliders,
    setNavGrid
  };
}

export default createNpcManager;
