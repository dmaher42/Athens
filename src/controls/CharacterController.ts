import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Capsule as ExampleCapsule } from 'three/examples/jsm/math/Capsule.js';

import type { CollisionWorld } from '../physics/collisionWorld.ts';
import { DEFAULT_PLAYER, sanitizeVec3 } from '../utils/sanitize.ts';

const Capsule = ExampleCapsule;

const _up = new THREE.Vector3(0, 1, 0);
const _movement = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _desiredVelocity = new THREE.Vector3();
const _horizontalVelocity = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _capsuleCenter = new THREE.Vector3();
const _remaining = new THREE.Vector3();
const _stepUp = new THREE.Vector3(0, 1, 0);
const _pushOut = new THREE.Vector3();
const _capsuleHit = {
  normal: _hitNormal,
  point: _hitPoint,
  depth: 0
};

const _zeroVector = { x: 0, y: 0, z: 0 };

const EPSILON = 1e-5;
const MAX_SWEEP_ITERATIONS = 5;

export interface CharacterInput {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  flyToggle?: boolean;
  flyUp?: boolean;
  flyDown?: boolean;
}

export interface CharacterControllerWorld extends CollisionWorld {}

export interface CharacterFlightOptions {
  enabled?: boolean;
  horizontalSpeed?: number;
  verticalSpeed?: number;
  nudgeUp?: number;
  exitHover?: number;
  startGraceFrames?: number;
}

export interface CharacterControllerOptions {
  height?: number;
  radius?: number;
  gravity?: number;
  walkSpeed?: number;
  runMultiplier?: number;
  jumpSpeed?: number;
  damping?: number;
  stepOffset?: number;
  autoUpdateCamera?: boolean;
  safePosition?: { x: number; y: number; z: number } | THREE.Vector3;
  flight?: CharacterFlightOptions;
}

export class CharacterController {
  public readonly capsule: InstanceType<typeof Capsule>;
  public readonly velocity = new THREE.Vector3();
  public onGround = false;
  public gravity = 9.8;
  public walkSpeed = 2.5;
  public runMultiplier = 1.5;
  public jumpSpeed = 4.5;
  public damping = 0.12;
  public stepOffset = 0.3;
  public flightHorizontalSpeed = 6;
  public flightVerticalSpeed = 6;
  public flightNudgeUp = 0.25;
  public flightExitHover = 0.05;
  public flightGraceFrames = 3;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly headOffset = new THREE.Vector3(0, 0.2, 0);
  private readonly _position = new THREE.Vector3();
  private readonly _halfSegment = new THREE.Vector3();
  private readonly safePosition = { x: DEFAULT_PLAYER.x, y: DEFAULT_PLAYER.y, z: DEFAULT_PLAYER.z };
  private readonly autoUpdateCamera: boolean;
  private attachedObject: THREE.Object3D | null = null;
  private flightEnabled = true;
  private flightToggleDown = false;
  private _isFlying = false;
  private _isRunning = false;
  private graceFramesRemaining = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    start: THREE.Vector3,
    options: CharacterControllerOptions = {}
  ) {
    this.camera = camera;
    this.autoUpdateCamera = Boolean(options.autoUpdateCamera);

    const height = Number.isFinite(options.height)
      ? Math.max(options.height ?? 0, EPSILON * 2)
      : 1.7;
    const radius = Number.isFinite(options.radius)
      ? Math.max(options.radius ?? 0.05, EPSILON)
      : 0.35;
    const clampedHeight = Math.max(height, radius * 2 + EPSILON);

    const halfSegmentLength = Math.max((clampedHeight - radius * 2) * 0.5, 0);
    const center = start.clone();
    const startLine = center.clone().addScaledVector(_up, -halfSegmentLength);
    const endLine = center.clone().addScaledVector(_up, halfSegmentLength);

    this.capsule = new Capsule(startLine, endLine, radius);
    this.headOffset.set(0, Math.max(0.2, clampedHeight * 0.5 - 0.1), 0);
    this._halfSegment.set(0, halfSegmentLength, 0);

    if (Number.isFinite(options.gravity)) {
      this.gravity = Math.max(options.gravity ?? this.gravity, 0);
    }
    if (Number.isFinite(options.walkSpeed)) {
      this.walkSpeed = Math.max(options.walkSpeed ?? this.walkSpeed, 0);
    }
    if (Number.isFinite(options.runMultiplier)) {
      this.runMultiplier = Math.max(options.runMultiplier ?? this.runMultiplier, 1);
    }
    if (Number.isFinite(options.jumpSpeed)) {
      this.jumpSpeed = Math.max(options.jumpSpeed ?? this.jumpSpeed, 0);
    }
    if (Number.isFinite(options.damping)) {
      this.damping = Math.max(options.damping ?? this.damping, 0);
    }
    if (Number.isFinite(options.stepOffset)) {
      this.stepOffset = Math.max(options.stepOffset ?? this.stepOffset, 0);
    }

    const safe = options.safePosition;
    if (safe && typeof safe === 'object') {
      const safeX = Number(safe.x);
      const safeY = Number(safe.y);
      const safeZ = Number(safe.z);
      if (Number.isFinite(safeX)) this.safePosition.x = safeX;
      if (Number.isFinite(safeY)) this.safePosition.y = safeY;
      if (Number.isFinite(safeZ)) this.safePosition.z = safeZ;
    }

    if (options.flight) {
      const { enabled, horizontalSpeed, verticalSpeed, nudgeUp, exitHover, startGraceFrames } =
        options.flight;
      if (typeof enabled === 'boolean') {
        this.flightEnabled = enabled;
      }
      if (Number.isFinite(horizontalSpeed)) {
        this.flightHorizontalSpeed = Math.max(horizontalSpeed ?? 0, 0);
      }
      if (Number.isFinite(verticalSpeed)) {
        this.flightVerticalSpeed = Math.max(verticalSpeed ?? 0, 0);
      }
      if (Number.isFinite(nudgeUp)) {
        this.flightNudgeUp = Math.max(nudgeUp ?? 0, 0);
      }
      if (Number.isFinite(exitHover)) {
        this.flightExitHover = Math.max(exitHover ?? 0, 0);
      }
      if (Number.isFinite(startGraceFrames)) {
        this.flightGraceFrames = Math.max(Math.floor(startGraceFrames ?? 0), 0);
      }
    }

    this.sanitizeCapsule();
    if (this.autoUpdateCamera) {
      this.updateCameraPosition();
    }
  }

  get position(): THREE.Vector3 {
    return this.getCapsuleCenter(this._position);
  }

  public update(
    dt: number,
    input: CharacterInput,
    world: CharacterControllerWorld
  ): void {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }

    const clampedDt = Math.min(dt, 0.25);

    this.handleFlightToggle(input);
    this.resolveMovement(clampedDt, input);
    this.integratePhysics(clampedDt, input);

    _movement.copy(this.velocity).multiplyScalar(clampedDt);

    if (this._isFlying && this.graceFramesRemaining > 0 && this.flightNudgeUp > 0) {
      const frames = Math.max(1, this.flightGraceFrames || 1);
      _movement.y += this.flightNudgeUp / frames;
      this.graceFramesRemaining = Math.max(0, this.graceFramesRemaining - 1);
    }

    if (this.onGround && world?.bvh && this.hasHorizontalMovement(_movement)) {
      const attempted = this.attemptStep(_movement, world);
      if (!attempted) {
        this.sweepCapsule(_movement, world);
      }
    } else {
      this.sweepCapsule(_movement, world);
    }

    this.sanitizeCapsule();
    if (this.autoUpdateCamera) {
      this.updateCameraPosition();
    }
    this.syncAttachedObject();
  }

  private resolveMovement(dt: number, input: CharacterInput) {
    const { forward = 0, right = 0, sprint = false } = input ?? {};

    this.camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < EPSILON) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }

    _right.copy(_forward).cross(_up).normalize();

    _desiredVelocity.set(0, 0, 0);
    if (Math.abs(forward) > EPSILON) {
      _desiredVelocity.addScaledVector(_forward, forward);
    }
    if (Math.abs(right) > EPSILON) {
      _desiredVelocity.addScaledVector(_right, right);
    }

    if (_desiredVelocity.lengthSq() > EPSILON) {
      _desiredVelocity.normalize();
    }

    const hasMoveInput = _desiredVelocity.lengthSq() > EPSILON;

    const runSpeed = this.walkSpeed * this.runMultiplier;
    const baseSpeed = this.walkSpeed;
    const horizontalSpeed = this._isFlying
      ? this.flightHorizontalSpeed
      : sprint
        ? Math.max(runSpeed, baseSpeed)
        : baseSpeed;

    _desiredVelocity.multiplyScalar(horizontalSpeed);

    _horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
    const lerpFactor = 1 - Math.exp(-this.damping * dt);
    _horizontalVelocity.lerp(_desiredVelocity, THREE.MathUtils.clamp(lerpFactor, 0, 1));

    this.velocity.x = _horizontalVelocity.x;
    this.velocity.z = _horizontalVelocity.z;

    this._isRunning = Boolean(!this._isFlying && sprint && hasMoveInput && horizontalSpeed > baseSpeed);
  }

  private integratePhysics(dt: number, input: CharacterInput) {
    const { jump = false } = input ?? {};

    if (this._isFlying) {
      const ascend = input?.flyUp ? 1 : 0;
      const descend = input?.flyDown ? 1 : 0;
      const vertical = ascend - descend;
      if (vertical !== 0 && this.flightVerticalSpeed > 0) {
        this.velocity.y = vertical * this.flightVerticalSpeed;
      } else {
        this.velocity.y = 0;
      }
      sanitizeVec3(this.velocity, _zeroVector);
      return;
    }

    this.velocity.y -= this.gravity * dt;
    if (this.onGround) {
      if (jump) {
        this.velocity.y = this.jumpSpeed;
        this.onGround = false;
      } else if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    sanitizeVec3(this.velocity, _zeroVector);
  }

  private attemptStep(delta: THREE.Vector3, world: CharacterControllerWorld): boolean {
    const bvh = world?.bvh;
    if (!(bvh instanceof MeshBVH)) {
      return false;
    }

    const hasHorizontal = this.hasHorizontalMovement(delta);
    if (!hasHorizontal) {
      return false;
    }

    const startBottom = this.capsule.start.clone();
    const startTop = this.capsule.end.clone();

    _stepUp.set(0, this.stepOffset, 0);
    this.capsule.translate(_stepUp);
    const movedUp = this.sweepCapsule(delta, world, { allowRetry: false });
    if (!movedUp) {
      this.capsule.start.copy(startBottom);
      this.capsule.end.copy(startTop);
      return false;
    }

    _stepUp.set(0, -this.stepOffset, 0);
    this.sweepCapsule(_stepUp, world, { allowRetry: false });

    return true;
  }

  private sweepCapsule(
    delta: THREE.Vector3,
    world: CharacterControllerWorld,
    { allowRetry = true }: { allowRetry?: boolean } = {}
  ): boolean {
    if (!delta || delta.lengthSq() <= EPSILON) {
      return true;
    }

    this.onGround = false;

    if (!(world?.bvh instanceof MeshBVH)) {
      this.capsule.translate(delta);
      return true;
    }

    const bvh = world.bvh;
    _remaining.copy(delta);

    for (let i = 0; i < MAX_SWEEP_ITERATIONS; i += 1) {
      this.capsule.translate(_remaining);
      const hit = (bvh as unknown as { capsuleIntersect?: typeof bvh.capsuleIntersect }).capsuleIntersect?.(
        this.capsule,
        _capsuleHit
      );

      if (!hit || hit.depth <= EPSILON) {
        return true;
      }

      _pushOut.copy(_capsuleHit.normal).multiplyScalar(hit.depth + EPSILON);
      this.capsule.translate(_pushOut);

      const normalComponent = _remaining.dot(_capsuleHit.normal);
      if (normalComponent >= 0) {
        _remaining.set(0, 0, 0);
      } else {
        _remaining.addScaledVector(_capsuleHit.normal, -normalComponent);
      }

      const velocityNormal = this.velocity.dot(_capsuleHit.normal);
      if (velocityNormal < 0) {
        this.velocity.addScaledVector(_capsuleHit.normal, -velocityNormal);
      }

      if (_capsuleHit.normal.y > 0.5) {
        this.onGround = true;
      }

      if (_remaining.lengthSq() <= EPSILON) {
        return true;
      }
    }

    if (allowRetry && _remaining.lengthSq() > EPSILON) {
      _remaining.set(0, 0, 0);
      return true;
    }

    return false;
  }

  private hasHorizontalMovement(delta: THREE.Vector3) {
    if (!delta) {
      return false;
    }
    return Math.abs(delta.x) > EPSILON || Math.abs(delta.z) > EPSILON;
  }

  private getCapsuleCenter(target: THREE.Vector3) {
    target.copy(this.capsule.start).add(this.capsule.end).multiplyScalar(0.5);
    return target;
  }

  private sanitizeCapsule() {
    sanitizeVec3(this.capsule.start, this.safePosition);
    sanitizeVec3(this.capsule.end, this.safePosition);
    sanitizeVec3(this.velocity, _zeroVector);
  }

  private syncAttachedObject() {
    if (!this.attachedObject?.position) {
      return;
    }

    const center = this.getCapsuleCenter(_capsuleCenter);
    sanitizeVec3(center, this.safePosition);
    this.attachedObject.position.copy(center);
    sanitizeVec3(this.attachedObject.position, this.safePosition);
  }

  private updateCameraPosition() {
    const center = this.getCapsuleCenter(_capsuleCenter);
    this.camera.position.copy(center).add(this.headOffset);
    sanitizeVec3(this.camera.position, this.safePosition);
  }

  private handleFlightToggle(input: CharacterInput) {
    if (!this.flightEnabled) {
      return;
    }

    const toggleDown = Boolean(input?.flyToggle);
    if (toggleDown && !this.flightToggleDown) {
      if (this._isFlying) {
        this.setFlyingActive(false);
      } else {
        this.setFlyingActive(true);
      }
    }
    this.flightToggleDown = toggleDown;
  }

  public setFlyingActive(active: boolean) {
    if (!this.flightEnabled) {
      return;
    }

    const desired = Boolean(active);
    if (desired === this._isFlying) {
      return;
    }

    this._isFlying = desired;
    this.graceFramesRemaining = desired ? this.flightGraceFrames : 0;

    if (desired) {
      this.velocity.y = 0;
      const nudge = this.flightNudgeUp;
      if (nudge > 0) {
        _movement.set(0, nudge, 0);
        this.capsule.translate(_movement);
      }
      this.onGround = false;
    } else {
      this.velocity.y = -this.flightExitHover;
      this.onGround = false;
    }

    this.sanitizeCapsule();
    if (this.autoUpdateCamera) {
      this.updateCameraPosition();
    }
    this.syncAttachedObject();
  }

  public toggleFlight() {
    this.setFlyingActive(!this._isFlying);
  }

  public isFlying() {
    return this._isFlying;
  }

  public isRunning() {
    return this._isRunning;
  }

  public attach(object: THREE.Object3D | null) {
    this.attachedObject = object ?? null;
    if (this.attachedObject?.position) {
      this.attachedObject.position.copy(this.position);
      sanitizeVec3(this.attachedObject.position, this.safePosition);
    }
  }

  public setPosition(position: THREE.Vector3) {
    if (!position) {
      return;
    }

    _capsuleCenter.copy(position);
    sanitizeVec3(_capsuleCenter, this.safePosition);
    this.capsule.start.copy(_capsuleCenter).sub(this._halfSegment);
    this.capsule.end.copy(_capsuleCenter).add(this._halfSegment);
    this.sanitizeCapsule();
    if (this.autoUpdateCamera) {
      this.updateCameraPosition();
    }
    this.syncAttachedObject();
  }
}

export default CharacterController;
