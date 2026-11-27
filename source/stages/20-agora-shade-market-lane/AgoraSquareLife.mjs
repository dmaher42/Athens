export const AgoraSquareLife = (() => {
  const seatSites = [
    { zone: 'north-approach', x: -114.65, z: 88.7, yaw: Math.PI / 2 },
    { zone: 'painted-market', x: -114.7, z: 96.95, yaw: Math.PI / 2 },
  ];
  const olives = [
    { name: 'olive_redesign_olive_48', x: -116.45, z: 84.9 },
    { name: 'olive_redesign_olive_1', x: -116.75, z: 95.0 },
    { name: 'olive_planted_5', x: -116.45, z: 100.05 },
  ];
  const laneOlive = { x: -116.63, z: 89.9 };
  const lane = [
    [-91.9, 104.9], [-90, 106], [-82, 111], [-79, 119],
    [-76.5, 128], [-76, 130.85], [-61, 130.85],
  ];
  const segments = lane.slice(1).map(([bx, bz], i) => {
    const [ax, az] = lane[i];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    return { ax, az, dx, dz, length };
  });
  const laneBoxes = segments.map(({ ax, az, dx, dz, length }) => ({
    x: ax + dx / 2, z: az + dz / 2, hx: length / 2 + .24, hz: 1.73,
    ax: dx / length, az: dz / length,
  }));
  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
  };

  function fitZone(zone) {
    const seat = seatSites.find(site => site.zone === zone.id);
    if (!seat) return zone;
    return {
      ...zone,
      benches: zone.benches.map((item, index) => index === 0
        ? { ...item, x: seat.x, z: seat.z, yaw: seat.yaw } : item),
      trees: zone.id === 'north-approach'
        ? zone.trees.map((tree, index) => index === 3
          ? { ...tree, ...laneOlive, agoraOriginalAnchor: tree.agoraOriginalAnchor ?? { x: tree.x, z: tree.z } }
          : tree)
        : zone.trees,
    };
  }

  function groupOlives(scene, heightAt) {
    for (const { name, x, z } of olives) {
      const root = scene.getMeshByName(name);
      if (!root?.isEnabled()) continue;
      const soil = heightAt(x, z);
      const children = root.getChildMeshes().filter(mesh => mesh.getTotalVertices());
      if (!Number.isFinite(soil) || !children.length) continue;
      const bottom = Math.min(...children.map(mesh => {
        mesh.computeWorldMatrix(true);
        return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
      }));
      const current = root.getAbsolutePosition();
      const to = new root.position.constructor(x, current.y + soil - bottom - .04, z);
      const nodes = [root, ...root.getDescendants()];
      const frozen = nodes.map(node => node.isWorldMatrixFrozen);
      for (const node of nodes) node.unfreezeWorldMatrix();
      root.setAbsolutePosition(to);
      nodes.forEach((node, i) => {
        node.computeWorldMatrix(true);
        if (frozen[i]) node.freezeWorldMatrix();
      });
    }
  }

  function seatSupports(scene, heightAt) {
    const records = seatSites.map(({ x, z, yaw }) => ({
      x, y: heightAt(x, z), z, yaw, range: 2.35,
      boxes: [
        { x: 0, y: .46, z: 0, hx: 1.2, hy: .07, hz: .275, yaw: 0 },
        ...[-.82, .82].map(x => ({ x, y: .2, z: 0, hx: .125, hy: .2, hz: .24, yaw: 0 })),
      ],
      floors: [{ x: 0, z: 0, hx: 1.2, hz: .275, top: .53 }],
    })).filter(record => Number.isFinite(record.y));
    scene.metadata.agoraSquareShade = { seats: records };
    return records;
  }

  function laneDistance(x, z) {
    let nearest = Infinity;
    for (const { ax, az, dx, dz, length } of segments) {
      const u = clamp(((x - ax) * dx + (z - az) * dz) / (length * length));
      nearest = Math.min(nearest, Math.hypot(x - ax - u * dx, z - az - u * dz));
    }
    return nearest;
  }

  // Wear and pale aggregate use the existing full-look terrain atlas.
  function paintLane(pixels, width, height, extent) {
    const stepX = (extent.east - extent.west) / (width - 1);
    const stepZ = (extent.north - extent.south) / (height - 1);
    const lowX = Math.max(0, Math.ceil((-95 - extent.west) / stepX));
    const highX = Math.min(width - 1, Math.floor((-58 - extent.west) / stepX));
    const lowZ = Math.max(0, Math.ceil((104.5 - extent.south) / stepZ));
    const highZ = Math.min(height - 1, Math.floor((134 - extent.south) / stepZ));
    for (let row = lowZ; row <= highZ; row++) {
      const z = extent.south + row * stepZ;
      for (let col = lowX; col <= highX; col++) {
        const x = extent.west + col * stepX;
        const irregularity = .17 * Math.sin(x * 1.19 + z * .62);
        const laneWeight = smooth(104.5, 107, z) *
          (1 - smooth(1.38, 2.77, laneDistance(x, z) - irregularity));
        if (laneWeight < .0001) continue;
        const at = (row * width + col) * 4;
        pixels[at] += (210 - pixels[at]) * laneWeight * .86;
        pixels[at + 1] *= 1 - laneWeight * .35;
        pixels[at + 2] = Math.max(pixels[at + 2], laneWeight * 255);
        pixels[at + 3] = Math.min(pixels[at + 3], 255 - 96 * .72 * laneWeight);
      }
    }
  }

  function keepOrnament(row) {
    return row.x < -95 || row.x > -58 || row.z < 103 || row.z > 133.5 || laneDistance(row.x, row.z) > 1.85;
  }

  return { seatSites, olives, laneOlive, lane, laneBoxes, laneDistance, fitZone, groupOlives, seatSupports, paintLane, keepOrnament };
})();
