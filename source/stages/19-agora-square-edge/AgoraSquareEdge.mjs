export const AgoraSquareEdge = (() => {
  const square = { west: -113, east: -87, south: 80, north: 105 };
  const approach = [
    [-129, 62], [-125.5, 64], [-121.5, 67.5], [-117, 71],
    [-111.5, 74.75], [-104, 79.5], [-102.5, 82.4],
  ];
  const stoneRuns = [[-113.9, -109.65], [-98.3, -91.1]];
  const stoneZ = 79.8;
  const segments = approach.slice(1).map(([bx, bz], index) => {
    const [ax, az] = approach[index];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    return { ax, az, dx, dz, length };
  });
  const clearances = [
    { x: -100, z: 92.5, hx: 13, hz: 12.5, ax: 1, az: 0 },
    ...segments.map(({ ax, az, dx, dz, length }) => ({
      x: ax + dx / 2, z: az + dz / 2, hx: length / 2 + .45, hz: 2.18,
      ax: dx / length, az: dz / length,
    })),
  ];
  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, weight) => a + (b - a) * weight;

  function pathDistance(x, z) {
    let nearest = Infinity;
    for (const { ax, az, dx, dz, length } of segments) {
      const u = clamp(((x - ax) * dx + (z - az) * dz) / (length * length));
      nearest = Math.min(nearest, Math.hypot(x - ax - u * dx, z - az - u * dz));
    }
    return nearest;
  }

  // Reuse the existing wear, canopy and aggregate channels in the city atlas.
  // This initial bake adds no per-frame shader work or extra terrain surface.
  function paintMask(pixels, width, height, extent) {
    const stepX = (extent.east - extent.west) / (width - 1);
    const stepZ = (extent.north - extent.south) / (height - 1);
    const lowX = Math.max(0, Math.ceil((-133 - extent.west) / stepX));
    const highX = Math.min(width - 1, Math.floor((-85 - extent.west) / stepX));
    const lowZ = Math.max(0, Math.ceil((61.3 - extent.south) / stepZ));
    const highZ = Math.min(height - 1, Math.floor((107 - extent.south) / stepZ));
    for (let row = lowZ; row <= highZ; row++) {
      const z = extent.south + row * stepZ;
      for (let col = lowX; col <= highX; col++) {
        const x = extent.west + col * stepX;
        const verge = .18 * Math.sin(x * 1.3 + z * .57);
        const edge = Math.min(x - square.west, square.east - x, z - square.south, square.north - z);
        const court = smooth(-1.15, .7, edge + verge);
        const walk = (1 - smooth(1.38, 2.85, pathDistance(x, z) - verge)) *
          smooth(61.3, 64.2, z) * (1 - court);
        if (court + walk < .0001) continue;
        const at = (row * width + col) * 4;
        pixels[at] = mix(mix(pixels[at], 148, court * .86), 208, walk * .84);
        pixels[at + 1] *= 1 - court * .75;
        pixels[at + 2] = Math.max(pixels[at + 2], (court + walk) * 255);
        pixels[at + 3] = Math.min(pixels[at + 3], 255 - 96 * (.44 * court + .76 * walk));
      }
    }
  }

  function buildEdging(builder, heightAt) {
    const origin = -100, floors = [];
    for (const [start, end] of stoneRuns) {
      const count = Math.round((end - start) / 1.12);
      const interval = (end - start) / count;
      for (let index = 0; index < count; index++) {
        const worldX = start + (index + .5) * interval;
        const x = worldX - origin;
        const width = interval - .045;
        const depth = index % 2 ? .41 : .47;
        const ground = heightAt(worldX, stoneZ);
        if (!Number.isFinite(ground)) continue;
        const top = ground + .075;
        const bottom = ground - .20;
        builder.box('Set limestone edge stone', x, (bottom + top) / 2, 0, width, top - bottom, depth,
          builder.p.pavement ?? builder.p.stone);
        floors.push({ x, z: 0, hx: width / 2, hz: depth / 2, top });
      }
    }
    const root = builder.finish({ id: 'agora-square-low-edging', x: origin, z: stoneZ, w: 26, d: 1, rotation: 0 },
      0, null, ['Low square edge', 'Open council approach']);
    Object.assign(root.metadata, { floorPlanes: floors, collisionBoxes: [] });
    const ledger = builder.scene.metadata.districtStreaming.resources;
    const id = 'agora-square-low-edging';
    ledger.register({ id, owner: 'AgoraSquareEdge', residency: 'essential',
      reason: 'Terrain-fitted limestone edge at the square entrance', dependencies: [],
      validationRoute: 'agora-square-civic-entry' });
    const scope = ledger.scope(id);
    scope.ownComposite(root, item => { if (!item.isDisposed()) item.dispose(false, false); }, [root]);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      scope.dispose();
      ledger.unregister(id);
    };
    const rootObserver = root.onDisposeObservable.add(close);
    const sceneObserver = builder.scene.onDisposeObservable.add(close);
    scope.defer(() => root.onDisposeObservable.remove(rootObserver));
    scope.defer(() => builder.scene.onDisposeObservable.remove(sceneObserver));
    scope.defer(() => ledger.unregister(id));
  }

  return { square, approach, stoneRuns, stoneZ, clearances, paintMask, buildEdging, pathDistance };
})();
