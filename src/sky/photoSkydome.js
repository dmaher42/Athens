// src/sky/photoSkydome.js
import THREE from '../three.js';

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) => (source && typeof source.url === 'string' && source.url.length > 0 ? source : null))
    .filter(Boolean);
}

export async function loadPhotoSkyTexture({ sources, loader = new THREE.TextureLoader() } = {}) {
  const sourceList = normalizeSources(sources);

  if (sourceList.length === 0) {
    throw new Error('No sky texture source provided for photo skydome.');
  }

  let chosenSource = null;
  let texture = null;
  let lastError = null;

  for (const source of sourceList) {
    const label = source.label ? ` ("${source.label}")` : '';
    try {
      texture = await loader.loadAsync(source.url);
      if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
      else texture.encoding = THREE.sRGBEncoding;
      chosenSource = source;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`PhotoSkydome: failed to load texture${label} from ${source.url}`, err);
    }
  }

  if (!texture) {
    const error = lastError || new Error('Unable to load any photo skydome texture.');
    error.sources = sourceList.map((source) => source.url);
    throw error;
  }

  return { texture, source: chosenSource };
}

export async function createPhotoSkydome({
  scene,
  renderer,
  url = new URL('./milkyway.jpg', import.meta.url).href, // resolves /src/sky/milkyway.jpg
  sources = null,
  radius = 5000,
  initialYawDeg = 0
}) {
  const sourceList = Array.isArray(sources) && sources.length > 0
    ? sources
    : (url ? [{ url, label: 'default sky texture' }] : []);

  if (sourceList.length === 0) {
    throw new Error('No sky texture source provided for photo skydome.');
  }

  const loader = new THREE.TextureLoader();
  const { texture: initialTexture, source: initialSource } = await loadPhotoSkyTexture({
    sources: sourceList,
    loader
  });

  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: initialTexture,
    side: THREE.BackSide,     // view from inside
    transparent: true,
    opacity: 0.0,             // start hidden (day)
    depthWrite: false
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'PhotoSkydome';
  dome.renderOrder = -1000;   // draw behind world
  dome.rotation.y = THREE.MathUtils.degToRad(initialYawDeg);
  dome.userData.skyTextureSource = initialSource;
  scene.add(dome);

  let currentTexture = initialTexture;
  let currentSource = initialSource;

  // Optional environment map for subtle night reflections
  let env = null;

  const updateEnvironmentFromTexture = (texture) => {
    if (!renderer || !texture) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const { texture: envTexture } = pmrem.fromEquirectangular(texture);
    pmrem.dispose();
    if (env && typeof env.dispose === 'function') {
      env.dispose();
    }
    env = envTexture;
    if (dome.material.opacity > 0.6) {
      scene.environment = env;
    }
  };

  updateEnvironmentFromTexture(currentTexture);

  const setTexture = (texture, sourceInfo = null) => {
    if (!texture) {
      throw new Error('No texture provided for photo skydome.');
    }

    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    else texture.encoding = THREE.sRGBEncoding;

    if (dome.material.map !== texture) {
      dome.material.map = texture;
    }
    dome.material.needsUpdate = true;

    currentTexture = texture;
    if (sourceInfo) {
      currentSource = sourceInfo;
      dome.userData.skyTextureSource = sourceInfo;
    }

    updateEnvironmentFromTexture(texture);
  };

  const api = {
    mesh: dome,
    get texture() {
      return currentTexture;
    },
    get source() {
      return currentSource;
    },
    setAmount(a) {
      const t = THREE.MathUtils.clamp(a, 0, 1);
      dome.material.opacity = t;
      if (env) scene.environment = t > 0.6 ? env : null;
    },
    setYaw(deg) {
      dome.rotation.y = THREE.MathUtils.degToRad(deg);
    },
    setTexture
  };

  return api;
}
