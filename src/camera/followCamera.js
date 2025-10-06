import * as THREE from 'three';

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const targetWorldPosition = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const spherical = new THREE.Spherical();

const MIN_PITCH = THREE.MathUtils.degToRad(-85);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const DEFAULT_YAW_SPEED = 2.0; // radians per second
const DEFAULT_PITCH_SPEED = 1.6; // radians per second
const MAX_DT = 0.25;
const DEFAULT_DT = 1 / 60;
const DEFAULT_POINTER_SENSITIVITY = 0.0025;

function computeBaseParameters(offset) {
  const offsetVector = offset.clone();
  const radius = offsetVector.length();
  const horizontal = Math.sqrt(offsetVector.x * offsetVector.x + offsetVector.z * offsetVector.z);
  const basePitch = horizontal > 1e-5 ? Math.atan2(offsetVector.y, horizontal) : 0;
  const baseYaw = Math.atan2(offsetVector.x, offsetVector.z);
  return { radius, basePitch, baseYaw };
}

export function createFollowCamera(
  camera,
  target,
  {
    offset = new THREE.Vector3(0, 3.5, -8),
    lerp = 0.12,
    lookAtOffset = new THREE.Vector3(0, 1.5, 0),
    yawSpeed = DEFAULT_YAW_SPEED,
    pitchSpeed = DEFAULT_PITCH_SPEED,
    pointerSensitivity = DEFAULT_POINTER_SENSITIVITY
  } = {}
) {
  const options = {
    offset: offset.clone(),
    lerp: Number.isFinite(lerp) ? lerp : 0.12,
    lookAtOffset: lookAtOffset.clone(),
    yawSpeed: Number.isFinite(yawSpeed) ? yawSpeed : DEFAULT_YAW_SPEED,
    pitchSpeed: Number.isFinite(pitchSpeed) ? pitchSpeed : DEFAULT_PITCH_SPEED,
    pointerSensitivity:
      Number.isFinite(pointerSensitivity) && pointerSensitivity > 0
        ? pointerSensitivity
        : DEFAULT_POINTER_SENSITIVITY
  };

  let currentTarget = target || null;
  const base = computeBaseParameters(options.offset);
  const rigState = (() => {
    if (!camera || typeof camera !== 'object') {
      return { yaw: 0, pitch: 0, distance: base.radius };
    }
    const existing = (camera).__rigState;
    if (existing && typeof existing === 'object') {
      if (!Number.isFinite(existing.distance) || existing.distance <= 0) {
        existing.distance = base.radius;
      }
      return existing;
    }
    const state = { yaw: 0, pitch: 0, distance: base.radius };
    (camera).__rigState = state;
    return state;
  })();

  const sanitizeYaw = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return THREE.MathUtils.euclideanModulo(value + Math.PI, Math.PI * 2) - Math.PI;
  };

  const sanitizePitch = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return THREE.MathUtils.clamp(value, MIN_PITCH, MAX_PITCH);
  };

  let pointerElement = null;
  let pointerPointerId = null;
  let pointerLastX = 0;
  let pointerLastY = 0;
  let pointerActive = false;
  let pointerLookDeltaX = 0;
  let pointerLookDeltaY = 0;

  const resetPointerState = () => {
    pointerPointerId = null;
    pointerActive = false;
  };

  const applyPointerDelta = (deltaX = 0, deltaY = 0) => {
    if (Number.isFinite(deltaX) && deltaX !== 0) {
      pointerLookDeltaX += deltaX;
    }
    if (Number.isFinite(deltaY) && deltaY !== 0) {
      pointerLookDeltaY += deltaY;
    }
  };

  const handlePointerMove = (event) => {
    if (!event) {
      return;
    }
    const doc = typeof document !== 'undefined' ? document : null;
    const hasPointerLock = doc && doc.pointerLockElement === pointerElement;
    if (!pointerActive && !hasPointerLock) {
      return;
    }

    if (hasPointerLock) {
      const deltaX = Number.isFinite(event.movementX) ? event.movementX : 0;
      const deltaY = Number.isFinite(event.movementY) ? event.movementY : 0;
      if (deltaX !== 0 || deltaY !== 0) {
        applyPointerDelta(deltaX, -deltaY);
      }
      return;
    }

    if (!pointerActive) {
      return;
    }

    const nextX = Number.isFinite(event.clientX) ? event.clientX : pointerLastX;
    const nextY = Number.isFinite(event.clientY) ? event.clientY : pointerLastY;
    const deltaX = Number.isFinite(nextX - pointerLastX) ? nextX - pointerLastX : 0;
    const deltaY = Number.isFinite(nextY - pointerLastY) ? nextY - pointerLastY : 0;
    pointerLastX = nextX;
    pointerLastY = nextY;
    if (deltaX !== 0 || deltaY !== 0) {
      applyPointerDelta(deltaX, -deltaY);
    }
  };

  const handlePointerUp = (event) => {
    if (!event) {
      resetPointerState();
      return;
    }
    if (pointerPointerId !== null && event.pointerId !== pointerPointerId) {
      return;
    }
    if (pointerElement && typeof pointerElement.releasePointerCapture === 'function') {
      try {
        pointerElement.releasePointerCapture(event.pointerId);
      } catch {}
    }
    resetPointerState();
  };

  const handlePointerDown = (event) => {
    if (!event || (event.button !== 0 && event.button !== 2) || event.pointerType === 'touch') {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    pointerPointerId = event.pointerId;
    pointerActive = true;
    pointerLastX = Number.isFinite(event.clientX) ? event.clientX : 0;
    pointerLastY = Number.isFinite(event.clientY) ? event.clientY : 0;
    if (pointerElement && typeof pointerElement.setPointerCapture === 'function') {
      try {
        pointerElement.setPointerCapture(event.pointerId);
      } catch {}
    }
    if (pointerElement && typeof pointerElement.requestPointerLock === 'function') {
      try {
        pointerElement.requestPointerLock();
      } catch {}
    }
  };

  const handlePointerCancel = (event) => {
    if (pointerPointerId !== null && event?.pointerId !== pointerPointerId) {
      return;
    }
    resetPointerState();
  };

  const handlePointerLockChange = () => {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) {
      return;
    }
    if (doc.pointerLockElement !== pointerElement) {
      resetPointerState();
    }
  };

  const documentListeners = [];
  const windowListeners = [];

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockChange);
    documentListeners.push(['pointerlockchange', handlePointerLockChange]);
    documentListeners.push(['pointerlockerror', handlePointerLockChange]);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('blur', resetPointerState);
    windowListeners.push(['blur', resetPointerState]);
  }

  const detachPointerElement = () => {
    if (!pointerElement) {
      return;
    }
    const element = pointerElement;
    element.removeEventListener?.('pointerdown', handlePointerDown);
    element.removeEventListener?.('pointermove', handlePointerMove);
    element.removeEventListener?.('pointerup', handlePointerUp);
    element.removeEventListener?.('pointercancel', handlePointerCancel);
    element.removeEventListener?.('lostpointercapture', handlePointerCancel);
    element.removeEventListener?.('pointerleave', handlePointerCancel);
    element.removeEventListener?.('pointerout', handlePointerCancel);
    if (pointerPointerId !== null && typeof element.releasePointerCapture === 'function') {
      try {
        element.releasePointerCapture(pointerPointerId);
      } catch {}
    }
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.pointerLockElement === element && typeof doc.exitPointerLock === 'function') {
      try {
        doc.exitPointerLock();
      } catch {}
    }
    pointerElement = null;
    resetPointerState();
  };

  const attachPointerElement = (element) => {
    if (!element || typeof element.addEventListener !== 'function') {
      return;
    }
    pointerElement = element;
    pointerElement.addEventListener('pointerdown', handlePointerDown);
    pointerElement.addEventListener('pointermove', handlePointerMove);
    pointerElement.addEventListener('pointerup', handlePointerUp);
    pointerElement.addEventListener('pointercancel', handlePointerCancel);
    pointerElement.addEventListener('lostpointercapture', handlePointerCancel);
    pointerElement.addEventListener('pointerleave', handlePointerCancel);
    pointerElement.addEventListener('pointerout', handlePointerCancel);
  };

  const setPointerElement = (element) => {
    if (element === pointerElement) {
      return;
    }
    detachPointerElement();
    pointerLookDeltaX = 0;
    pointerLookDeltaY = 0;
    if (element) {
      attachPointerElement(element);
    }
  };

  const dispose = () => {
    detachPointerElement();
    if (typeof document !== 'undefined') {
      for (const [name, handler] of documentListeners) {
        document.removeEventListener(name, handler);
      }
    }
    if (typeof window !== 'undefined') {
      for (const [name, handler] of windowListeners) {
        window.removeEventListener(name, handler);
      }
    }
  };

  const computeDesired = (out = desiredPosition) => {
    if (!camera || !currentTarget) {
      return out.set(0, 0, 0);
    }

    const yaw = sanitizeYaw(rigState.yaw);
    const pitch = sanitizePitch(rigState.pitch);
    const radius = Number.isFinite(rigState.distance) && rigState.distance > 1e-3
      ? rigState.distance
      : base.radius;

    currentTarget.getWorldPosition(targetWorldPosition);

    spherical.radius = radius;
    spherical.theta = yaw;
    spherical.phi = Math.PI / 2 - pitch;
    out.setFromSpherical(spherical);
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

    if (!Number.isFinite(rigState.yaw)) {
      rigState.yaw = 0;
    }
    if (!Number.isFinite(rigState.pitch)) {
      rigState.pitch = 0;
    }

    rigState.yaw += lookX * options.yawSpeed * dtSafe;
    rigState.pitch += lookY * options.pitchSpeed * dtSafe;

    const pointerDeltaX = pointerLookDeltaX;
    const pointerDeltaY = pointerLookDeltaY;
    pointerLookDeltaX = 0;
    pointerLookDeltaY = 0;

    if (Number.isFinite(pointerDeltaX) && pointerDeltaX !== 0) {
      rigState.yaw += pointerDeltaX * options.pointerSensitivity;
    }

    if (Number.isFinite(pointerDeltaY) && pointerDeltaY !== 0) {
      rigState.pitch += pointerDeltaY * options.pointerSensitivity;
    }

    rigState.pitch = sanitizePitch(rigState.pitch);
    rigState.yaw = sanitizeYaw(rigState.yaw);

    const lerpAlpha = computeLerpAlpha(dt);
    computeDesired(desiredPosition);
    camera.position.lerp(desiredPosition, lerpAlpha);

    lookOffset.copy(options.lookAtOffset);
    currentTarget.getWorldQuaternion(tempQuaternion);
    lookOffset.applyQuaternion(tempQuaternion);
    tempPosition.copy(targetWorldPosition).add(lookOffset);
    if (tempPosition.distanceToSquared(camera.position) < 1e-9) {
      tempPosition.y += 0.001;
    }
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
    if (tempPosition.distanceToSquared(camera.position) < 1e-9) {
      tempPosition.y += 0.001;
    }
    camera.lookAt(tempPosition);
  };

  const setTarget = (nextTarget) => {
    if (!nextTarget) {
      return;
    }
    currentTarget = nextTarget;
    currentTarget.getWorldPosition(targetWorldPosition);
    tempPosition.copy(camera.position).sub(targetWorldPosition);
    const distance = tempPosition.length();
    const horizontal = Math.sqrt(tempPosition.x * tempPosition.x + tempPosition.z * tempPosition.z);
    const worldPitch = horizontal > 1e-6 ? Math.atan2(tempPosition.y, horizontal) : 0;
    const worldYaw = Math.atan2(tempPosition.x, tempPosition.z);
    if (!Number.isFinite(rigState.distance) || rigState.distance <= 0) {
      rigState.distance = distance > 1e-6 ? distance : base.radius;
    }
    rigState.pitch = sanitizePitch(worldPitch);
    rigState.yaw = sanitizeYaw(worldYaw);
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
      setPointerElement(element);
    },
    dispose,
    get target() {
      return currentTarget;
    }
  };
}

export default createFollowCamera;
