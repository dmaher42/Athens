// Returns a Stats-like object with begin/end + optional DOM, or a no-op if stats.js isn’t available.
export async function createStats() {
  try {
    const mod = await import('stats.js');
    const Stats = mod.default || mod.Stats || window?.Stats;
    if (!Stats) throw new Error('no Stats ctor');
    const s = new Stats();
    return {
      dom: s.dom || s.domElement || null,
      begin: () => s.begin?.(),
      end: () => s.end?.()
    };
  } catch {
    return {
      dom: null,
      begin: () => {},
      end: () => {}
    };
  }
}
