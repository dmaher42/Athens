export const AgoraEntranceGround = (() => {
  // The north-east taper meets the existing square, while the south edge
  // stops above the retained council landing.
  const bounds = { west: -134, east: -104, south: 64, north: 84 };
  const levels = [
    { z: 64, west: 2.20, east: 3.18 },
    { z: 69, west: 1.95, east: 3.90 },
    { z: 74, west: 2.40, east: 3.95 },
    { z: 78, west: 3.55, east: 4.07 },
    { z: 84, west: 4.50, east: 4.50 },
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const mix = (from, to, weight) => from + (to - from) * weight;

  function grade(x, z, height) {
    if (x <= bounds.west || x >= bounds.east || z <= bounds.south || z >= bounds.north) return height;
    const squareProtection = 1 - smooth((x + 118) / 4) * smooth((z - 77) / 3);
    const weight = squareProtection *
      smooth((x - bounds.west) / 5) * smooth((bounds.east - x) / 5) *
      smooth((z - bounds.south) / 2) * smooth((bounds.north - z) / 5);
    if (!weight) return height;
    const upperIndex = levels.findIndex(row => row.z >= z);
    const lower = levels[upperIndex - 1];
    const upper = levels[upperIndex];
    const north = smooth((z - lower.z) / (upper.z - lower.z));
    const east = clamp((x + 132) / 26);
    const target = mix(mix(lower.west, lower.east, east), mix(upper.west, upper.east, east), north);
    return mix(height, target, weight);
  }

  return { bounds, grade };
})();
