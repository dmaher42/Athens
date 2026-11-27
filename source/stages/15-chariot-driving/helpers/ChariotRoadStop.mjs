// Keep the journey journal quiet at cruising speed and while exploring away
// from the chariot. The mounted prompt uses the same speed limit as dismount.
export function chariotStopHint(mounted, speed, site, canMount, stopSpeed) {
  if (!site) return '';
  if (!mounted) return canMount ? 'Y · Remount chariot' : '';
  if (Math.abs(speed) <= stopSpeed) return 'Y · Dismount at ' + site.name;
  return Math.abs(speed) < 3 ? 'Stop to explore ' + site.name : '';
}

// These short alternatives are all within the native remount radius. The
// callback checks both the landing and its approach against native support.
export function chariotStopExit(x, z, yaw, landing, siteSide) {
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  let best = null, bestSide = -Infinity;
  for (const side of [1, -1]) {
    for (const lateral of [1.45, 2.45]) {
      for (const longitudinal of [-0.4, -1.45]) {
        const dx = forwardZ * side * lateral + forwardX * longitudinal;
        const dz = -forwardX * side * lateral + forwardZ * longitudinal;
        const position = landing(x + dx, z + dz, x + dx * 0.65, z + dz * 0.65);
        if (!position) continue;
        const score = siteSide(position);
        if (score > bestSide) {
          best = position;
          bestSide = score;
        }
      }
    }
  }
  return best;
}

export const chariotStopSpeed = 0.35;
