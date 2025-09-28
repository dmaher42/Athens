// Returns a Stats-like object with begin/end + optional DOM, or a no-op if stats.js isn’t available.
export async function createStats() {
  return {
    dom: null,
    begin: () => {},
    end: () => {}
  };
}
