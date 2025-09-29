import * as THREE from 'three';

export type SkyChoice = {
  id: string;
  type: 'cube' | 'equirect';
  label: string;
  dir?: string;
  faces?: { px: string; nx: string; py: string; ny: string; pz: string; nz: string };
  file?: string;
  aliases?: string[];
};

// Auto-discovered JPG panoramas available in this repo (scanned under public/assets/sky).
// These provide ready-to-use photographic skies when served from GitHub Pages or local builds.
export const SKY_CHOICES: SkyChoice[] = [
  {
    id: 'day',
    type: 'equirect',
    label: 'Sunny Day',
    file: 'assets/sky/day.jpg',
    aliases: ['sunny-day', 'daytime', 'high-noon']
  },
  {
    id: 'high-noon',
    type: 'equirect',
    label: 'High Noon',
    file: 'assets/sky/high_noon.jpg',
    aliases: ['noon', 'midday']
  },
  {
    id: 'golden-hour',
    type: 'equirect',
    label: 'Golden Hour',
    file: 'assets/sky/golden_hour.jpg',
    aliases: ['sunset', 'dusk', 'golden-hour']
  },
  {
    id: 'blue-hour',
    type: 'equirect',
    label: 'Blue Hour',
    file: 'assets/sky/blue_hour.jpg'
  },
  {
    id: 'dawn',
    type: 'equirect',
    label: 'Dawn',
    file: 'assets/sky/dawn.jpg',
    aliases: ['sunrise']
  },
  {
    id: 'dusk',
    type: 'equirect',
    label: 'Dusk',
    file: 'assets/sky/dusk.jpg',
    aliases: ['evening']
  },
  {
    id: 'night',
    type: 'equirect',
    label: 'Night Sky',
    file: 'assets/sky/night_sky.jpg',
    aliases: ['night-sky', 'starlit-night']
  },
  {
    id: 'night-4k',
    type: 'equirect',
    label: 'Night Sky (4K)',
    file: 'assets/sky/night_sky_4k.jpg',
    aliases: ['night-hires', 'night_sky_4k']
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

  const sanitized = rel.replace(/^\/+/, '');

  if (typeof document !== 'undefined' && typeof document.baseURI === 'string') {
    return new URL(sanitized, document.baseURI).toString();
  }

  const baseFromImport = (import.meta as any)?.env?.BASE_URL;
  if (typeof baseFromImport === 'string' && baseFromImport.length > 0) {
    if (/^https?:\/\//.test(baseFromImport)) {
      return new URL(sanitized, baseFromImport).toString();
    }
    const normalized = baseFromImport.endsWith('/') ? baseFromImport : `${baseFromImport}/`;
    return `${normalized}${sanitized}`.replace(/^\/+/, '/');
  }

  if (typeof window !== 'undefined') {
    const root = window.location.pathname.replace(/[^/]*$/, '');
    return new URL(sanitized, window.location.origin + root).toString();
  }

  return sanitized;
}

export async function applySky(scene: THREE.Scene, renderer: THREE.WebGLRenderer, choice?: string) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const normalize = (value?: string | null) =>
    value && typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : null;
  const requested = normalize(params?.get('sky') || choice || undefined);
  const pick =
    SKY_CHOICES.find((s) => {
      const baseId = normalize(s.id);
      if (requested && baseId === requested) {
        return true;
      }
      return requested
        ? s.aliases?.some((alias) => normalize(alias) === requested)
        : false;
    }) || SKY_CHOICES[0];
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
