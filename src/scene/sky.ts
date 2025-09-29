import * as THREE from 'three';

export type SkyChoice = {
  id: string;
  type: 'cube' | 'equirect';
  label: string;
  dir?: string;
  faces?: { px: string; nx: string; py: string; ny: string; pz: string; nz: string };
  file?: string;
};

// Auto-discovered JPG panoramas available in this repo (scanned under public/assets/sky).
// These provide ready-to-use photographic skies when served from GitHub Pages or local builds.
export const SKY_CHOICES: SkyChoice[] = [
  {
    id: 'night-sky',
    type: 'equirect',
    label: 'Night Sky',
    file: 'assets/sky/night_sky.jpg'
  },
  {
    id: 'high-noon',
    type: 'equirect',
    label: 'High Noon',
    file: 'assets/sky/high_noon.jpg'
  },
  {
    id: 'golden-hour',
    type: 'equirect',
    label: 'Golden Hour',
    file: 'assets/sky/golden_hour.jpg'
  }
];

function setTextureColorSpace(texture: THREE.Texture | THREE.CubeTexture) {
  if ('colorSpace' in texture) {
    (texture as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  } else {
    (texture as THREE.Texture).encoding = THREE.sRGBEncoding;
  }
}

function baseURL(rel: string) {
  if (/^https?:\/\//.test(rel)) {
    return rel;
  }
  if (typeof window === 'undefined') {
    return rel;
  }
  const baseHref = typeof document !== 'undefined' ? document.querySelector('base')?.getAttribute('href') : null;
  const root = baseHref || window.location.pathname.replace(/[^/]*$/, '');
  return new URL(rel, window.location.origin + root).toString();
}

export async function applySky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, choice?: string) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const id = (params?.get('sky')) || choice;
  const pick = SKY_CHOICES.find((s) => s.id === id) || SKY_CHOICES[0];
  if (!pick) {
    console.warn('[sky] No sky choices found.');
    return;
  }

  if (pick.type === 'cube' && pick.dir && pick.faces) {
    const loader = new THREE.CubeTextureLoader();
    const order = [pick.faces.px, pick.faces.nx, pick.faces.py, pick.faces.ny, pick.faces.pz, pick.faces.nz]
      .map((n) => baseURL(`${pick.dir}${n}`));
    const tex = await new Promise<THREE.CubeTexture>((resolve, reject) =>
      loader.load(order, resolve, undefined, reject)
    );
    setTextureColorSpace(tex);
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromCubemap(tex).texture;
    scene.environment = env;
    pmrem.dispose();
    if (typeof window !== 'undefined') {
      (window as typeof window & { __athensDebug?: any }).__athensDebug = {
        ...(window as typeof window & { __athensDebug?: any }).__athensDebug,
        sky: { type: 'cube', id: pick.id, files: order }
      };
    }
    return;
  }

  if (pick.type === 'equirect' && pick.file) {
    const loader = new THREE.TextureLoader();
    const tex = await new Promise<THREE.Texture>((resolve, reject) =>
      loader.load(baseURL(pick.file!), resolve, undefined, reject)
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    setTextureColorSpace(tex);
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    pmrem.dispose();
    if (typeof window !== 'undefined') {
      (window as typeof window & { __athensDebug?: any }).__athensDebug = {
        ...(window as typeof window & { __athensDebug?: any }).__athensDebug,
        sky: { type: 'equirect', id: pick.id, file: baseURL(pick.file!) }
      };
    }
    return;
  }

  console.warn('[sky] Invalid sky choice config:', pick);
}
