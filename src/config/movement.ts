export interface FlightConfig {
  toggleKey?: string;
  toggleKeys?: string[];
  horizontalSpeed?: number;
  verticalSpeed?: number;
  verticalAcceleration?: number;
  verticalMaxSpeed?: number;
  verticalDamping?: number;
  nudgeUp?: number;
  exitHover?: number;
  startGraceFrames?: number;
  ascendKeys?: string[];
  descendKeys?: string[];
}

export interface CameraFollowConfig {
  offset?: { x: number; y: number; z: number };
  lerp?: number;
  lookAtOffset?: { x: number; y: number; z: number };
}

export interface CameraSeedConfig {
  followDistance?: number;
  shoulderHeight?: number;
  pitchDeg?: number;
}

export interface MovementCameraConfig {
  follow?: CameraFollowConfig;
  seed?: CameraSeedConfig;
}

export interface CharacterScaleConfig {
  x?: number;
  y?: number;
  z?: number;
}

export interface CharacterConfig {
  /**
   * Character height in world units (meters) within the scene. When omitted, the
   * default height is multiplied by the configured {@link scale}.
   */
  height?: number;
  /**
   * Optional scalar or axis scale applied to the character model.
   */
  scale?: number | CharacterScaleConfig;
}

export interface MovementConfig {
  walkSpeed?: number;
  runMultiplier?: number;
  acceleration?: number;
  safePosition?: { x: number; y: number; z: number };
  flight?: FlightConfig;
  camera?: MovementCameraConfig;
  character?: CharacterConfig;
}

export const FLIGHT = {
  verticalSpeed: 6,
  horizontalSpeed: 8
} as const;

export const movementConfig: MovementConfig = {
  walkSpeed: 14,
  runMultiplier: 2,
  acceleration: 20,
  safePosition: { x: 0, y: 1, z: -230 },
  character: {
    height: 1.7,
    scale: 1
  },
  flight: {
    toggleKey: 'KeyX',
    toggleKeys: ['KeyX', 'KeyF'],
    horizontalSpeed: FLIGHT.horizontalSpeed,
    verticalSpeed: FLIGHT.verticalSpeed,
    verticalAcceleration: 20,
    verticalMaxSpeed: 12,
    verticalDamping: 8,
    nudgeUp: 0.25,
    exitHover: 0.06,
    startGraceFrames: 4,
    ascendKeys: ['Space', 'KeyE'],
    descendKeys: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyQ', 'KeyC']
  },
  camera: {
    follow: {
      offset: { x: 0, y: 2.2, z: -6 },
      lerp: 0.12,
      lookAtOffset: { x: 0, y: 1.5, z: 0 }
    },
    seed: {
      followDistance: 6,
      shoulderHeight: 1.6,
      pitchDeg: -15
    }
  }
};
