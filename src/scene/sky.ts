import * as THREE from 'three';

export type SkyChoice =
  | {
      id: string;
      type: 'cube';
      label: string;
      dir: string;
      faces: {
        px: string;
        nx: string;
        py: string;
        ny: string;
        pz: string;
        nz: string;
      };
    }
  | {
      id: string;
      type: 'equirect';
      label: string;
      file: string;
    };

export const SKY_CHOICES: SkyChoice[] = [
  { id: 'blue-hour', type: 'equirect', label: 'Blue Hour', file: 'assets/sky/blue_hour.jpg' },
  { id: 'dawn', type: 'equirect', label: 'Dawn Gradient', file: 'assets/sky/dawn.jpg' },
  { id: 'day', type: 'equirect', label: 'Day Gradient', file: 'assets/sky/day.jpg' },
  { id: 'dusk', type: 'equirect', label: 'Dusk Gradient', file: 'assets/sky/dusk.jpg' },
  { id: 'golden-hour', type: 'equirect', label: 'Golden Hour', file: 'assets/sky/golden_hour.jpg' },
  { id: 'high-noon', type: 'equirect', label: 'High Noon', file: 'assets/sky/high_noon.jpg' },
  { id: 'night', type: 'equirect', label: 'Night Gradient', file: 'assets/sky/night.jpg' },
  { id: 'night-sky', type: 'equirect', label: 'Night Sky', file: 'assets/sky/night_sky.jpg' },
  { id: 'night-sky-4k', type: 'equirect', label: 'Night Sky 4K', file: 'assets/sky/night_sky_4k.jpg' },
  { id: 'dirt', type: 'equirect', label: 'Dirt (Test HDRI)', file: 'assets/sky/dirt.jpg' },
  { id: 'marble', type: 'equirect', label: 'Marble (Test HDRI)', file: 'assets/sky/marble.jpg' },
  { id: 'roof-tiles', type: 'equirect', label: 'Roof Tiles (Test HDRI)', file: 'assets/sky/roof_tiles.jpg' }
];

function baseURL(rel: string) {
  return new URL(rel, document.baseURI).toString();
}

function disposeExistingEnvironment(scene: THREE.Scene) {
  const current = scene.environment;
  if (current && typeof (current as THREE.Texture).dispose === 'function') {
    (current as THREE.Texture).dispose();
  }
}

export async function applySky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  choiceId?: string
) {
  const previousBackground = scene.background as THREE.Texture | THREE.Color | null;
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const id = choiceId || params.get('sky') || SKY_CHOICES[0]?.id;
  const choice = SKY_CHOICES.find((s) => s.id === id) || SKY_CHOICES[0];
  if (!choice) {
    console.warn('[sky] No sky choices found.');
    return;
  }

  (renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace ?? (renderer as any).outputColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);

  try {
    if (choice.type === 'cube') {
      const order = [choice.faces.px, choice.faces.nx, choice.faces.py, choice.faces.ny, choice.faces.pz, choice.faces.nz].map(
        (f) => baseURL(`${choice.dir}${f}`)
      );
      const tex = await new Promise<THREE.CubeTexture>((resolve, reject) => {
        new THREE.CubeTextureLoader().load(order, (texture) => resolve(texture), undefined, (error) => reject(error));
      });
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace ?? (tex as any).colorSpace;
      scene.background = tex;
      disposeExistingEnvironment(scene);
      scene.environment = pmrem.fromCubemap(tex).texture;
    } else {
      const url = baseURL(choice.file);
      const tex = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(url, (texture) => resolve(texture), undefined, (error) => reject(error));
      });
      tex.mapping = THREE.EquirectangularReflectionMapping;
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace ?? (tex as any).colorSpace;
      scene.background = tex;
      disposeExistingEnvironment(scene);
      scene.environment = pmrem.fromEquirectangular(tex).texture;
    }
  } catch (error) {
    console.warn('[sky] Failed to apply sky environment.', error);
  } finally {
    pmrem.dispose();
  }

  if (typeof window !== 'undefined') {
    const globalWindow = window as typeof window & { __athensDebug?: Record<string, unknown> };
    globalWindow.__athensDebug = { ...(globalWindow.__athensDebug || {}), sky: choice };
  }

  const backgroundDisposable = previousBackground as unknown as { dispose?: () => void };
  if (
    previousBackground &&
    previousBackground !== scene.background &&
    typeof backgroundDisposable.dispose === 'function'
  ) {
    try {
      backgroundDisposable.dispose?.();
    } catch (error) {
      console.warn('[sky] Failed to dispose previous background texture.', error);
    }
  }
}
