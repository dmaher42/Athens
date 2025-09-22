import * as THREE from 'three';

export async function createPhotoSkydome({ scene, renderer, url = '/assets/textures/milkyway.jpg', radius = 5000, initialYawDeg = 0 }) {
  // Load texture
  const tex = await new THREE.TextureLoader().loadAsync(url);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;

  // Big inside-out sphere
  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.0,        // start hidden (day)
    depthWrite: false
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'PhotoSkydome';
  dome.renderOrder = -1000; // behind everything
  dome.rotation.y = THREE.MathUtils.degToRad(initialYawDeg);
  scene.add(dome);

  // Optional: env map for nicer PBR at night (precompute once)
  let envTex = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
  }

  const api = {
    mesh: dome,
    setAmount(a) {
      const t = THREE.MathUtils.clamp(a, 0, 1);
      dome.material.opacity = t;
      // only use environment when it's mostly night
      if (envTex) scene.environment = t > 0.6 ? envTex : null;
    },
    setYaw(deg) {
      dome.rotation.y = THREE.MathUtils.degToRad(deg);
    }
  };
  return api;
}
