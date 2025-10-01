export function startAmbience() {
  try {
    const winBase = typeof window !== 'undefined' ? (window as any).__ATHENS_BASE__ : undefined;
    const base = (import.meta as any)?.env?.BASE_URL || winBase || '/';
    const url = `${base}assets/audio/ambience_dawn.mp3`;
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
