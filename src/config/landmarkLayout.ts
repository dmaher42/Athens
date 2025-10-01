import * as THREE from 'three';

export type LandmarkHeightMode = number | 'ground' | 'acropolis';

export interface LandmarkPositionSpec {
  x?: number;
  y?: LandmarkHeightMode;
  z?: number;
}

export type LandmarkLayoutPreset = Record<string, LandmarkPositionSpec>;

export const LANDMARK_ALIASES: Record<string, string[]> = {
  Agora: ['Agora', 'AgoraGroup'],
  Stoa_of_Attalos: ['Stoa_of_Attalos', 'Stoa', 'StoaAttalos'],
  Tholos: ['Tholos'],
  Theater_of_Dionysus: ['Theater_of_Dionysus', 'Theatre_of_Dionysus', 'Theater', 'Theatre'],
  Stadium: ['Stadium', 'Stadion'],
  CityGate_South: ['CityGate_South', 'CityGate', 'SouthGate', 'Gate_South'],
  Port_Quay_A: ['Port_Quay_A', 'Port', 'Harbor', 'Harbour', 'Quay']
};

export const LANDMARK_LAYOUTS: Record<string, LandmarkLayoutPreset> = {
  athensPlan: {
    Agora: { x: -40, y: 'ground', z: 30 },
    Stoa_of_Attalos: { x: -20, y: 'ground', z: 20 },
    Tholos: { x: -48, y: 'ground', z: 18 },
    Theater_of_Dionysus: { x: 35, y: 'ground', z: 15 },
    Stadium: { x: 80, y: 'ground', z: 10 },
    CityGate_South: { x: 10, y: 'ground', z: 110 },
    Port_Quay_A: { x: 10, y: 'ground', z: 160 },
    Houses_NW: { x: -90, y: 'ground', z: -60 },
    Houses_NE: { x: 40, y: 'ground', z: -80 },
    Temple_of_Hephaestus: { x: -60, y: 'ground', z: 45 },
    Parthenon: { x: 6, y: 'acropolis', z: -4 }
  }
};

const STATIC_LANDMARK_KEYS = new Set<string>([
  ...Object.keys(LANDMARK_ALIASES),
  ...Object.values(LANDMARK_LAYOUTS).flatMap((preset) => Object.keys(preset))
]);

export const KNOWN_LANDMARK_KEYS: readonly string[] = Object.freeze(Array.from(STATIC_LANDMARK_KEYS));

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeOverride(override: unknown): LandmarkPositionSpec | null {
  if (override == null) {
    return null;
  }

  if (override instanceof THREE.Vector3 || (override && (override as THREE.Vector3).isVector3)) {
    const vec = override as THREE.Vector3;
    return { x: vec.x, y: vec.y, z: vec.z };
  }

  if (Array.isArray(override)) {
    const [x, y, z] = override;
    const result: LandmarkPositionSpec = {};
    const nx = toFiniteNumber(x);
    if (nx !== undefined) result.x = nx;
    if (y === 'ground' || y === 'acropolis') {
      result.y = y;
    } else {
      const ny = toFiniteNumber(y);
      if (ny !== undefined) result.y = ny;
    }
    const nz = toFiniteNumber(z);
    if (nz !== undefined) result.z = nz;
    return Object.keys(result).length ? result : null;
  }

  if (typeof override === 'number' && Number.isFinite(override)) {
    return { y: override };
  }

  if (typeof override === 'object') {
    const result: LandmarkPositionSpec = {};
    const source = override as Record<string, unknown>;

    if ('x' in source) {
      const nx = toFiniteNumber(source.x);
      if (nx !== undefined) {
        result.x = nx;
      }
    }

    if ('y' in source) {
      const raw = source.y;
      if (raw === 'ground' || raw === 'acropolis') {
        result.y = raw;
      } else {
        const ny = toFiniteNumber(raw);
        if (ny !== undefined) {
          result.y = ny;
        }
      }
    }

    if ('z' in source) {
      const nz = toFiniteNumber(source.z);
      if (nz !== undefined) {
        result.z = nz;
      }
    }

    return Object.keys(result).length ? result : null;
  }

  return null;
}

function mergeSpec(base: LandmarkPositionSpec, override: unknown): LandmarkPositionSpec {
  const normalized = normalizeOverride(override);
  if (!normalized) {
    return { ...base };
  }
  const next: LandmarkPositionSpec = { ...base };
  if (normalized.x !== undefined) next.x = normalized.x;
  if (normalized.y !== undefined) next.y = normalized.y;
  if (normalized.z !== undefined) next.z = normalized.z;
  return next;
}

function resolveSpec(
  spec: LandmarkPositionSpec,
  fallback: THREE.Vector3,
  {
    sampleGround,
    plateauHeight
  }: {
    sampleGround?: GroundSampler | null;
    plateauHeight?: number | null | undefined;
  }
): { position: THREE.Vector3; snapToGround: boolean } {
  const x = toFiniteNumber(spec.x) ?? fallback.x;
  const z = toFiniteNumber(spec.z) ?? fallback.z;

  let snapToGround = false;
  let desiredY: LandmarkHeightMode | undefined = spec.y;

  if (desiredY === 'ground') {
    const sampled = sampleGround ? sampleGround(x, z, fallback.y) : undefined;
    const finalY = toFiniteNumber(sampled) ?? fallback.y;
    return {
      position: new THREE.Vector3(x, finalY, z),
      snapToGround: true
    };
  }

  if (desiredY === 'acropolis') {
    const plateau = toFiniteNumber(plateauHeight);
    const finalY = plateau ?? fallback.y;
    return {
      position: new THREE.Vector3(x, finalY, z),
      snapToGround: false
    };
  }

  const numericY = toFiniteNumber(desiredY);
  const finalY = numericY ?? fallback.y;

  return {
    position: new THREE.Vector3(x, finalY, z),
    snapToGround
  };
}

export type GroundSampler = (x: number, z: number, fallbackY: number) => number | null | undefined;

export interface LandmarkLayoutResolverOptions {
  layout?: string | null;
  layoutConfig?: Record<string, unknown> | null;
  plateauHeight?: number | null | undefined;
  sampleGround?: GroundSampler | null;
}

export interface LandmarkResolution {
  position: THREE.Vector3;
  snapToGround: boolean;
  layoutUsed: boolean;
  overrideUsed: boolean;
}

export type LandmarkLayoutResolver = (
  key: string,
  fallback?: THREE.Vector3 | { x?: number; y?: number; z?: number } | null
) => LandmarkResolution;

export function createLandmarkLayoutResolver(options: LandmarkLayoutResolverOptions = {}): LandmarkLayoutResolver {
  const layoutKey = typeof options.layout === 'string' && options.layout ? options.layout : 'classic';
  const layoutPreset = LANDMARK_LAYOUTS[layoutKey] ?? null;
  const layoutConfig = options.layoutConfig && typeof options.layoutConfig === 'object' ? options.layoutConfig : {};
  const positionOverrides =
    layoutConfig && typeof layoutConfig === 'object' && layoutConfig.positions && typeof (layoutConfig as any).positions === 'object'
      ? (layoutConfig as { positions: Record<string, unknown> }).positions
      : null;

  return (key, fallback) => {
    const fallbackVec = fallback instanceof THREE.Vector3
      ? fallback.clone()
      : new THREE.Vector3(
          toFiniteNumber((fallback as any)?.x) ?? 0,
          toFiniteNumber((fallback as any)?.y) ?? 0,
          toFiniteNumber((fallback as any)?.z) ?? 0
        );

    let spec: LandmarkPositionSpec = { x: fallbackVec.x, y: fallbackVec.y, z: fallbackVec.z };
    let layoutUsed = false;
    let overrideUsed = false;

    if (layoutPreset && layoutPreset[key]) {
      spec = mergeSpec(spec, layoutPreset[key]);
      layoutUsed = true;
    }

    if (layoutConfig && Object.prototype.hasOwnProperty.call(layoutConfig, key)) {
      const direct = (layoutConfig as Record<string, unknown>)[key];
      spec = mergeSpec(spec, direct);
      overrideUsed = true;
    }

    if (positionOverrides && Object.prototype.hasOwnProperty.call(positionOverrides, key)) {
      const override = positionOverrides[key];
      spec = mergeSpec(spec, override);
      overrideUsed = true;
    }

    const resolved = resolveSpec(spec, fallbackVec, {
      sampleGround: options.sampleGround,
      plateauHeight: options.plateauHeight
    });

    return {
      ...resolved,
      layoutUsed,
      overrideUsed
    };
  };
}

export function getLandmarkKeysForLayout(layout?: string | null): string[] {
  const layoutKey = typeof layout === 'string' && layout ? layout : 'classic';
  const preset = LANDMARK_LAYOUTS[layoutKey];
  if (!preset) {
    return [];
  }
  return Object.keys(preset);
}
