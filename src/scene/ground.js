import * as THREE from 'three';

function configureBaseTexture(texture, repeats) {
  if (!texture) return;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

function configureOverlayTexture(texture, repeats) {
  if (!texture) return;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.anisotropy = Math.max(texture.anisotropy || 0, 8);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
}

export function createGroundPlane({ size = 8000, repeats = 80, textures = {} } = {}) {
  const loader = new THREE.TextureLoader();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb7b09a,
    roughness: 1.0,
    metalness: 0.0,
    transparent: false
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  const { base: baseTexture, overlay: overlayTexture } = textures;

  const applyBaseTexture = (texture) => {
    if (!texture) {
      return;
    }
    configureBaseTexture(texture, repeats);
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  };

  const applyOverlayTexture = (texture) => {
    if (!texture) {
      return;
    }
    configureOverlayTexture(texture, repeats);
    material.alphaMap = texture;
    material.transparent = true;
    material.needsUpdate = true;
  };

  if (baseTexture) {
    applyBaseTexture(baseTexture);
  } else {
    loader.load(
      'assets/textures/grass.jpg',
      (texture) => {
        applyBaseTexture(texture);
      },
      undefined,
      (error) => {
        console.warn('[ground] grass.jpg not found; using flat color.', error);
      }
    );
  }

  if (overlayTexture) {
    applyOverlayTexture(overlayTexture);
  } else {
    loader.load(
      'assets/textures/athens_dust.jpg',
      (texture) => {
        applyOverlayTexture(texture);
      },
      undefined,
      (error) => {
        console.warn('[ground] athens_dust.jpg not found; alpha blend disabled.', error);
      }
    );
  }

  return mesh;
}
