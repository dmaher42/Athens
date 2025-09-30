import * as THREE from 'three';

export type SkyResource = {
  path: string;
  url: string;
  texture: THREE.Texture;
  envMap: THREE.Texture | null;
  envTarget: THREE.WebGLRenderTarget | null;
};

let activeRenderer: THREE.WebGLRenderer | null = null;
let textureLoader: THREE.TextureLoader | null = null;
let pmremGenerator: THREE.PMREMGenerator | null = null;
let lastResource: SkyResource | null = null;

const loadedResources = new Map<string, SkyResource>();
const loadTasks = new Map<string, Promise<SkyResource>>();

function ensureLoader() {
  if (!textureLoader) {
    textureLoader = new THREE.TextureLoader();
  }
  return textureLoader;
}

function disposePmremGenerator() {
  if (pmremGenerator) {
    pmremGenerator.dispose();
    pmremGenerator = null;
  }
}

function ensurePmremGenerator() {
  if (!activeRenderer) {
    return null;
  }
  if (!pmremGenerator) {
    pmremGenerator = new THREE.PMREMGenerator(activeRenderer);
    pmremGenerator.compileEquirectangularShader();
  }
  return pmremGenerator;
}

function ensureRendererColorSpace() {
  if (!activeRenderer) {
    return;
  }
  const renderer = activeRenderer as THREE.WebGLRenderer & { outputColorSpace?: string; outputEncoding?: number };
  const srgb = (THREE as any).SRGBColorSpace;
  if (srgb && typeof renderer.outputColorSpace !== 'undefined') {
    renderer.outputColorSpace = srgb;
  } else if (typeof renderer.outputEncoding !== 'undefined' && (THREE as any).sRGBEncoding) {
    renderer.outputEncoding = (THREE as any).sRGBEncoding;
  }
}

function setTextureColorSpace(texture: THREE.Texture) {
  const srgb = (THREE as any).SRGBColorSpace;
  if (srgb && typeof (texture as any).colorSpace !== 'undefined') {
    (texture as any).colorSpace = srgb;
  } else if (typeof (texture as any).encoding !== 'undefined' && (THREE as any).sRGBEncoding) {
    (texture as any).encoding = (THREE as any).sRGBEncoding;
  }
}

function resolveUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }
  const trimmed = `${path}`.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const sanitized = trimmed.replace(/^\/+/, '');
  if (typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI) {
    try {
      return new URL(sanitized, document.baseURI).toString();
    } catch (_) {
      // ignored
    }
  }
  const baseFromImport = (import.meta as any)?.env?.BASE_URL;
  if (typeof baseFromImport === 'string' && baseFromImport.length > 0) {
    const normalized = baseFromImport.endsWith('/') ? baseFromImport : `${baseFromImport}/`;
    return `${normalized}${sanitized}`.replace(/^\/+/, '');
  }
  if (typeof window !== 'undefined' && typeof window.location === 'object') {
    try {
      return new URL(sanitized, window.location.href).toString();
    } catch (_) {
      // ignored
    }
  }
  return sanitized;
}

async function loadResource(path: string) {
  const normalizedPath = `${path}`.trim();
  if (loadedResources.has(normalizedPath)) {
    return loadedResources.get(normalizedPath)!;
  }
  if (loadTasks.has(normalizedPath)) {
    return loadTasks.get(normalizedPath)!;
  }

  const url = resolveUrl(normalizedPath);
  if (!url) {
    throw new Error(`SkyManager: Unable to resolve URL for path "${path}".`);
  }

  const loader = ensureLoader();
  const pmrem = ensurePmremGenerator();

  const task = new Promise<SkyResource>((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          setTextureColorSpace(texture);
          texture.needsUpdate = true;

          let envTarget: THREE.WebGLRenderTarget | null = null;
          let envMap: THREE.Texture | null = null;
          if (pmrem) {
            envTarget = pmrem.fromEquirectangular(texture);
            envMap = envTarget.texture;
          }

          const resource: SkyResource = {
            path: normalizedPath,
            url,
            texture,
            envMap,
            envTarget
          };
          loadedResources.set(normalizedPath, resource);
          resolve(resource);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        reject(error ?? new Error(`SkyManager: Failed to load texture at ${url}`));
      }
    );
  }).finally(() => {
    loadTasks.delete(normalizedPath);
  });

  loadTasks.set(normalizedPath, task);
  return task;
}

function applyResource(scene: THREE.Scene, resource: SkyResource) {
  if (!scene || !resource) {
    return;
  }
  scene.background = resource.texture;
  scene.environment = resource.envMap ?? null;
}

export function initSky(renderer: THREE.WebGLRenderer | null | undefined) {
  if (!renderer) {
    return;
  }
  if (activeRenderer && renderer !== activeRenderer) {
    disposePmremGenerator();
  }
  activeRenderer = renderer;
  ensureRendererColorSpace();
  ensurePmremGenerator();
}

export async function setSky(scene: THREE.Scene | null | undefined, path: string) {
  if (!scene) {
    return null;
  }
  if (!path) {
    return null;
  }
  if (!activeRenderer) {
    throw new Error('SkyManager: initSky(renderer) must be called before setSky().');
  }
  const resource = await loadResource(path);
  applyResource(scene, resource);
  lastResource = resource;
  return resource;
}

export function reapplySky(scene: THREE.Scene | null | undefined) {
  if (!scene || !lastResource) {
    return null;
  }
  applyResource(scene, lastResource);
  return lastResource;
}
