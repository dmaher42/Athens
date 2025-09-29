import * as THREE from 'three';

const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const targetWorldPosition = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const cameraForward = new THREE.Vector3();

const MIN_PITCH = THREE.MathUtils.degToRad(-85);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
const DEFAULT_YAW_SPEED = 1.8; // radians per second
const DEFAULT_PITCH_SPEED = 1.4; // radians per second
const MAX_DT = 0.25;
const DEFAULT_DT = 1 / 60;

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

  const update = (keyboardState, deltaSeconds = 0) => {
    if (!camera || !currentTarget) {
      return;
    }

    const dtRaw = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : NaN;
    const dt = Number.isFinite(dtRaw) ? Math.min(dtRaw, MAX_DT) : DEFAULT_DT;

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

    yawOffset += lookX * options.yawSpeed * dt;
    pitchOffset += lookY * options.pitchSpeed * dt;
    pitchOffset = THREE.MathUtils.clamp(pitchOffset, pitchMin, pitchMax);

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
    options
  };
}

export default createFollowCamera;
