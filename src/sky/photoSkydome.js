// src/sky/photoSkydome.js
import * as THREE from 'three';

export async function createPhotoSkydome({
  scene,
  renderer,
  url = new URL('./milkyway.jpg', import.meta.url).href, // resolves /src/sky/milkyway.jpg
  radius = 5000,
  initialYawDeg = 0
}) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  // three r150+: colorSpace; older three: encoding fallback
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;

  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,     // view from inside
    transparent: true,
    opacity: 0.0,             // start hidden (day)
    depthWrite: false
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'PhotoSkydome';
  dome.renderOrder = -1000;   // draw behind world
  dome.rotation.y = THREE.MathUtils.degToRad(initialYawDeg);
  scene.add(dome);

  // Optional environment map for subtle night reflections
  let env = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
  }

  return {
    mesh: dome,
    setAmount(a) {
      const t = THREE.MathUtils.clamp(a, 0, 1);
      dome.material.opacity = t;
      if (env) scene.environment = t > 0.6 ? env : null;
    },
    setYaw(deg) {
      dome.rotation.y = THREE.MathUtils.degToRad(deg);
    }
  };
}
