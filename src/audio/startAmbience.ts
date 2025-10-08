import { AMBIENT_TRACKS } from './ambient.ts';

export function startAmbience() {
  try {
    const track = AMBIENT_TRACKS[0];
    if (!track) {
      return;
    }

    const url = track.file;
    if (!url) {
      console.warn('[Athens][Audio] ambience missing URL for track:', track.id);
      return;
    }

    const audio = new Audio();
    audio.loop = true;
    audio.src = url;
    audio.play().catch(() => {
      console.warn('[Athens][Audio] ambience failed or missing:', url);
    });
  } catch (error) {
    console.warn('[Athens][Audio] init error:', error);
  }
}
