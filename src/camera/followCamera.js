import * as THREE from 'three';

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const targetWorldPosition = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const cameraForward = new THREE.Vector3();

const MIN_PITCH = THREE.MathUtils.degToRad(-85);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const DEFAULT_YAW_SPEED = 2.0; // radians per second
const DEFAULT_PITCH_SPEED = 1.6; // radians per second
const MAX_DT = 0.25;
const DEFAULT_DT = 1 / 60;
const MOUSE_SENSITIVITY = 0.0018;

function computeBaseParameters(offset) {
  const offsetVector = offset.clone();
  const radius = offsetVector.length();
  const horizontal = Math.sqrt(offsetVector.x * offsetVector.x + offsetVector.z * offsetVector.z);
  const basePitch = horizontal > 1e-5 ? Math.atan2(offsetVector.y, horizontal) : 0;
  const baseYaw = Math.atan2(offsetVector.x, offsetVector.z);
  return { radius, basePitch, baseYaw };
}

function wrapAngle(angle) {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

export function createFollowCamera(
  camera,
  target,
  {
    offset = new THREE.Vector3(0, 2.2, -6),
    lerp = 0.12,
    lookAtOffset = new THREE.Vector3(0, 1.5, 0),
    yawSpeed = DEFAULT_YAW_SPEED,
    pitchSpeed = DEFAULT_PITCH_SPEED
  } = {}
) {
  const options = {
    offset: offset.clone(),
    lerp: Number.isFinite(lerp) ? lerp : 0.12,
    lookAtOffset: lookAtOffset.clone(),
    yawSpeed: Number.isFinite(yawSpeed) ? yawSpeed : DEFAULT_YAW_SPEED,
    pitchSpeed: Number.isFinite(pitchSpeed) ? pitchSpeed : DEFAULT_PITCH_SPEED
  };

  let currentTarget = target || null;
  const base = computeBaseParameters(options.offset);
  const pitchMin = MIN_PITCH - base.basePitch;
  const pitchMax = MAX_PITCH - base.basePitch;

  let yawOffset = 0;
  let pitchOffset = 0;
  let cachedTargetYaw = 0;
  let pointerElement = null;
  let accumulatedMouseDX = 0;
  let accumulatedMouseDY = 0;
  let handlePointerMove = null;
  let handlePointerLockChange = null;
  let handleClick = null;

  const browserWindow = typeof window !== 'undefined' ? window : null;
  const browserDocument = typeof document !== 'undefined' ? document : null;

  const getTargetYaw = () => {
    if (!currentTarget) {
      return cachedTargetYaw;
    }
    currentTarget.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() > 1e-6) {
      cameraForward.normalize();
      cachedTargetYaw = Math.atan2(cameraForward.x, cameraForward.z);
    }
    return cachedTargetYaw;
  };

  const computeDesired = (out = desiredPosition) => {
    if (!camera || !currentTarget) {
      return out.set(0, 0, 0);
    }

    const targetYaw = getTargetYaw();
    const finalYaw = targetYaw + yawOffset + base.baseYaw;
    const finalPitch = THREE.MathUtils.clamp(base.basePitch + pitchOffset, MIN_PITCH, MAX_PITCH);
    const radius = base.radius;
    const horizontal = Math.cos(finalPitch) * radius;

    out.set(
      Math.sin(finalYaw) * horizontal,
      Math.sin(finalPitch) * radius,
      Math.cos(finalYaw) * horizontal
    );

    currentTarget.getWorldPosition(targetWorldPosition);
    out.add(targetWorldPosition);
    return out;
  };

  const computeLerpAlpha = (dt) => {
    if (!Number.isFinite(options.lerp) || options.lerp <= 0) {
      return 1;
    }
    if (!Number.isFinite(dt) || dt <= 0) {
      return THREE.MathUtils.clamp(options.lerp, 0, 1);
    }
    const scaled = 1 - Math.exp(-options.lerp * dt * 60);
    return THREE.MathUtils.clamp(scaled, 0, 1);
  };

  const detachPointerLock = () => {
    if (pointerElement && handleClick && pointerElement.removeEventListener) {
      pointerElement.removeEventListener('click', handleClick);
    }
    if (browserWindow && handlePointerMove) {
      browserWindow.removeEventListener('mousemove', handlePointerMove);
    }
    if (browserDocument && handlePointerLockChange) {
      browserDocument.removeEventListener('pointerlockchange', handlePointerLockChange);
    }
    pointerElement = null;
    handleClick = null;
    handlePointerMove = null;
    handlePointerLockChange = null;
    accumulatedMouseDX = 0;
    accumulatedMouseDY = 0;
  };

  const applyPointerLockElement = (element) => {
    if (pointerElement === element) {
      return;
    }
    detachPointerLock();
    if (!element || typeof element.addEventListener !== 'function') {
      return;
    }
    pointerElement = element;
    handleClick = () => {
      if (pointerElement && typeof pointerElement.requestPointerLock === 'function') {
        pointerElement.requestPointerLock();
      } else if (pointerElement && pointerElement.requestPointerLock) {
        try {
          pointerElement.requestPointerLock();
        } catch {
          // ignore errors from browsers without pointer lock
        }
      }
    };
    pointerElement.addEventListener('click', handleClick);

    handlePointerMove = (event) => {
      if (!browserDocument || browserDocument.pointerLockElement !== pointerElement) {
        return;
      }
      const movementX = Number.isFinite(event?.movementX) ? event.movementX : 0;
      const movementY = Number.isFinite(event?.movementY) ? event.movementY : 0;
      if (movementX) accumulatedMouseDX += movementX;
      if (movementY) accumulatedMouseDY += movementY;
    };
    browserWindow?.addEventListener?.('mousemove', handlePointerMove);

    handlePointerLockChange = () => {
      if (!browserDocument || browserDocument.pointerLockElement !== pointerElement) {
        accumulatedMouseDX = 0;
        accumulatedMouseDY = 0;
      }
    };
    browserDocument?.addEventListener?.('pointerlockchange', handlePointerLockChange);
  };

  const update = (keyboardState, deltaSeconds = 0) => {
    if (!camera || !currentTarget) {
      return;
    }

    const dtRaw = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : NaN;
    const dt = Number.isFinite(dtRaw) ? Math.min(dtRaw, MAX_DT) : DEFAULT_DT;
    const dtSafe = Number.isFinite(dt) ? dt : DEFAULT_DT;

    let lookX = 0;
    let lookY = 0;

    const axis = keyboardState?.axis && Object.prototype.hasOwnProperty.call(keyboardState.axis, 'lookX')
      ? keyboardState.axis
      : null;
    const axisLookX = axis ? axis.lookX : undefined;
    const axisLookY = axis ? axis.lookY : undefined;

    if (Number.isFinite(axisLookX)) {
      lookX += axisLookX;
    }
    if (Number.isFinite(axisLookY)) {
      lookY += axisLookY;
    }

    if (keyboardState?.look) {
      const fallbackLookX = keyboardState.look.x;
      const fallbackLookY = keyboardState.look.y;
      if (Number.isFinite(fallbackLookX)) {
        if (!Number.isFinite(axisLookX) || Math.abs(fallbackLookX - axisLookX) > 1e-6) {
          lookX += fallbackLookX;
        }
      }
      if (Number.isFinite(fallbackLookY)) {
        if (!Number.isFinite(axisLookY) || Math.abs(fallbackLookY - axisLookY) > 1e-6) {
          lookY += fallbackLookY;
        }
      }
    }

    if (!Number.isFinite(yawOffset)) {
      yawOffset = 0;
    }
    if (!Number.isFinite(pitchOffset)) {
      pitchOffset = 0;
    }

    if (accumulatedMouseDX !== 0 || accumulatedMouseDY !== 0) {
      yawOffset += accumulatedMouseDX * MOUSE_SENSITIVITY;
      pitchOffset -= accumulatedMouseDY * MOUSE_SENSITIVITY;
      accumulatedMouseDX = 0;
      accumulatedMouseDY = 0;
    }

    yawOffset += lookX * options.yawSpeed * dtSafe;
    pitchOffset += lookY * options.pitchSpeed * dtSafe;
    pitchOffset = THREE.MathUtils.clamp(pitchOffset, pitchMin, pitchMax);
    yawOffset = wrapAngle(yawOffset);

    const lerpAlpha = computeLerpAlpha(dt);
    computeDesired(desiredPosition);
    camera.position.lerp(desiredPosition, lerpAlpha);

    lookOffset.copy(options.lookAtOffset);
    currentTarget.getWorldQuaternion(tempQuaternion);
    lookOffset.applyQuaternion(tempQuaternion);
    tempPosition.copy(targetWorldPosition).add(lookOffset);
    camera.lookAt(tempPosition);
  };

  const syncImmediate = () => {
    if (!camera || !currentTarget) {
      return;
    }
    computeDesired(desiredPosition);
    camera.position.copy(desiredPosition);
    lookOffset.copy(options.lookAtOffset);
    currentTarget.getWorldQuaternion(tempQuaternion);
    lookOffset.applyQuaternion(tempQuaternion);
    tempPosition.copy(targetWorldPosition).add(lookOffset);
    camera.lookAt(tempPosition);
  };

  const setTarget = (nextTarget) => {
    if (!nextTarget) {
      return;
    }
    currentTarget = nextTarget;
    currentTarget.getWorldPosition(targetWorldPosition);
    tempPosition.copy(camera.position).sub(targetWorldPosition);
    const horizontal = Math.sqrt(tempPosition.x * tempPosition.x + tempPosition.z * tempPosition.z);
    const worldPitch = horizontal > 1e-6 ? Math.atan2(tempPosition.y, horizontal) : 0;
    const worldYaw = Math.atan2(tempPosition.x, tempPosition.z);
    const targetYaw = getTargetYaw();
    yawOffset = wrapAngle(worldYaw - targetYaw - base.baseYaw);
    pitchOffset = THREE.MathUtils.clamp(worldPitch - base.basePitch, pitchMin, pitchMax);
    syncImmediate();
  };

  if (currentTarget) {
    setTarget(currentTarget);
  }

  return {
    update,
    setTarget,
    syncImmediate,
    options,
    setPointerLockElement(element) {
      applyPointerLockElement(element);
    },
    get target() {
      return currentTarget;
    }
  };
}

export default createFollowCamera;
