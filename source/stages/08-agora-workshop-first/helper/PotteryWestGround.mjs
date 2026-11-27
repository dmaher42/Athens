import design from './SITE.json' with {type: 'json'};

export const site = design.site;
export const planting = Object.freeze({
  olive_redesign_olive_64: [-225, 93],
  cypress_redesign_cypress_39: [-236, 58],
  cypress_redesign_cypress_9: [-226, 100],
});
const pads = design.pads;
const offset = -20;
const extent = { west: -242, east: -173, south: 29, north: 104 };
const fade = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const distanceTo = (x, z, box) => Math.hypot(
  Math.max(box.west - x, 0, x - box.east),
  Math.max(box.south - z, 0, z - box.north),
);

export function usesFittedGround(x, z) {
  return x >= extent.west && x <= extent.east && z >= extent.south && z <= extent.north;
}

export function moveExistingPlants(scene) {
  const terrain = scene.getMeshByName('athensCanonicalTerrain');
  const height = terrain.metadata.potteryWestGround.heightAt;
  const roots = [...new Set([...scene.meshes,...scene.transformNodes])].filter(node =>
    /^(olive_|cypress_)/.test(node.name) && node.isEnabled() && node.getChildMeshes().length,
  ).map(node => {
    node.computeWorldMatrix(true);
    return {node, position:node.getAbsolutePosition().clone()};
  });
  const clear = (x,z) => pads.slice(0,4).every(pad=>distanceTo(x,z,pad)>.8) &&
    routeGrade(site.branch,x,z).influence<.72 &&
    [site.publicApproach,site.serviceApproach,site.visitorApproach,householdPath].every(path=>routeGrade(path,x,z).influence<.72);
  const destinations = [
    [-237,62],[-237,69],[-237,76],[-236.8,84],[-232,94],[-229,100],[-224,100],[-216,100],
    [-205,100],[-191,98.6],[-180,90],[-179.6,79.5],[-179.2,63],[-182,48],[-200,47],[-201,53],
  ];
  const occupied=roots.filter(({position:p})=>clear(p.x,p.z)).map(({position:p})=>[p.x,p.z]);
  const moved=[];
  for(const {node,position} of roots.filter(({position:p})=>usesFittedGround(p.x,p.z)&&!clear(p.x,p.z))
    .sort((a,b)=>a.node.name.localeCompare(b.node.name))) {
    const candidate=destinations.filter(([x,z])=>clear(x,z)&&occupied.every(([a,b])=>Math.hypot(x-a,z-b)>2.4))
      .sort((a,b)=>Math.hypot(a[0]-position.x,a[1]-position.z)-Math.hypot(b[0]-position.x,b[1]-position.z))[0];
    if(!candidate)throw Error('Surveyed workshop plant margins are full: '+node.name);
    const [x,z]=candidate,y=height(x,z);
    if (!Number.isFinite(y)) throw Error('No real ground for '+node.name);
    const nodes=[node,...node.getDescendants()];
    const frozen=nodes.map(child=>child.isWorldMatrixFrozen);
    nodes.forEach(child=>child.unfreezeWorldMatrix());
    node.setAbsolutePosition(position.clone().set(x,y-.055,z));
    nodes.forEach((child,i)=>{child.computeWorldMatrix(true);if(frozen[i])child.freezeWorldMatrix();});
    occupied.push(candidate);
    moved.push({name:node.name,from:position.asArray(),to:node.getAbsolutePosition().asArray()});
  }
  scene.metadata.potteryWestPlants=moved;
}

export function moveDetail(root) {
  const meshes = root.getChildMeshes().filter(mesh => mesh.isWorldMatrixFrozen);
  const rootWasFrozen = root.isWorldMatrixFrozen;
  root.unfreezeWorldMatrix();
  for (const mesh of meshes) mesh.unfreezeWorldMatrix();
  root.position.x += offset;
  root.computeWorldMatrix(true);
  if (rootWasFrozen) root.freezeWorldMatrix();
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
  }
  return root;
}

export function restoreFormerPlot(positions, previousGrade) {
  // The old pottery-only grade runs before the civic, Acropolis and cemetery
  // grades. Revert it here so later owners keep their normal final say.
  const restored = new Map(previousGrade.changes.filter(({x, z}) =>
    x >= -220 && x <= -173 && z >= 51 && z <= 102,
  ).map(({x, z, before}) => [`${x},${z}`, before]));
  for (let j = 0; j < positions.length; j += 3) {
    const x = positions[j], z = positions[j + 2];
    if (x < -220 || x > -173 || z < 51 || z > 102) continue;
    const original = restored.get(`${x},${z}`);
    if (original === undefined) continue;
    const fadeToNeighbour = fade((-173 - x) / 5) * fade((z - 51) / 4) * fade((102 - z) / 4);
    positions[j + 1] += (original - positions[j + 1]) * fadeToNeighbour;
  }
}

function routeGrade(path, x, z, shoulder=2.25) {
  let distance = Infinity;
  let level = 0;
  for (let i = 1; i < path.points.length; i++) {
    const [a, b] = [path.points[i - 1], path.points[i]];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (d < distance) {
      distance = d;
      level = a.y + t * (b.y - a.y) - .07;
    }
  }
  return {level, influence:fade((path.width / 2 + shoulder - distance) / shoulder)};
}

const householdPath = {width:2.6, points:[
  {x:-196,z:63,y:5.10}, {x:-199,z:57,y:5.30}, {x:-228,z:56.9,y:6.24},
  site.privateSteps.top,
]};
const lowRoutes = [site.visitorApproach, site.publicApproach, site.serviceApproach, householdPath];

function grade(x, z, original) {
  let earth = original;
  const branch = routeGrade(site.branch, x, z,4.5);
  // Let the branch meet the original road shoulder at the original height.
  const shoulder = Math.min(34, 30.95 + (x + 190) * .34);
  earth += (branch.level - earth) * branch.influence * fade((z - shoulder) / 2.2);

  let total = 0;
  let strongest = 0;
  let target = 0;
  for (const pad of pads) {
    // The two court floors meet the lower showroom under their actual wall.
    // The 18 cm shoulder gives this join a real slope beneath the masonry.
    const inner = {west: pad.west + .18, east: pad.east - .18, south: pad.south + .18, north: pad.north - .18};
    const d = distanceTo(x, z, inner);
    // Grid vertices are ultimately Float32, including these exact cut lines.
    if (d < .0001) return pad.earth;
    const weight = fade(1 - d / (pad.name==='forecourt'?4.3:3.2));
    total += weight;
    strongest = Math.max(strongest, weight);
    target += weight * pad.earth;
  }
  if (total) earth += (target / total - earth) * strongest;
  for (const route of lowRoutes) {
    const {level,influence} = routeGrade(route, x, z);
    if (earth > level) earth += (level - earth) * influence;
  }
  return earth;
}

const xLines = [...new Set([
  ...Array.from({length: 34}, (_, j) => -238 + 2 * j),
  ...Array.from({length: 16}, (_, j) => -198 + j),
  ...pads.flatMap(pad => [pad.west, pad.west + .18, pad.east - .18, pad.east]),
])].sort((a, b) => a - b);
const zLines = [...new Set([
  ...Array.from({length: 75}, (_, j) => 29 + j),
  ...pads.flatMap(pad => [pad.south, pad.south + .18, pad.north - .18, pad.north]),
  ...[site.branch, ...lowRoutes].flatMap(route => route.points.map(point => point.z)),
])].sort((a, b) => a - b);

function slice(face, axis, line) {
  const below = [];
  const above = [];
  for (let n = 0; n < face.length; n++) {
    const a = face[n];
    const b = face[(n + 1) % face.length];
    if (a[axis] <= line) below.push(a);
    if (a[axis] >= line) above.push(a);
    if ((a[axis] - line) * (b[axis] - line) >= 0) continue;
    const t = (line - a[axis]) / (b[axis] - a[axis]);
    const joint = a.map((value, j) => value + t * (b[j] - value));
    joint[axis] = line;
    below.push(joint);
    above.push(joint);
  }
  return [below, above];
}

function subdivide(pieces, lines, axis, low, high) {
  for (const cut of lines) {
    if (cut <= low || cut >= high) continue;
    pieces = pieces.flatMap(face => face.some(point => point[axis] < cut) && face.some(point => point[axis] > cut)
      ? slice(face, axis, cut) : [face]);
  }
  return pieces;
}

export function fitGround(positions, uvs, vertexMask, grouped, oldHeight, makeHeight) {
  const nextPosition = Array.from(positions);
  const nextUV = Array.from(uvs);
  const nextMask = Array.from(vertexMask);
  const nextIndex = [];
  const groups = [];
  const localIndex = [];
  const vertices = new Map();
  let changedTriangles = 0;
  let originalArea = 0;
  let fittedArea = 0;
  const area = (a, b, c) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  const original = id => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2], vertexMask[id]];
  const put = point => {
    const x = Math.fround(point[0]);
    const z = Math.fround(point[2]);
    const y = Math.fround(grade(x, z, point[1]));
    const mask = Math.fround(point[3]);
    const key = `${x},${y},${z},${mask}`;
    let id = vertices.get(key);
    if (id !== undefined) return id;
    id = nextPosition.length / 3;
    vertices.set(key, id);
    nextPosition.push(x, y, z);
    nextUV.push((x + 1200) / 2400, (z + 1200) / 2400);
    nextMask.push(mask);
    return id;
  };
  for (const group of grouped.groups) {
    const start = nextIndex.length;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const a = grouped.indices[i], b = grouped.indices[i + 1], c = grouped.indices[i + 2];
      const ax = positions[a * 3], bx = positions[b * 3], cx = positions[c * 3];
      const az = positions[a * 3 + 2], bz = positions[b * 3 + 2], cz = positions[c * 3 + 2];
      const west = Math.min(ax, bx, cx), east = Math.max(ax, bx, cx);
      const south = Math.min(az, bz, cz), north = Math.max(az, bz, cz);
      if (east < extent.west || west > extent.east || north < extent.south || south > extent.north) {
        nextIndex.push(a, b, c);
        continue;
      }
      const face = [original(a), original(b), original(c)];
      const sourceArea = area(...face);
      if (Math.abs(sourceArea) < 1e-9) {
        nextIndex.push(a, b, c);
        continue;
      }
      let pieces = subdivide([face], xLines, 0, west, east);
      pieces = subdivide(pieces, zLines, 2, south, north);
      changedTriangles++;
      originalArea += Math.abs(sourceArea);
      for (const piece of pieces) {
        for (let j = 1; j < piece.length - 1; j++) {
          const triangle = [piece[0], piece[j], piece[j + 1]];
          const size = area(...triangle);
          if (Math.abs(size) < 1e-10) continue;
          if (Math.sign(size) !== Math.sign(sourceArea)) throw Error('Workshop ground inverted a terrain face');
          const ids = triangle.map(put);
          fittedArea += Math.abs(size);
          nextIndex.push(...ids);
          localIndex.push(...ids);
        }
      }
    }
    groups.push({...group, start, count: nextIndex.length - start});
  }
  if (!changedTriangles || Math.abs(originalArea - fittedArea) > 1e-5) throw Error('Workshop ground lost terrain coverage');
  const positionData = new Float32Array(nextPosition);
  const localHeight = makeHeight(positionData, new Uint32Array(localIndex), 4);
  const height = (x, z) => usesFittedGround(x,z) ? localHeight(x, z) ?? oldHeight(x, z) : oldHeight(x, z);
  return {positions: positionData, uvs: new Float32Array(nextUV), mask: new Float32Array(nextMask),
    indices: new Uint32Array(nextIndex), groups, height,
    stats: {changedTriangles, fittedTriangles: localIndex.length / 3, addedVertices: vertices.size, originalArea, fittedArea}};
}
