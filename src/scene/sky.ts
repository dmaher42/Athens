import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { assetUrl } from '../utils/assetUrl.ts';
import { logger } from '../utils/logger';
import { disposeAll } from '../utils/disposable.ts';
import { SKY_PROCEDURAL_BACKGROUNDS, type SkyTime } from './proceduralSky.ts';

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
    file: assetUrl('assets/sky/day.jpg'),
    aliases: ['sunny-day', 'daytime', 'high-noon', 'noon', 'midday']
  },
  {
    id: 'dawn',
    type: 'equirect',
    label: 'Dawn',
    file: assetUrl('assets/sky/dawn.jpg'),
    aliases: ['sunrise']
  },
  {
    id: 'dusk',
    type: 'equirect',
    label: 'Dusk',
    file: assetUrl('assets/sky/dusk.jpg'),
    aliases: ['golden-hour', 'sunset', 'evening', 'goldenhour']
  },
  {
    id: 'blue-hour',
    type: 'equirect',
    label: 'Blue Hour',
    file: assetUrl('assets/sky/blue_hour.jpg')
  },
  {
    id: 'night',
    type: 'equirect',
    label: 'Night',
    file: assetUrl('assets/sky/night.jpg'),
    aliases: ['night-sky', 'starlit-night', 'midnight']
  },
  {
    id: 'night-4k',
    type: 'equirect',
    label: 'Night (4K)',
    file: assetUrl('assets/sky/night_sky_4k.jpg'),
    aliases: ['night-hires', 'night_sky_4k']
  },
  // Optional test HDRIs retained from codex branch:
  { id: 'dirt', type: 'equirect', label: 'Dirt (Test HDRI)', file: assetUrl('assets/sky/dirt.jpg') },
  { id: 'marble', type: 'equirect', label: 'Marble (Test HDRI)', file: assetUrl('assets/sky/marble.jpg') },
  { id: 'roof-tiles', type: 'equirect', label: 'Roof Tiles (Test HDRI)', file: assetUrl('assets/sky/roof_tiles.jpg') }
];

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function resolveSkyPath(segment: string, base?: string) {
  const value = `${segment ?? ''}`.trim();
  if (!value) {
    return assetUrl('');
  }

  if (ABSOLUTE_URL_PATTERN.test(value)) {
    return value;
  }

  const baseRoot = assetUrl('');
  const baseRootNoSlash = baseRoot.replace(/^\/+/, '');
  const normalizedValue = value.replace(/^\/+/, '');

  if (base) {
    const baseValue = `${base}`.trim();
    if (ABSOLUTE_URL_PATTERN.test(baseValue)) {
      const normalizedBase = baseValue.endsWith('/') ? baseValue : `${baseValue}/`;
      return `${normalizedBase}${normalizedValue}`.replace(/\/{2,}/g, '/');
    }

    let normalizedBase = baseValue.replace(/^\/+/, '');
    if (baseRootNoSlash && normalizedBase.startsWith(baseRootNoSlash)) {
      normalizedBase = normalizedBase.slice(baseRootNoSlash.length);
    }
    normalizedBase = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;

    if (baseRootNoSlash && normalizedValue.startsWith(baseRootNoSlash)) {
      return assetUrl(normalizedValue.slice(baseRootNoSlash.length));
    }

    return assetUrl(`${normalizedBase}${normalizedValue}`);
  }

  if (baseRootNoSlash && normalizedValue.startsWith(baseRootNoSlash)) {
    return assetUrl(normalizedValue.slice(baseRootNoSlash.length));
  }

  return assetUrl(normalizedValue);
}

function disposeExistingEnvironment(scene: THREE.Scene) {
  const current = scene.environment as THREE.Texture | THREE.CubeTexture | null;
  disposeAll(current);
}

function setTextureColorSpace(tex: THREE.Texture | THREE.CubeTexture) {
  // three r152+: SRGBColorSpace; older: sRGBEncoding (ignored if absent)
  (tex as any).colorSpace =
    (THREE as any).SRGBColorSpace ?? (tex as any).colorSpace ?? (THREE as any).sRGBEncoding;
}

function setHdrColorSpace(tex: THREE.Texture) {
  (tex as any).colorSpace =
    (THREE as any).LinearSRGBColorSpace ?? (tex as any).colorSpace ?? (THREE as any).LinearEncoding;
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
): Promise<string | null> {
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
    logger.warn('[sky] No sky choices found.');
    return null;
  }

  const preferHdrVariant = (choice: SkyChoice) => {
    if (!choice || choice.type !== 'equirect') {
      return choice;
    }
    const normalizedId = normalize(choice.id);
    const hdrCandidate = SKY_CHOICES.find((candidate) => {
      if (candidate === choice || candidate.type !== 'equirect') {
        return false;
      }
      if (!candidate.file?.toLowerCase().endsWith('.hdr')) {
        return false;
      }
      const candidateId = normalize(candidate.id);
      if (candidateId === normalizedId) {
        return true;
      }
      return candidate.aliases?.some((alias) => normalize(alias) === normalizedId) ?? false;
    });
    if (hdrCandidate) {
      return hdrCandidate;
    }
    return choice;
  };

  const resolvedPick = preferHdrVariant(pick);

  let appliedId: string | null = null;

  try {
    if (resolvedPick.type === 'cube' && resolvedPick.dir && resolvedPick.faces) {
      const loader = new THREE.CubeTextureLoader();
      const order = [
        resolvedPick.faces.px,
        resolvedPick.faces.nx,
        resolvedPick.faces.py,
        resolvedPick.faces.ny,
        resolvedPick.faces.pz,
        resolvedPick.faces.nz
      ].map((n) => resolveSkyPath(n, resolvedPick.dir));

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
        const debug = (window as typeof window & { __athensDebug?: any }).__athensDebug;
        if (debug && typeof debug === 'object') {
          debug.sky = { type: 'cube', id: resolvedPick.id, files: order };
        }
      }
      appliedId = resolvedPick.id;
    } else if (resolvedPick.type === 'equirect' && resolvedPick.file) {
      const url = resolveSkyPath(resolvedPick.file);
      const lowerUrl = url.toLowerCase();
      const isHdr = lowerUrl.endsWith('.hdr');

      if (isHdr) {
        const loader = new RGBELoader();
        const dataType = (THREE as any).HalfFloatType ?? (THREE as any).FloatType;
        if (typeof loader.setDataType === 'function' && dataType) {
          loader.setDataType(dataType);
        }

        const tex = await new Promise<THREE.Texture>((resolve, reject) =>
          loader.load(url, resolve, undefined, reject)
        );

        tex.mapping = THREE.EquirectangularReflectionMapping;
        setHdrColorSpace(tex);

        disposeExistingEnvironment(scene);

        const pmrem = new THREE.PMREMGenerator(renderer);
        const env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();

        tex.dispose();

        scene.environment = env;

        const normalizedId = normalize(resolvedPick.id);
        const fallbackKey: SkyTime =
          normalizedId === 'dawn'
            ? 'dawn'
            : normalizedId === 'dusk'
            ? 'dusk'
            : normalizedId === 'night'
            ? 'night'
            : 'day';
        const fallbackColor = SKY_PROCEDURAL_BACKGROUNDS[fallbackKey];
        scene.background = new THREE.Color(fallbackColor);

        if (typeof window !== 'undefined') {
          const debug = (window as typeof window & { __athensDebug?: any }).__athensDebug;
          if (debug && typeof debug === 'object') {
            debug.sky = { type: 'hdr', id: resolvedPick.id, file: url };
          }
        }
        appliedId = resolvedPick.id;
      } else {
        const loader = new THREE.TextureLoader();

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
          const debug = (window as typeof window & { __athensDebug?: any }).__athensDebug;
          if (debug && typeof debug === 'object') {
            debug.sky = { type: 'equirect', id: resolvedPick.id, file: url };
          }
        }
        appliedId = resolvedPick.id;
      }
    } else {
      logger.warn(
        `[sky] Choice "${resolvedPick.id}" is missing required properties for type "${resolvedPick.type}".`
      );
      return null;
    }
  } catch (error) {
    logger.warn('[sky] Failed to apply sky environment.', error);
    return null;
  } finally {
    // Dispose the previous background texture if it was replaced
    if (previousBackground && previousBackground !== scene.background) {
      try {
        disposeAll(previousBackground as THREE.Texture | THREE.CubeTexture | null);
      } catch (e) {
        logger.warn('[sky] Failed to dispose previous background texture.', e);
      }
    }
  }

  return appliedId;
}
