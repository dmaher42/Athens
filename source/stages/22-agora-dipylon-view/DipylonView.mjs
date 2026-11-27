export const AgoraDipylonView = (() => {
  const sites = [
    { id: 'new-council', from: [-148, 3.15, 52], to: [-157.5, 4.15, 69], feather: 3.2,
      former: { west: -156.942, east: -139.058, south: 40.75, north: 63.25 } },
    { id: 'zeus-stoa', from: [-145, 4.65, 101], to: [-141, 4.65, 104.6], feather: 2.1,
      former: { west: -154.339, east: -135.321, south: 77.762, north: 124.238 } },
    { id: 'painted-stoa', from: [-97, 6.02, 123], to: [-93.4, 6.02, 115.6], feather: 2.5,
      former: { west: -111.415, east: -82.557, south: 119.155, north: 126.845 } },
  ];
  const translate = (b, dx, dz) => ({
    ...b, west: b.west + dx, east: b.east + dx, south: b.south + dz, north: b.north + dz,
  });
  const councilOrigin = { x: -157.5, z: 69 };
  const councilDoors = [60.4, 77.6];
  const councilFloor = 4.2;
  const shiftCouncil = b => ({ ...translate(b, -9.5, 17), top: b.top+1 });
  const councilCourt = b => ({ ...shiftCouncil(b), east: -138.8 });
  const oldCourt = { west: -139.3, east: -126, south: 40.8, north: 63.2, top: 2.45 };
  const court = councilCourt(oldCourt);
  const oldZeusFront = { west: -135.5, east: -129.2, south: 79.1, north: 122.9 };
  const zeusFront = { ...translate(oldZeusFront, 4, 3.6), east: -128.3, north: 115.7 };
  const councilWalk = [
    [-145.2, 60.4], [-139, 62.5], [-129, 64.5], [-120.5, 65.3], [-117, 70.8],
    [-111.5, 74.75], [-104, 79.5], [-102.5, 82.4],
  ];
  const marketLane = [
    [-91.9,104.9],[-90,106],[-82,109.5],[-76.25,112],[-75.9,118],
    [-75.85,124.3],[-76,130.85],[-61,130.85],
  ];
  const siteMap = new Map(sites.map(site => {
    const [dx, , dz] = site.to.map((coord, axis) => coord - site.from[axis]);
    return [site.id, { ...site, dx, dz, bounds: translate(site.former, dx, dz) }];
  }));
  const pads = [
    ...[...siteMap.values()].map(site => ({ ...site.bounds, level: site.to[1] - .06, feather: site.feather })),
    { ...court, level: court.top - .06, feather: 2.05 },
    { ...zeusFront, level: 4.59, feather: 3.45 },
  ];
  const formerBeds = [
    { ...siteMap.get('zeus-stoa').former, feather: 2.1, relief: .42 },
    { ...siteMap.get('new-council').former, feather: 2, relief: .32 },
    { ...oldCourt, feather: 1.55, relief: .25 },
  ];
  const grow = (b, d) => ({ west: b.west-d, east: b.east+d, south: b.south-d, north: b.north+d });
  const areas = [...pads, ...formerBeds].map(b => grow(b, b.feather + .25));
  const distance = (x,z,b) => Math.hypot(Math.max(0,b.west-x,x-b.east),Math.max(0,b.south-z,z-b.north));
  const ease = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
  const overlaps = (a,b) => a.west<=b.east && a.east>=b.west && a.south<=b.north && a.north>=b.south;

  function grade(x,z,height,inherited) {
    let y=height, restoration=0;
    for (const b of formerBeds) restoration=Math.max(restoration,b.relief*ease(1-distance(x,z,b)/b.feather));
    if (restoration) y+=(inherited-y)*restoration;
    // Building foundations take precedence where the shallow public apron overlaps.
    let total=0, weight=0, max=0;
    for (const b of pads) {
      const d=distance(x,z,b);
      if (!d) return b.level;
      const w=ease(1-d/b.feather);
      total+=b.level*w; weight+=w; max=Math.max(w,max);
    }
    return weight ? y+(total/weight-y)*max : y;
  }

  function detailCuts(bounds,axis) {
    return pads.filter(b=>overlaps(bounds,grow(b,b.feather))).flatMap(b=>axis===0
      ? [b.west,b.east] : [b.south,b.north]);
  }

  function relocate(root) {
    const site=siteMap.get(root?.metadata?.id);
    if (!site) return root;
    if (root.position.asArray().some((value,i)=>Math.abs(value-site.from[i])>.04))
      throw Error('Relocation requires the measured '+site.id+' anchor');
    const nodes=[root,...root.getDescendants()];
    const frozen=nodes.map(node=>node.isWorldMatrixFrozen);
    for (const node of nodes) node.unfreezeWorldMatrix();
    root.position.set(...site.to);
    root.metadata.anchor={...root.metadata.anchor,x:site.to[0],z:site.to[2]};
    root.metadata.dipylonView={from:site.from,to:site.to};
    if (site.id==='new-council') root.metadata.newBouleuterion.floorWorld=councilFloor;
    nodes.forEach((node,i)=>{node.computeWorldMatrix(true);if(frozen[i])node.freezeWorldMatrix();});
    return root;
  }

  function remapFootprints(rows) {
    return rows.map(row=>{
      const id=String(row.id).replace(/^agora:/,'').replace(/:pi-\d+$/,'');
      const b=siteMap.get(id)?.bounds;
      if (!b) return row;
      return {...row,x:(b.west+b.east)/2,z:(b.south+b.north)/2,w:b.east-b.west,d:b.north-b.south,rotation:0};
    });
  }

  function refitProbes(rows, original) {
    return rows.map(row=>{
      const site=siteMap.get(row.padId==='agora-painted-stoa-relocated-floor'?'painted-stoa':row.padId);
      if (!site) return row;
      const x=row.x+site.dx,z=row.z+site.dz;
      const floor=site.to[1];
      return {...row,x,z,floor,bed:floor-.06,original:original(x,z)};
    });
  }

  function fitZone(zone) {
    if (zone.id!=='north-approach') return zone;
    const placements=[[-115.65,111.7],[-115.9,120.3],[-79.25,108.1]];
    return {...zone,trees:zone.trees.map((tree,index)=>{
      const at=placements[index];
      return at?{...tree,x:at[0],z:at[1]}:tree;
    })};
  }

  function civicPath(path) {
    if (path.id!=='civic-walk') return path;
    return {...path,points:[
      [-136.8,139],[-132.1,139],[-129.55,139],[-130.5,129.6],[-124.2,125.5],
      [-127.7,124.5],[-127.7,113],[-127.7,99.5],[-126,87],[-126.1,76],
      [-129,64.5],[-139,62.5],[-144.3,59],[-150,51],[-156,40],[-160,35.5],
    ]};
  }

  function shopperStops(id, waypoints) {
    return id==='north-shopper'
      ? [[-87.9,109.4,0],[-77.8,110.35],[-75.7,114.3,Math.PI],[-77.8,110.35]]
      : waypoints;
  }

  function reseatCouncilOlive(scene, heightAt) {
    const root=scene.getMeshByName('olive_redesign_olive_0');
    if (!root?.isEnabled()) return;
    const x=-169.2,z=82.7,height=heightAt(x,z);
    if (!Number.isFinite(height)) return;
    const current=root.getAbsolutePosition();
    const nodes=[root,...root.getDescendants()],frozen=nodes.map(node=>node.isWorldMatrixFrozen);
    const bottom=Math.min(...root.getChildMeshes().filter(mesh=>mesh.getTotalVertices()).map(mesh=>{
      mesh.computeWorldMatrix(true);
      return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
    }));
    if (!Number.isFinite(bottom)) return;
    nodes.forEach(node=>node.unfreezeWorldMatrix());
    root.setAbsolutePosition(new root.position.constructor(x,current.y+height-bottom-.04,z));
    nodes.forEach((node,i)=>{node.computeWorldMatrix(true);if(frozen[i])node.freezeWorldMatrix();});
  }

  return { sites:[...siteMap.values()],areas,detailCuts,grade,relocate,remapFootprints,refitProbes,
    councilOrigin,councilDoors,councilFloor,shiftCouncil,councilCourt,court,zeusFront,councilWalk,marketLane,
    fitZone,civicPath,shopperStops,reseatCouncilOlive };
})();
