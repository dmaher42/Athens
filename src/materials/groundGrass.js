import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.ts';
import { logger } from '../utils/logger.ts';

const FALLBACK_COLOR = 0x5a8f3a;
const GRASS_URL = assetUrl('assets/textures/grass.jpg');
const textureLoader = new THREE.TextureLoader();
let cachedPromise = null;

function ensureColorSpace(texture) {
  if (!texture) {
    return;
  }
  if ('colorSpace' in texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in texture) {
    texture.encoding = THREE.sRGBEncoding;
  }
}

function computeAnisotropy(renderer) {
  try {
    if (renderer?.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
      return renderer.capabilities.getMaxAnisotropy() || 1;
    }
  } catch (error) {
    logger.warn('[groundGrass] Failed to determine renderer anisotropy.', error);
  }
  return 1;
}

async function loadGrassTexture() {
  if (cachedPromise) {
    return cachedPromise;
  }
  const url = GRASS_URL;
  cachedPromise = new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        try {
          ensureColorSpace(texture);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.needsUpdate = true;
          resolve(texture);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  }).catch((error) => {
    logger.warn('[groundGrass] Failed to load grass texture.', error);
    return null;
  });
  return cachedPromise;
}

export async function loadGrassMaterial(renderer, { repeat = 80 } = {}) {
  const anisotropy = computeAnisotropy(renderer);
  const texture = await loadGrassTexture();

  if (texture) {
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1.0,
      metalness: 0.0
    });
  }

  return new THREE.MeshStandardMaterial({ color: FALLBACK_COLOR, roughness: 1.0, metalness: 0.0 });
}
