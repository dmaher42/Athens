import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Capsule as ExampleCapsule } from 'three/examples/jsm/math/Capsule.js';

import type { CollisionWorld } from '../physics/collisionWorld.ts';

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

const EPSILON = 1e-5;
const MAX_SWEEP_ITERATIONS = 5;

export interface CharacterInput {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
}

export interface CharacterControllerWorld extends CollisionWorld {}

export class CharacterController {
  public readonly capsule: InstanceType<typeof Capsule>;
  public readonly velocity = new THREE.Vector3();
  public onGround = false;
  public gravity = 9.8;
  public walkSpeed = 2.5;
  public sprintSpeed = 4.5;
  public jumpSpeed = 4.5;
  public damping = 0.12;
  public stepOffset = 0.3;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly headOffset = new THREE.Vector3(0, 0.2, 0);
  private readonly _position = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    start: THREE.Vector3,
    height = 1.7,
    radius = 0.35
  ) {
    this.camera = camera;
    const clampedHeight = Math.max(height, radius * 2 + EPSILON);

    const halfSegment = Math.max((clampedHeight - radius * 2) * 0.5, 0);
    const center = start.clone();
    const startLine = center.clone().addScaledVector(_up, -halfSegment);
    const endLine = center.clone().addScaledVector(_up, halfSegment);

    this.capsule = new Capsule(startLine, endLine, radius);
    this.headOffset.set(0, Math.max(0.2, clampedHeight * 0.5 - 0.1), 0);
    this.updateCameraPosition();
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

    this.resolveMovement(clampedDt, input);
    this.integratePhysics(clampedDt, input);

    _movement.copy(this.velocity).multiplyScalar(clampedDt);

    if (this.onGround && world?.bvh && this.hasHorizontalMovement(_movement)) {
      const attempted = this.attemptStep(_movement, world);
      if (!attempted) {
        this.sweepCapsule(_movement, world);
      }
    } else {
      this.sweepCapsule(_movement, world);
    }

    this.updateCameraPosition();
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

    const targetSpeed = sprint ? this.sprintSpeed : this.walkSpeed;
    _desiredVelocity.multiplyScalar(targetSpeed);

    _horizontalVelocity.set(this.velocity.x, 0, this.velocity.z);
    const lerpFactor = 1 - Math.exp(-this.damping * dt);
    _horizontalVelocity.lerp(_desiredVelocity, THREE.MathUtils.clamp(lerpFactor, 0, 1));

    this.velocity.x = _horizontalVelocity.x;
    this.velocity.z = _horizontalVelocity.z;
  }

  private integratePhysics(dt: number, input: CharacterInput) {
    const { jump = false } = input ?? {};
    this.velocity.y -= this.gravity * dt;
    if (this.onGround) {
      if (jump) {
        this.velocity.y = this.jumpSpeed;
        this.onGround = false;
      } else if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }
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

  private updateCameraPosition() {
    const center = this.getCapsuleCenter(_capsuleCenter);
    this.camera.position.copy(center).add(this.headOffset);
  }
}

export default CharacterController;
