import * as THREE from 'three';
import { assetUrl } from '../utils/assetUrl.ts';
import { logger } from '../utils/logger';

export type AmbEntry = {
  id: string;
  file: string;
  label?: string;
  volume?: number;
  tags?: string[];
};

export const AMBIENT_TRACKS: AmbEntry[] = [
  { id: 'day', file: assetUrl('assets/audio/' + 'ambience_day.mp3'), label: 'Ambience – Day', volume: 0.58 }
];

type Running = {
  listener: THREE.AudioListener;
  current?: THREE.Audio;
  camera?: THREE.Camera;
  fading?: boolean;
};

const R: Running = { listener: new THREE.AudioListener() };

export function attachAudioListenerTo(camera: THREE.Camera) {
  if (!camera) return;
  if (R.camera === camera) return;
  if (R.camera && typeof (R.camera as any).remove === 'function') {
    (R.camera as any).remove(R.listener);
  }
  if (typeof (camera as any).add === 'function') {
    (camera as any).add(R.listener);
  }
  R.camera = camera;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  return await new Promise<AudioBuffer>((resolve, reject) => {
    const loader = new THREE.AudioLoader();
    loader.load(url, resolve, undefined, reject);
  });
}

let _unlockInstalled = false;
function installAutoplayUnlock() {
  if (_unlockInstalled || typeof window === 'undefined') return;
  const unlock = () => {
    const ctx = (R.listener.context || (R.listener as any).getContext?.()) as AudioContext | undefined;
    if (ctx && ctx.state !== 'running') {
      ctx.resume?.().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
  window.addEventListener('touchstart', unlock, { once: false });
  _unlockInstalled = true;
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export async function playAmbient(id: string, fadeSeconds = 1.0) {
  if (!AMBIENT_TRACKS.length) {
    logger.warn('[ambient] No tracks configured');
    return;
  }

  const entry = AMBIENT_TRACKS.find((t) => t.id === id) || AMBIENT_TRACKS[0];
  installAutoplayUnlock();

  const srcUrl = entry.file;
  let buffer: AudioBuffer;
  try {
    buffer = await loadBuffer(srcUrl);
  } catch (error) {
    logger.warn(`[ambient] Failed to load ${srcUrl}`, error);
    return;
  }

  const next = new THREE.Audio(R.listener);
  next.setBuffer(buffer);
  next.setLoop(true);
  next.setVolume(0.0001);
  try {
    next.play();
  } catch (error) {
    logger.warn('[ambient] Unable to start playback', error);
  }

  const targetVol = typeof entry.volume === 'number' ? THREE.MathUtils.clamp(entry.volume, 0, 1) : 0.3;
  const prev = R.current;
  R.current = next;

  if (!prev) {
    const start = nowMs();
    const step = () => {
      const elapsed = nowMs() - start;
      const t = Math.min(1, fadeSeconds > 0 ? elapsed / (fadeSeconds * 1000) : 1);
      next.setVolume(t * targetVol);
      if (t < 1) {
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(step);
        } else {
          setTimeout(step, 16);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(step);
    } else {
      setTimeout(step, 16);
    }
    return;
  }

  if (R.fading) {
    try {
      prev.stop();
    } catch (error) {
      logger.warn('[ambient] Failed to stop previous track', error);
    }
  }
  R.fading = true;
  const start = nowMs();
  const prevStartVol = typeof (prev as any).getVolume === 'function' ? (prev as any).getVolume() : targetVol;

  const crossStep = () => {
    const elapsed = nowMs() - start;
    const t = Math.min(1, fadeSeconds > 0 ? elapsed / (fadeSeconds * 1000) : 1);
    const a = THREE.MathUtils.clamp(t, 0, 1);
    next.setVolume(a * targetVol);
    prev.setVolume(Math.max(0, (1 - a) * prevStartVol));
    if (a < 1) {
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(crossStep);
      } else {
        setTimeout(crossStep, 16);
      }
    } else {
      try {
        prev.stop();
      } catch (error) {
        logger.warn('[ambient] Failed to stop old track', error);
      }
      R.fading = false;
    }
  };

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(crossStep);
  } else {
    setTimeout(crossStep, 16);
  }
}

export function stopAmbient() {
  if (!R.current) {
    return;
  }
  try {
    R.current.stop();
  } catch (error) {
    logger.warn('[ambient] Failed to stop ambient track', error);
  }
  R.current = undefined;
  R.fading = false;
}

export async function initAmbient(camera: THREE.Camera) {
  if (!camera) return;
  attachAudioListenerTo(camera);
  if (typeof window !== 'undefined') {
    const debug = (window as any).__athensDebug;
    if (debug && typeof debug === 'object') {
      debug.audio = { AMBIENT_TRACKS };
    }
  }

  if (!AMBIENT_TRACKS.length) {
    return;
  }

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const mute = params?.get('mute') === '1';
  if (mute) return;

  const id = params?.get('amb') || AMBIENT_TRACKS[0]?.id;
  if (id) {
    await playAmbient(id);
  }
}

export const AmbientAPI = {
  play: (trackId: string) => playAmbient(trackId),
  stop: () => stopAmbient(),
  list: () => AMBIENT_TRACKS.map((t) => t.id)
};

// Append a set of externally discovered tracks at runtime.
// - Deduplicates by 'id'.
// - Accepts objects with { id, url, tags: string[] }.
// - No behavior changes for existing code unless this is called.
export function registerExternalAmbientTracks(
  tracks: Array<{ id: string; url: string; tags?: string[] }>
): void {
  if (!Array.isArray(tracks) || tracks.length === 0) return;

  const existingIds = new Set(AMBIENT_TRACKS.map(t => t.id));
  const seen = new Set<string>();
  const toAdd = tracks
    .filter(t => {
      if (!t || typeof t.id !== 'string' || typeof t.url !== 'string') return false;
      if (existingIds.has(t.id) || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .map(t => ({
      id: t.id,
      file: t.url,
      tags: Array.isArray(t.tags) ? t.tags : ['ambient']
    }));

  if (toAdd.length === 0) return;

  // Push into AMBIENT_TRACKS; preserve original references for callers that already imported it.
  AMBIENT_TRACKS.push(...toAdd);
}
