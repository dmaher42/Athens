import * as THREE from 'three';

const DEFAULT_TEXTURE_FALLBACK_COLOR = 0x999999;
const DEFAULT_MODEL_FALLBACK_COLOR = 0xff4477;

function toColorInstance(color) {
  if (color instanceof THREE.Color) {
    return color;
  }
  return new THREE.Color(color ?? DEFAULT_TEXTURE_FALLBACK_COLOR);
}

function ensureColorSpace(texture) {
  if (!texture) return;
  if ('colorSpace' in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in texture && THREE.sRGBEncoding) {
    texture.encoding = THREE.sRGBEncoding;
  }
}

function createFallbackImageData(color) {
  const c = toColorInstance(color);
  const data = new Uint8Array([
    Math.round(THREE.MathUtils.clamp(c.r, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(c.g, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(c.b, 0, 1) * 255),
    255
  ]);
  return { data, width: 1, height: 1 };
}

function createSolidColorTexture({ color = DEFAULT_TEXTURE_FALLBACK_COLOR, name } = {}) {
  const image = createFallbackImageData(color);
  const texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
  texture.name = name ?? 'FallbackTexture';
  ensureColorSpace(texture);
  texture.needsUpdate = true;
  texture.userData = {
    ...(texture.userData || {}),
    isFallbackTexture: true
  };
  return texture;
}

/**
 * Three.js texture internals (id/uuid/version) are immutable, so we swap the
 * fallback map with the real texture instead of mutating the DataTexture.
 * This avoids writing to read-only fields when the loader resolves.
 */
export function applyLoadedTexture(
  material,
  mapKey,
  loadedTex,
  fallbackTex,
  threeInstance = THREE
) {
  if (!material || !mapKey || !loadedTex) return;

  const THREERef = threeInstance || THREE;
  loadedTex.wrapS = loadedTex.wrapT = THREERef.RepeatWrapping;
  if (THREERef && 'SRGBColorSpace' in THREERef) {
    loadedTex.colorSpace = THREERef.SRGBColorSpace;
  }
  loadedTex.needsUpdate = true;

  material[mapKey] = loadedTex;

  if (fallbackTex && fallbackTex !== loadedTex) {
    try {
      fallbackTex.dispose?.();
    } catch (error) {
      if (
        typeof process !== 'undefined' &&
        process?.env?.NODE_ENV !== 'production' &&
        typeof console !== 'undefined' &&
        typeof console.debug === 'function'
      ) {
        console.debug('[asset-loader] dispose fallback failed', error);
      }
    }
  }
}

function formatHex(color) {
  return toColorInstance(color).getHexString();
}

export function loadTextureWithFallback(url, options = {}) {
  const {
    loader = new THREE.TextureLoader(),
    fallbackColor = DEFAULT_TEXTURE_FALLBACK_COLOR,
    label = 'texture',
    name = undefined,
    onLoad = undefined,
    onFallback = undefined
  } = options;

  const texture = createSolidColorTexture({
    color: fallbackColor,
    name: name ?? `${label}::fallback`
  });

  texture.userData = {
    ...(texture.userData || {}),
    sourceUrl: url ?? null,
    isFallbackTexture: true
  };

  const notifyFallback = (error) => {
    if (typeof onFallback === 'function') {
      try {
        onFallback(texture, error ?? null);
      } catch (callbackError) {
        console.warn('[asset-loader] onFallback callback threw an error.', callbackError);
      }
    }
    if (typeof onLoad === 'function') {
      try {
        onLoad(texture, {
          fallback: true,
          url,
          error: error ?? null,
          fallbackTexture: texture
        });
      } catch (callbackError) {
        console.warn('[asset-loader] onLoad callback threw an error.', callbackError);
      }
    }
  };

  if (!url) {
    console.warn(
      `[asset-loader] ${label} 404/failed: ${url ?? '<missing>'}; using fallback #${formatHex(
        fallbackColor
      )}`
    );
    notifyFallback(new Error('Missing texture URL.'));
    return texture;
  }

  loader.load(
    url,
    (loaded) => {
      try {
        ensureColorSpace(loaded);
        loaded.userData = {
          ...(loaded.userData || {}),
          sourceUrl: url,
          isFallbackTexture: false
        };
        if (typeof onLoad === 'function') {
          onLoad(loaded, {
            fallback: false,
            url,
            source: loaded,
            fallbackTexture: texture
          });
        }
        if (
          typeof process !== 'undefined' &&
          process?.env?.NODE_ENV !== 'production' &&
          typeof console !== 'undefined' &&
          typeof console.debug === 'function'
        ) {
          console.debug(`[asset-loader] applied texture ${label}`);
        }
      } catch (error) {
        console.warn(
          `[asset-loader] Texture post-processing failed for ${label} at ${url}; retaining fallback.`,
          error
        );
        texture.userData.isFallbackTexture = true;
        notifyFallback(error);
      }
    },
    undefined,
    (error) => {
      texture.userData = {
        ...(texture.userData || {}),
        sourceUrl: url,
        isFallbackTexture: true
      };
      console.warn(
        `[asset-loader] ${label} 404/failed: ${url}; using fallback #${formatHex(fallbackColor)}`
      );
      notifyFallback(error);
    }
  );

  return texture;
}

export async function loadTextureAsyncWithFallback(url, options = {}) {
  const {
    loader = new THREE.TextureLoader(),
    fallbackColor = DEFAULT_TEXTURE_FALLBACK_COLOR,
    label = 'texture'
  } = options;

  if (!url) {
    console.warn(
      `[asset-loader] ${label} 404/failed: ${url ?? '<missing>'}; using fallback #${formatHex(
        fallbackColor
      )}`
    );
    return createSolidColorTexture({ color: fallbackColor, name: `${label}::fallback` });
  }

  try {
    const texture = await loader.loadAsync(url);
    texture.userData = {
      ...(texture.userData || {}),
      sourceUrl: url,
      isFallbackTexture: false
    };
    ensureColorSpace(texture);
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    console.warn(
      `[asset-loader] ${label} 404/failed: ${url}; using fallback #${formatHex(fallbackColor)}`
    );
    const fallback = createSolidColorTexture({ color: fallbackColor, name: `${label}::fallback` });
    fallback.userData.sourceUrl = url;
    return fallback;
  }
}

function createFallbackMesh({ color = DEFAULT_MODEL_FALLBACK_COLOR, size = 1, label = 'asset' } = {}) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.1,
    emissiveIntensity: 0
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${label}::fallback-mesh`;
  mesh.userData = {
    ...(mesh.userData || {}),
    isFallbackAsset: true
  };
  return mesh;
}

function createFallbackGltf({ color, label } = {}) {
  const mesh = createFallbackMesh({ color, label });
  const group = new THREE.Group();
  group.name = label ? `${label} (missing asset)` : 'MissingAsset';
  group.add(mesh);
  group.userData = {
    ...(group.userData || {}),
    isFallbackAsset: true
  };
  return {
    scene: group,
    scenes: [group],
    animations: [],
    parser: null,
    userData: {
      isFallbackAsset: true
    }
  };
}

export async function loadGltfWithFallback(loader, url, options = {}) {
  const { label = 'model', fallbackColor = DEFAULT_MODEL_FALLBACK_COLOR } = options;
  if (!loader || typeof loader.loadAsync !== 'function') {
    throw new Error('loadGltfWithFallback requires a loader that supports loadAsync.');
  }

  if (!url) {
    console.warn(
      `[asset-loader] Missing URL for ${label}; substituting fallback primitive #${formatHex(
        fallbackColor
      )}.`
    );
    return createFallbackGltf({ color: fallbackColor, label });
  }

  try {
    const gltf = await loader.loadAsync(url);
    gltf.userData = {
      ...(gltf.userData || {}),
      sourceUrl: url,
      isFallbackAsset: false
    };
    if (gltf.scene) {
      gltf.scene.userData = {
        ...(gltf.scene.userData || {}),
        sourceUrl: url,
        isFallbackAsset: false
      };
    }
    return gltf;
  } catch (error) {
    console.warn(
      `[asset-loader] Failed to load ${label} at ${url}; substituting fallback primitive #${formatHex(
        fallbackColor
      )}.`,
      error
    );
    const fallback = createFallbackGltf({ color: fallbackColor, label });
    fallback.userData.sourceUrl = url;
    return fallback;
  }
}

export {
  DEFAULT_TEXTURE_FALLBACK_COLOR,
  DEFAULT_MODEL_FALLBACK_COLOR,
  createSolidColorTexture,
  ensureColorSpace,
  applyLoadedTexture
};
