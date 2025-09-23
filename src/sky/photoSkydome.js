// src/sky/photoSkydome.js
import THREE from '../three.js';

export async function createPhotoSkydome({
  scene,
  renderer,
  url = new URL('./milkyway.jpg', import.meta.url).href, // resolves /src/sky/milkyway.jpg
  sources = null,
  radius = 5000,
  initialYawDeg = 0
}) {
  const loader = new THREE.TextureLoader();
  const sourceList = Array.isArray(sources) && sources.length > 0
    ? sources
    : (url ? [{ url, label: 'default sky texture' }] : []);

  if (sourceList.length === 0) {
    throw new Error('No sky texture source provided for photo skydome.');
  }

  let chosenSource = null;
  let tex = null;
  let lastError = null;

  for (const source of sourceList) {
    try {
      tex = await loader.loadAsync(source.url);
      chosenSource = source;
      break;
    } catch (err) {
      lastError = err;
      const label = source.label ? ` ("${source.label}")` : '';
      console.warn(`PhotoSkydome: failed to load texture${label} from ${source.url}`, err);
    }
  }

  if (!tex) {
    throw lastError || new Error('Unable to load any photo skydome texture.');
  }
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
  dome.userData.skyTextureSource = chosenSource;
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
    texture: tex,
    source: chosenSource,
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
