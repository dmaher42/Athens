import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.js';

const TEXTURE_DEFINITIONS = {
  marble: {
    file: 'marble.jpg',
    fallback: 0xdedede,
    materialOptions: { roughness: 0.4, metalness: 0.0 }
  },
  roof: {
    file: 'roof_tiles.jpg',
    fallback: 0x8a3a2a,
    materialOptions: { roughness: 0.6, metalness: 0.05 }
  },
  grass: {
    file: 'grass.jpg',
    fallback: 0x5a8f3a,
    materialOptions: { roughness: 1.0, metalness: 0.0 }
  },
  dust: {
    file: 'athens_dust.jpg',
    fallback: 0xb89c7a,
    materialOptions: { roughness: 1.0, metalness: 0.0 }
  },
  citywall: {
    file: 'city_wall.jpg',
    fallback: 0x8d8d8d,
    materialOptions: { roughness: 0.9, metalness: 0.05 }
  },
  road: {
    file: 'road_texture.jpg',
    fallback: 0x59524a,
    materialOptions: { roughness: 0.95, metalness: 0.02 }
  }
};

let cachedMaterials = null;

function loadTexture(loader, url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        resolve(texture);
      },
      undefined,
      () => {
        resolve(null);
      }
    );
  });
}

function applyTextureDefaults(texture, anisotropy) {
  if (!texture) {
    return;
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if ('colorSpace' in texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in texture) {
    texture.encoding = THREE.sRGBEncoding;
  }
  texture.needsUpdate = true;
}

function createMaterial(texture, fallbackColor, options = {}) {
  const materialOptions = { ...options };
  if (texture) {
    materialOptions.map = texture;
  } else {
    materialOptions.color = fallbackColor;
  }
  return new THREE.MeshStandardMaterial(materialOptions);
}

export async function loadMaterials(renderer) {
  if (cachedMaterials) {
    return cachedMaterials;
  }

  const loader = new THREE.TextureLoader();
  const anisotropy = (
    renderer?.capabilities?.getMaxAnisotropy?.() ??
    renderer?.capabilities?.maxAnisotropy ??
    1
  );

  const entries = Object.entries(TEXTURE_DEFINITIONS);
  const textures = await Promise.all(
    entries.map(([key, def]) => {
      const url = assetUrl(`assets/textures/${def.file}`);
      return loadTexture(loader, url).then((texture) => {
        applyTextureDefaults(texture, anisotropy);
        return [key, texture];
      });
    })
  );

  const materials = {};
  for (const [key, def] of entries) {
    const texture = textures.find(([textureKey]) => textureKey === key)?.[1] || null;
    materials[key] = createMaterial(texture, def.fallback, def.materialOptions);
  }

  cachedMaterials = materials;
  return materials;
}
