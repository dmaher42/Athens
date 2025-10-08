import * as THREE from 'three';

export interface Disposable {
  dispose(): void;
}

type DisposableItem =
  | THREE.Object3D
  | THREE.Material
  | THREE.Texture
  | THREE.BufferGeometry
  | Disposable
  | null
  | undefined
  | DisposableItem[];

const materialTextureProps = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'lightMap',
  'matcap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularMap',
  'specularIntensityMap',
  'thicknessMap',
  'transmissionMap'
] as const;

type SeenSet = Set<unknown>;

function disposeMaterial(material: THREE.Material, seen: SeenSet): void {
  if (seen.has(material)) return;
  seen.add(material);

  const uniforms = (material as { uniforms?: Record<string, any> }).uniforms;
  if (uniforms && typeof uniforms === 'object') {
    for (const uniform of Object.values(uniforms)) {
      const value = uniform && typeof uniform === 'object' ? uniform.value ?? uniform.texture : uniform;
      disposeUnknown(value, seen);
    }
  }

  for (const key of materialTextureProps) {
    const value = (material as any)[key];
    if (value) {
      disposeUnknown(value, seen);
      if ((material as any)[key] === value) {
        (material as any)[key] = null;
      }
    }
  }

  const keys = Object.keys(material as any);
  for (const key of keys) {
    const value = (material as any)[key];
    if (value && (value instanceof THREE.Texture || Array.isArray(value))) {
      disposeUnknown(value, seen);
    }
  }

  try {
    material.dispose();
  } catch (error) {
    // eslint-disable-next-line no-console
    if (import.meta.env.DEV) console.warn('[disposeAll] Failed to dispose material', material, error);
  }
}

function disposeObject3D(object: THREE.Object3D, seen: SeenSet): void {
  if (seen.has(object)) return;
  seen.add(object);

  object.traverse((child: any) => {
    if (!child) return;
    if (child.geometry) {
      disposeUnknown(child.geometry, seen);
    }
    if (child.material) {
      disposeUnknown(child.material, seen);
    }
    if (child instanceof THREE.Sprite && child.material) {
      disposeUnknown((child.material as any).map, seen);
    }
    if (typeof child.dispose === 'function' && child !== object) {
      disposeUnknown(child, seen);
    }
  });
}

function disposeUnknown(item: DisposableItem | any, seen: SeenSet): void {
  if (!item || seen.has(item)) {
    return;
  }

  if (Array.isArray(item)) {
    for (const value of item) {
      disposeUnknown(value, seen);
    }
    return;
  }

  if (item instanceof THREE.Object3D) {
    disposeObject3D(item, seen);
    return;
  }

  if (item instanceof THREE.Material) {
    disposeMaterial(item, seen);
    return;
  }

  if (item instanceof THREE.Texture || item instanceof THREE.CubeTexture) {
    seen.add(item);
    try {
      item.dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      if (import.meta.env.DEV) console.warn('[disposeAll] Failed to dispose texture', item, error);
    }
    return;
  }

  if (item instanceof THREE.BufferGeometry) {
    seen.add(item);
    try {
      item.dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      if (import.meta.env.DEV) console.warn('[disposeAll] Failed to dispose geometry', item, error);
    }
    return;
  }

  if (typeof item.dispose === 'function') {
    seen.add(item);
    try {
      item.dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      if (import.meta.env.DEV) console.warn('[disposeAll] Failed to dispose resource', item, error);
    }
    return;
  }

  seen.add(item);
}

export function disposeAll(
  ...items: (
    | THREE.Object3D
    | THREE.Material
    | THREE.Texture
    | THREE.BufferGeometry
    | Disposable
    | null
    | undefined
    | (THREE.Object3D | THREE.Material | THREE.Texture | THREE.BufferGeometry | Disposable | null | undefined)[]
  )[]
): void {
  if (!items.length) return;
  const seen: SeenSet = new Set();
  for (const item of items) {
    disposeUnknown(item, seen);
  }
}

