export async function attachNpcAudio(audio, npcObject3D, { clip = 'market_chatter.mp3', volume = 0.35, distance = 18 } = {}) {
  if (!audio || !npcObject3D) {
    return null;
  }

  const name = `npc:${clip}`;
  const base = await audio.load(name, clip);
  if (!base || !base.buffer) {
    return null;
  }

  const positional = audio.createPositional({ distance });
  positional.userData = positional.userData || {};
  positional.userData.baseVolume = Number.isFinite(volume) ? Math.max(0, volume) : 0.35;
  positional.setBuffer(base.buffer);
  positional.setLoop(true);
  positional.setVolume(audio.getMasterVolume() * positional.userData.baseVolume);

  npcObject3D.add(positional);

  try {
    positional.play();
  } catch (_) {
    // Ignore autoplay restrictions; playback will resume after context resumes
  }

  return positional;
}
