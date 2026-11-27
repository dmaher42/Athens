// Road-local metres. These are open approaches between the authored stops.
const chariotRoadApproaches = [[620, 745], [2040, 2200]];
const chariotShoulderBlend = 24;
const chariotShoulderExtension = 2.5;

export function chariotRoadSmooth(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function chariotRoadWeight(z) {
  for (const [start, end] of chariotRoadApproaches) {
    if (z > start && z < end) {
      return chariotRoadSmooth(0, chariotShoulderBlend, Math.min(z - start, end - z));
    }
  }
  return 0;
}

// Use the same row interpolation as the visible mesh and sampled ground height.
export function chariotRoadMeshOffset(x, z, centre, spacing) {
  const row = Math.floor(z / spacing) * spacing;
  const first = centre(row);
  return x - (first + (centre(row + spacing) - first) * (z - row) / spacing);
}

export function chariotRoadRecovery(x, z, centre, spacing) {
  const weight = chariotRoadWeight(z);
  return weight > 0 && Math.abs(chariotRoadMeshOffset(x, z, centre, spacing)) <= 11 + weight * chariotShoulderExtension;
}

export function chariotRoadSurface(x, z, centre, spacing, fallback) {
  const weight = chariotRoadWeight(z);
  if (weight === 0) return fallback;
  const offset = Math.abs(chariotRoadMeshOffset(x, z, centre, spacing));
  if (offset < 2.72 + weight * 0.43) return 'earth';
  if (offset < 4.1 + weight * 1.2) return 'gravel';
  return offset < 8.4 + weight * 1.1 ? 'grass' : 'rough';
}
