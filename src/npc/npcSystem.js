import * as THREE from 'three';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import { assetUrl } from '../utils/assetUrl.js';
import { snapToGround } from '../physics/groundSnap.js';
import { keepUpright } from '../physics/upright.js';
import { loadGLTF } from '../loaders/safeGltf.js';
import { logOnce } from '../utils/logOnce.js';

const SNAP_OPTIONS = { gravity: 12, stepMax: 0.6, hover: 0.03 };
const DEFAULT_WALK_SPEED = 1.5;
const DEFAULT_RUN_SPEED = 3.0;
const DEFAULT_ACCEL = 6.0;
const DEFAULT_TURN = 0.18;

const STEP_DIRECTION = new THREE.Vector3();
const INIT_DIRECTION = new THREE.Vector3();
const TMP_EULER = new THREE.Euler(0, 0, 0, 'YXZ');

const PATH_POINT_EPSILON = 0.4;
const PATH_POINT_EPSILON_SQ = PATH_POINT_EPSILON * PATH_POINT_EPSILON;
const BLOCKED_DISTANCE = 0.3;
const BLOCKED_DISTANCE_SQ = BLOCKED_DISTANCE * BLOCKED_DISTANCE;
const BLOCKED_TIMEOUT = 2.75;

const AGORA_POSITION = new THREE.Vector3(80, 0, -40);
const SCHEDULE_TARGET_BY_MODE = {
  dawn: 'agora',
  day: 'agora',
  dusk: 'home',
  night: 'home'
};
const DEFAULT_SCHEDULE_TARGET = 'home';

function mapModeToSchedule(mode) {
  if (!mode) return DEFAULT_SCHEDULE_TARGET;
  const key = `${mode}`.trim().toLowerCase();
  return SCHEDULE_TARGET_BY_MODE[key] || DEFAULT_SCHEDULE_TARGET;
}

function horizontalDistanceSquared(a, b) {
  if (!a || !b) return Infinity;
  const ax = a.x || 0;
  const az = a.z || 0;
  const bx = b.x || 0;
  const bz = b.z || 0;
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function skipReachedPoints(npc) {
  if (!npc || !Array.isArray(npc.pathPoints)) return;
  while (npc.pathIndex < npc.pathPoints.length) {
    const target = npc.pathPoints[npc.pathIndex];
    if (!target) break;
    const distSq = horizontalDistanceSquared(npc.object3d.position, target);
    if (distSq <= PATH_POINT_EPSILON_SQ) {
      npc.pathIndex += 1;
    } else {
      break;
    }
  }
}

function requestPathTo(npc, target, navContext, { holdPosition = false, loopDestinationIndex = null } = {}) {
  if (!npc || !target) return false;
  const nav = navContext || npc.navContext || null;
  const pathPoints = npc.pathPoints || (npc.pathPoints = []);

  if (nav?.pathfinder?.findPath) {
    nav.pathfinder.findPath(npc.object3d.position, target, pathPoints);
  }

  if (!pathPoints.length) {
    const point = pathPoints[0] || new THREE.Vector3();
    point.copy(target);
    pathPoints[0] = point;
    pathPoints.length = 1;
  }

  npc.pathPoints = pathPoints;
  npc.pathIndex = 0;
  npc.destination = npc.destination || new THREE.Vector3();
  npc.destination.copy(target);
  npc.hasDestination = pathPoints.length > 0;
  npc.holdPosition = Boolean(holdPosition);
  npc.loopDestinationIndex = typeof loopDestinationIndex === 'number' ? loopDestinationIndex : null;
  const shouldLoop = typeof loopDestinationIndex === 'number' && !npc.holdPosition && pathPoints.length > 0;
  npc.looping = shouldLoop;
  npc.overrideActive = npc.holdPosition && !shouldLoop;
  npc.lastProgress = npc.lastProgress || npc.object3d.position.clone();
  npc.lastProgress.copy(npc.object3d.position);
  npc.blockedTimer = 0;
  skipReachedPoints(npc);
  if (!npc.hasDestination) {
    npc.pathPoints.length = 0;
  }
  return npc.hasDestination;
}

function planLoopSegment(npc, navContext) {
  if (!npc || !Array.isArray(npc.defaultWaypoints) || npc.defaultWaypoints.length === 0) {
    return false;
  }
  const count = npc.defaultWaypoints.length;
  if (count === 1) {
    return requestPathTo(npc, npc.defaultWaypoints[0], navContext, { holdPosition: true });
  }
  const index = ((npc.currentLoopIndex ?? 0) % count + count) % count;
  npc.currentLoopIndex = index;
  return requestPathTo(npc, npc.defaultWaypoints[index], navContext, { loopDestinationIndex: index });
}

function handlePathCompletion(npc, navContext) {
  if (!npc) return;
  npc.hasDestination = false;
  npc.blockedTimer = 0;
  npc.pathIndex = npc.pathPoints.length;

  if (npc.overrideActive) {
    npc.pathPoints.length = 0;
    return;
  }

  if (npc.looping && Array.isArray(npc.defaultWaypoints) && npc.defaultWaypoints.length > 1) {
    const lastIndex = typeof npc.loopDestinationIndex === 'number' ? npc.loopDestinationIndex : npc.currentLoopIndex || 0;
    const count = npc.defaultWaypoints.length;
    npc.currentLoopIndex = (lastIndex + 1) % count;
    if (planLoopSegment(npc, navContext)) {
      return;
    }
  }

  npc.pathPoints.length = 0;
}

function checkBlocked(npc, dt, navContext) {
  if (!npc || dt <= 0) return;
  if (!npc.hasDestination || npc.pathIndex >= npc.pathPoints.length) {
    npc.blockedTimer = 0;
    npc.lastProgress?.copy?.(npc.object3d.position);
    return;
  }

  npc.lastProgress = npc.lastProgress || npc.object3d.position.clone();
  const movedSq = horizontalDistanceSquared(npc.object3d.position, npc.lastProgress);
  if (movedSq >= BLOCKED_DISTANCE_SQ) {
    npc.blockedTimer = 0;
    npc.lastProgress.copy(npc.object3d.position);
    return;
  }

  npc.blockedTimer += dt;
  if (npc.blockedTimer < BLOCKED_TIMEOUT) {
    return;
  }

  npc.blockedTimer = 0;
  npc.lastProgress.copy(npc.object3d.position);

  if (npc.overrideActive) {
    requestPathTo(npc, npc.destination, navContext, {
      holdPosition: npc.holdPosition,
      loopDestinationIndex: npc.loopDestinationIndex
    });
    return;
  }

  if (npc.looping && typeof npc.loopDestinationIndex === 'number' && npc.defaultWaypoints?.[npc.loopDestinationIndex]) {
    requestPathTo(npc, npc.defaultWaypoints[npc.loopDestinationIndex], navContext, {
      loopDestinationIndex: npc.loopDestinationIndex
    });
    return;
  }

  if (npc.hasDestination) {
    requestPathTo(npc, npc.destination, navContext, {
      holdPosition: npc.holdPosition
    });
  }
}

function applyScheduleTarget(npc, scheduleTarget, navContext) {
  if (!npc) return;
  const previous = npc.scheduleTarget;
  npc.scheduleTarget = scheduleTarget;

  if (scheduleTarget === 'agora') {
    const distanceSq = horizontalDistanceSquared(npc.object3d.position, AGORA_POSITION);
    if (previous !== scheduleTarget || (!npc.overrideActive && distanceSq > PATH_POINT_EPSILON_SQ)) {
      requestPathTo(npc, AGORA_POSITION, navContext, { holdPosition: true });
    }
    return;
  }

  if (Array.isArray(npc.defaultWaypoints) && npc.defaultWaypoints.length > 1) {
    if (previous !== scheduleTarget || !npc.looping) {
      npc.overrideActive = false;
      npc.holdPosition = false;
      npc.currentLoopIndex = 0;
      planLoopSegment(npc, navContext);
    }
    return;
  }

  if (npc.homePosition) {
    const distanceSq = horizontalDistanceSquared(npc.object3d.position, npc.homePosition);
    if (previous !== scheduleTarget || distanceSq > PATH_POINT_EPSILON_SQ) {
      requestPathTo(npc, npc.homePosition, navContext, { holdPosition: true });
    }
  }
}

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

function enableMeshShadows(root) {
  if (!root) return;
  root.traverse?.((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function fixModelTilt(object3d) {
  if (!object3d) return;
  TMP_EULER.setFromQuaternion(object3d.quaternion, 'YXZ');
  if (Math.abs(TMP_EULER.x) > 0.25 || Math.abs(TMP_EULER.z) > 0.25) {
    object3d.rotation.x = 0;
    object3d.rotation.z = 0;
  }
}

function disposeObject3D(object) {
  if (!object) return;
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

function sanitizeWaypoints(waypoints, fallbackPosition) {
  const result = [];
  if (Array.isArray(waypoints)) {
    for (const waypoint of waypoints) {
      const vector = toVector3(waypoint);
      if (vector) result.push(vector.clone());
    }
  } else if (waypoints) {
    const vector = toVector3(waypoints);
    if (vector) result.push(vector.clone());
  }

  if (!result.length) {
    const fallbackVector = fallbackPosition?.isVector3 ? fallbackPosition.clone() : toVector3(fallbackPosition);
    result.push((fallbackVector || new THREE.Vector3()).clone());
  }

  return result;
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
    fixModelTilt(model);
    object3d.add(model);
  }
}

function loadNpcModel(npc, modelUrl) {
  const resolvedUrl = normalizeModelUrl(modelUrl);
  const { object3d } = npc;

  if (!resolvedUrl) {
    const placeholder = buildPlaceholderModel();
    attachModelToNpc(npc, placeholder);
    return Promise.resolve(placeholder);
  }

  return loadGLTF(resolvedUrl)
    .then((gltf) => {
      const scene = gltf?.scene || gltf?.scenes?.[0] || null;
      if (scene) {
        attachModelToNpc(npc, scene);
      } else {
        attachModelToNpc(npc, buildPlaceholderModel());
      }

      npc.mixer?.stopAllAction?.();
      npc.mixer?.uncacheRoot?.(npc.modelRoot || object3d);
      npc.mixer = null;

      if (Array.isArray(gltf?.animations) && gltf.animations.length) {
        npc.mixer = new THREE.AnimationMixer(scene || object3d);
        const clip = gltf.animations[0];
        const action = npc.mixer.clipAction(clip);
        action?.play();
      }

      return npc.modelRoot;
    })
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      const label = modelUrl || 'unknown';
      logOnce(
        `npc_model_${resolvedUrl}`,
        `[npc] Failed to load model ${label} at ${resolvedUrl}: ${reason} — using placeholder`
      );
      const placeholder = buildPlaceholderModel();
      attachModelToNpc(npc, placeholder);
      return placeholder;
    });
}

function disposeNpcEntity(npc) {
  if (!npc || npc.disposed) return;
  npc.disposed = true;
  npc.mixer?.stopAllAction?.();
  npc.mixer?.uncacheRoot?.(npc.modelRoot || npc.object3d);
  npc.mixer = null;
  if (npc.modelRoot) {
    if (npc.modelRoot.parent === npc.object3d) npc.object3d.remove(npc.modelRoot);
    disposeObject3D(npc.modelRoot);
    npc.modelRoot = null;
  }
  if (npc.object3d?.parent) {
    npc.object3d.parent.remove(npc.object3d);
  }
  disposeObject3D(npc.object3d);
}

function createNpcEntity(config = {}, { scene = null, navContext = null } = {}) {
  const {
    object3d: providedObject = null,
    modelUrl = null,
    initialPosition = null,
    waypoints = [],
    walkSpeed = DEFAULT_WALK_SPEED,
    runSpeed = DEFAULT_RUN_SPEED,
    accel = DEFAULT_ACCEL,
    turn = DEFAULT_TURN
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

  const sanitizedWaypoints = sanitizeWaypoints(waypoints, startPosition);
  const homePosition = sanitizedWaypoints[0]?.clone?.() || startPosition.clone();

  const npc = {
    object3d,
    waypoints: sanitizedWaypoints,
    defaultWaypoints: sanitizedWaypoints,
    walkSpeed: Number.isFinite(walkSpeed) ? walkSpeed : DEFAULT_WALK_SPEED,
    runSpeed: Number.isFinite(runSpeed) ? runSpeed : DEFAULT_RUN_SPEED,
    accel: Number.isFinite(accel) ? accel : DEFAULT_ACCEL,
    turn: THREE.MathUtils.clamp(Number.isFinite(turn) ? turn : DEFAULT_TURN, 0, 1),
    speed: 0,
    state: {
      vy: 0,
      lastGoodY: object3d.position.y || 0,
      yaw: object3d.rotation.y || 0
    },
    modelRoot: null,
    mixer: null,
    disposed: false,
    pathPoints: [],
    pathIndex: 0,
    hasDestination: false,
    destination: startPosition.clone(),
    loopDestinationIndex: null,
    looping: false,
    holdPosition: false,
    overrideActive: false,
    currentLoopIndex: sanitizedWaypoints.length > 1 ? 1 : 0,
    homePosition: homePosition.clone(),
    scheduleTarget: null,
    navContext: navContext || null,
    blockedTimer: 0,
    lastProgress: object3d.position.clone()
  };

  if (sanitizedWaypoints.length > 1) {
    INIT_DIRECTION.subVectors(sanitizedWaypoints[1], sanitizedWaypoints[0]);
    INIT_DIRECTION.y = 0;
    if (INIT_DIRECTION.lengthSq() > 1e-6) {
      npc.state.yaw = Math.atan2(INIT_DIRECTION.x, INIT_DIRECTION.z);
      object3d.rotation.y = npc.state.yaw;
    }
  }

  npc.ready = loadNpcModel(npc, modelUrl);
  npc.dispose = () => disposeNpcEntity(npc);
  return npc;
}

function stepNpc(npc, deltaSeconds, groundMeshes, navContextOverride = null) {
  if (!npc || npc.disposed) return;

  const dt = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
  if (dt <= 0) return;

  const surfaces = Array.isArray(groundMeshes) ? groundMeshes : [];

  npc.mixer?.update(dt);
  npc.pathPoints = npc.pathPoints || [];

  const navContext = navContextOverride || npc.navContext || null;

  skipReachedPoints(npc);

  if (npc.pathIndex >= npc.pathPoints.length) {
    if (npc.hasDestination) {
      handlePathCompletion(npc, navContext);
    }
    const accelFactor = Math.min(1, Math.max(0, npc.accel * dt));
    npc.speed += (0 - npc.speed) * accelFactor;
    snapToGround(npc.object3d, surfaces, npc.state, dt, SNAP_OPTIONS);
    keepUpright(npc.object3d, npc.state.yaw, npc.turn);
    return;
  }

  const target = npc.pathPoints[npc.pathIndex];
  if (!target) {
    npc.pathIndex += 1;
    snapToGround(npc.object3d, surfaces, npc.state, dt, SNAP_OPTIONS);
    keepUpright(npc.object3d, npc.state.yaw, npc.turn);
    return;
  }

  STEP_DIRECTION.subVectors(target, npc.object3d.position);
  STEP_DIRECTION.y = 0;
  const distanceSq = STEP_DIRECTION.lengthSq();

  if (distanceSq <= PATH_POINT_EPSILON_SQ) {
    npc.pathIndex += 1;
    skipReachedPoints(npc);
    if (npc.pathIndex >= npc.pathPoints.length) {
      handlePathCompletion(npc, navContext);
    }
    snapToGround(npc.object3d, surfaces, npc.state, dt, SNAP_OPTIONS);
    keepUpright(npc.object3d, npc.state.yaw, npc.turn);
    return;
  }

  const distance = Math.sqrt(distanceSq);
  const desiredSpeed = npc.walkSpeed;
  const accelFactor = Math.min(1, Math.max(0, npc.accel * dt));
  npc.speed += (desiredSpeed - npc.speed) * accelFactor;

  if (distance > 1e-6) {
    STEP_DIRECTION.multiplyScalar(1 / distance);
    const yaw = Math.atan2(STEP_DIRECTION.x, STEP_DIRECTION.z);
    npc.state.yaw = yaw;
    npc.object3d.position.x += STEP_DIRECTION.x * npc.speed * dt;
    npc.object3d.position.z += STEP_DIRECTION.z * npc.speed * dt;
  }

  snapToGround(npc.object3d, surfaces, npc.state, dt, SNAP_OPTIONS);
  keepUpright(npc.object3d, npc.state.yaw, npc.turn);
  checkBlocked(npc, dt, navContext);
}

export function createNpc(options = {}) {
  const { navContext = null, ...npcOptions } = options || {};
  const npc = createNpcEntity(npcOptions, { navContext });
  return {
    object3d: npc.object3d,
    update(deltaSeconds, context = {}) {
      if (context.skippedLargeDt) {
        return;
      }
      const nav = context.navContext || navContext || npc.navContext || null;
      stepNpc(npc, deltaSeconds, context.groundMeshes, nav);
    },
    dispose() {
      npc.dispose();
    },
    ready: npc.ready
  };
}

export function createNpcManager(scene, groundMeshes, options = {}) {
  const npcs = [];
  const surfaces = Array.isArray(groundMeshes) ? groundMeshes : [];
  let warnedGround = false;
  const { navMesh = null, pathfinder = null, timeSource = null, navGrid: initialNavGrid = null } = options || {};
  const navContext = { navMesh, pathfinder, navGrid: initialNavGrid };
  let lastTimeMode = typeof timeSource === 'function' ? timeSource() : null;
  let activeSchedule = mapModeToSchedule(lastTimeMode);

  function spawn(config = {}) {
    const npc = createNpcEntity(config, { scene, navContext });
    npcs.push(npc);
    const originalDispose = npc.dispose;
    npc.dispose = () => {
      if (npc.disposed) return;
      originalDispose();
      const index = npcs.indexOf(npc);
      if (index !== -1) npcs.splice(index, 1);
    };
    applyScheduleTarget(npc, activeSchedule, navContext);
    return npc;
  }

  function update(deltaSeconds, context = {}) {
    if (context?.skippedLargeDt) {
      return;
    }
    const rawDt = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
    if (rawDt <= 0) {
      logOnce('dt_zero', '[npc] bad dt', rawDt);
    } else if (rawDt > 0.2) {
      logOnce('dt_huge', '[npc] bad dt', rawDt);
    }
    const dt = Math.max(0, Math.min(rawDt, 0.2));
    if (dt === 0) return;

    if (!warnedGround && surfaces.length === 0) {
      console.warn('[npc] no ground meshes');
      warnedGround = true;
    }

    const mode = typeof timeSource === 'function' ? timeSource() : lastTimeMode;
    if (mode !== lastTimeMode) {
      lastTimeMode = mode;
      activeSchedule = mapModeToSchedule(mode);
      for (const npc of npcs) {
        applyScheduleTarget(npc, activeSchedule, navContext);
      }
    }

    for (const npc of npcs) {
      stepNpc(npc, dt, surfaces, navContext);
    }
  }

  function dispose() {
    while (npcs.length > 0) {
      const npc = npcs.pop();
      npc?.dispose?.();
    }
  }

  function setNavGrid(grid) {
    navContext.navGrid = grid || null;
  }

  return { spawn, update, dispose, setNavGrid, _npcs: npcs };
}
