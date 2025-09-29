import * as THREE from 'three';

export type SkyChoice =
  | {
      id: string;
      type: 'cube';
      label: string;
      dir: string;
      faces: { px: string; nx: string; py: string; ny: string; pz: string; nz: string };
      aliases?: string[];
    }
  | {
      id: string;
      type: 'equirect';
      label: string;
      file: string;
      aliases?: string[];
    };

export const SKY_CHOICES: SkyChoice[] = [
  {
    id: 'day',
    type: 'equirect',
    label: 'Sunny Day',
    file: 'assets/sky/day.jpg',
    aliases: ['sunny-day', 'daytime', 'high-noon', 'noon', 'midday']
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
    aliases: ['golden-hour', 'sunset', 'evening', 'goldenhour']
  },
  {
    id: 'blue-hour',
    type: 'equirect',
    label: 'Blue Hour',
    file: 'assets/sky/blue_hour.jpg'
  },
  {
    id: 'night',
    type: 'equirect',
    label: 'Night',
    file: 'assets/sky/night.jpg',
    aliases: ['night-sky', 'starlit-night', 'midnight']
  },
  {
    id: 'night-4k',
    type: 'equirect',
    label: 'Night (4K)',
    file: 'assets/sky/night_sky_4k.jpg',
    aliases: ['night-hires', 'night_sky_4k']
  },
  // Optional test HDRIs retained from codex branch:
  { id: 'dirt', type: 'equirect', label: 'Dirt (Test HDRI)', file: 'assets/sky/dirt.jpg' },
  { id: 'marble', type: 'equirect', label: 'Marble (Test HDRI)', file: 'assets/sky/marble.jpg' },
  { id: 'roof-tiles', type: 'equirect', label: 'Roof Tiles (Test HDRI)', file: 'assets/sky/roof_tiles.jpg' }
];

function baseURL(rel: string) {
  if (/^https?:\/\//.test(rel)) return rel;

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

function disposeExistingEnvironment(scene: THREE.Scene) {
  const current = scene.environment as THREE.Texture | THREE.CubeTexture | null;
  if (current && typeof (current as THREE.Texture).dispose === 'function') {
    try {
      (current as THREE.Texture).dispose();
    } catch {}
  }
}

function setTextureColorSpace(tex: THREE.Texture | THREE.CubeTexture) {
  // three r152+: SRGBColorSpace; older: sRGBEncoding (ignored if absent)
  (tex as any).colorSpace =
    (THREE as any).SRGBColorSpace ?? (tex as any).colorSpace ?? (THREE as any).sRGBEncoding;
}

function setRendererColorSpace(renderer: THREE.WebGLRenderer) {
  (renderer as any).outputColorSpace =
    (THREE as any).SRGBColorSpace ?? (renderer as any).outputColorSpace;
}

/**
 * Apply a sky environment by id or alias. Falls back to the first SKY_CHOICES entry.
 * Also respects ?sky=<id-or-alias> from URL.
 */
export async function applySky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  choice?: string
) {
  setRendererColorSpace(renderer);

  const previousBackground = scene.background as THREE.Texture | THREE.Color | null;

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

  const normalize = (value?: string | null) =>
    value && typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : null;

  const requested = normalize(params?.get('sky') || choice || undefined);

  const pick =
    SKY_CHOICES.find((s) => {
      const baseId = normalize(s.id);
      if (requested && baseId === requested) return true;
      return requested ? s.aliases?.some((alias) => normalize(alias) === requested) : false;
    }) || SKY_CHOICES[0];

  if (!pick) {
    console.warn('[sky] No sky choices found.');
    return;
  }

  try {
    if (pick.type === 'cube' && pick.dir && pick.faces) {
      const loader = new THREE.CubeTextureLoader();
      const order = [
        pick.faces.px,
        pick.faces.nx,
        pick.faces.py,
        pick.faces.ny,
        pick.faces.pz,
        pick.faces.nz
      ].map((n) => baseURL(`${pick.dir}${n}`));

      const tex = await new Promise<THREE.CubeTexture>((resolve, reject) =>
        loader.load(order, resolve, undefined, reject)
      );

      setTextureColorSpace(tex);

      scene.background = tex;
      disposeExistingEnvironment(scene);

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
    } else if (pick.type === 'equirect' && pick.file) {
      const loader = new THREE.TextureLoader();
      const url = baseURL(pick.file);

      const tex = await new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(url, resolve, undefined, reject)
      );

      tex.mapping = THREE.EquirectangularReflectionMapping;
      setTextureColorSpace(tex);

      scene.background = tex;
      disposeExistingEnvironment(scene);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(tex).texture;
      scene.environment = env;
      pmrem.dispose();

      if (typeof window !== 'undefined') {
        (window as typeof window & { __athensDebug?: any }).__athensDebug = {
          ...(window as typeof window & { __athensDebug?: any }).__athensDebug,
          sky: { type: 'equirect', id: pick.id, file: url }
        };
      }
    } else {
      console.warn(
        `[sky] Choice "${pick.id}" is missing required properties for type "${pick.type}".`
      );
      return;
    }
  } catch (error) {
    console.warn('[sky] Failed to apply sky environment.', error);
  } finally {
    // Dispose the previous background texture if it was replaced
    const backgroundDisposable = previousBackground as unknown as { dispose?: () => void };
    if (
      previousBackground &&
      previousBackground !== scene.background &&
      typeof backgroundDisposable?.dispose === 'function'
    ) {
      try {
        backgroundDisposable.dispose();
      } catch (e) {
        console.warn('[sky] Failed to dispose previous background texture.', e);
      }
    }
  }
}
