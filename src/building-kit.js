import * as THREE from 'three';

/** Lightweight materials (one-time) */
const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0xded7c8, roughness: 0.8, metalness: 0.0 }),
  marble: new THREE.MeshStandardMaterial({ color: 0xefeae1, roughness: 0.6, metalness: 0.05 }),
  roof:   new THREE.MeshStandardMaterial({ color: 0x9d3e26,  roughness: 0.9, metalness: 0.0 }),
  dark:   new THREE.MeshStandardMaterial({ color: 0x6b6b6b,  roughness: 0.9, metalness: 0.0 }),
};

/** Shared helpers */
const deg = (d)=> THREE.MathUtils.degToRad(d);
const add = (g, ...children)=> { children.forEach(c => g.add(c)); return g; };

/* ---------- SHAPES ---------- */

/** Peripteral temple (Parthenon / Olympieion / Hephaisteion etc.) */
export function makeTemple({
  width = 32, length = 70, colH = 11, colR = 0.7,
  colsShort = 8, colsLong = 17, steps = 3, entablatureH = 1.6,
  pedimentH = 3.5, cellaInset = 3, materials = MAT
} = {}) {
  const root = new THREE.Group();

  // Stylobate steps
  const stepH = 0.35, stepPad = 0.9;
  for (let i = 0; i < steps; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(width + (steps - i) * stepPad * 2, stepH, length + (steps - i) * stepPad * 2),
      materials.marble
    );
    s.position.y = stepH * 0.5 + i * stepH;
    root.add(s);
  }
  const baseY = steps * stepH;

  // Columns (instanced perimeter)
  const colGeo = new THREE.CylinderGeometry(colR, colR, colH, 16, 1);
  const colMat = materials.marble;
  const perimCount = 2 * colsLong + 2 * (colsShort - 2);
  const colIM = new THREE.InstancedMesh(colGeo, colMat, perimCount);
  colIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const px = width * 0.5 - 2.0, pz = length * 0.5 - 2.0;
  let idx = 0;
  const setCol = (x, z) => {
    const m = new THREE.Matrix4().makeTranslation(x, baseY + colH * 0.5, z);
    colIM.setMatrixAt(idx++, m);
  };

  // short sides
  for (let i = 0; i < colsShort; i++) {
    const t = i / (colsShort - 1);
    const x = -px + t * (2 * px);
    setCol(x, -pz); setCol(x, pz);
  }
  // long sides (skip corners)
  for (let i = 1; i < colsLong - 1; i++) {
    const t = i / (colsLong - 1);
    const z = -pz + t * (2 * pz);
    setCol(-px, z); setCol(px, z);
  }
  root.add(colIM);

  // Entablature ring
  const ent = new THREE.Mesh(
    new THREE.BoxGeometry(width + 2, entablatureH, length + 2),
    materials.marble
  );
  ent.position.y = baseY + colH + entablatureH * 0.5;
  root.add(ent);

  // Cella (naos) simple block
  const cella = new THREE.Mesh(
    new THREE.BoxGeometry(width - cellaInset * 2, colH * 0.75, length - cellaInset * 2),
    materials.stone
  );
  cella.position.set(0, baseY + (colH * 0.75) * 0.5, 0);
  root.add(cella);

  // Roof slopes
  const roofH = 2.6;
  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, roofH, (length + 1.6) / 2), materials.roof);
  const roof2 = roof1.clone();
  roof1.position.set(0, ent.position.y + entablatureH * 0.5 + roofH * 0.5, -(length / 4));
  roof2.position.set(0, roof1.position.y,  (length / 4));
  roof1.rotation.x =  deg(12);
  roof2.rotation.x = -deg(12);
  root.add(roof1, roof2);

  // Pediments (triangular)
  const pedW = width + 1.6, pedT = 1.0;
  const shape = new THREE.Shape();
  shape.moveTo(-pedW/2, 0); shape.lineTo(pedW/2, 0); shape.lineTo(0, pedimentH); shape.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(shape, { depth: pedT, bevelEnabled: false });
  const pedF = new THREE.Mesh(pedGeo, materials.marble);
  const pedB = pedF.clone();
  pedF.rotation.x = Math.PI * 0.5; pedB.rotation.x = Math.PI * 0.5;
  pedF.position.set(0, roof1.position.y + roofH * 0.5,  length * 0.5);
  pedB.position.set(0, roof1.position.y + roofH * 0.5, -length * 0.5 - pedT);
  root.add(pedF, pedB);

  return root;
}

/** Stoa (Attalos): long hall with front colonnade and lean-to roof */
export function makeStoa({ length = 110, depth = 20, colH = 9, colR = 0.6, cols = 45 } = {}) {
  const root = new THREE.Group();

  // Stylobate
  const base = new THREE.Mesh(new THREE.BoxGeometry(depth, 0.6, length), MAT.marble);
  base.position.y = 0.3;
  root.add(base);

  // Back wall
  const wall = new THREE.Mesh(new THREE.BoxGeometry(depth - 2.2, colH * 0.7, length - 2), MAT.stone);
  wall.position.set(-1.1, wall.geometry.parameters.height / 2 + 0.6, 0);
  root.add(wall);

  // Front columns (instanced)
  const colIM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(colR, colR, colH, 16, 1),
    MAT.marble,
    cols
  );
  const z0 = -length * 0.5 + 1.0, z1 = length * 0.5 - 1.0;
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1);
    const z = THREE.MathUtils.lerp(z0, z1, t);
    const m = new THREE.Matrix4().makeTranslation(depth * 0.5 - 1.2, colH * 0.5 + 0.6, z);
    colIM.setMatrixAt(i, m);
  }
  root.add(colIM);

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.2, 2.0, length + 1.2), MAT.roof);
  roof.position.set(0, colH + 2.0, 0);
  roof.rotation.z = deg(10);
  root.add(roof);

  return root;
}

/** Theatre (Dionysus/Odeon-ish) */
export function makeTheatre({ radius = 55, height = 16, steps = 24, openAngleDeg = 120 } = {}) {
  const group = new THREE.Group();
  const profile = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = THREE.MathUtils.lerp(radius * 0.35, radius, t);
    const y = t * height;
    profile.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(profile, Math.max(16, Math.floor(64 * (1 - openAngleDeg / 360))));
  const mesh = new THREE.Mesh(geo, MAT.stone);
  mesh.rotation.y = deg(openAngleDeg * 0.5);
  group.add(mesh);

  // stage rectangle
  const stage = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.8, 2, radius * 0.3), MAT.dark);
  stage.position.set(0, 1, -radius * 0.3);
  group.add(stage);

  return group;
}

/** Tholos (council dining hall) – round temple-like */
export function makeTholos({ radius = 12, colH = 6, colR = 0.45, cols = 18 } = {}) {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.6, 32), MAT.marble);
  base.position.y = 0.3; root.add(base);

  const colIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(colR, colR, colH, 16), MAT.marble, cols);
  for (let i = 0; i < cols; i++) {
    const ang = (i / cols) * Math.PI * 2;
    const x = Math.cos(ang) * (radius - 1.2);
    const z = Math.sin(ang) * (radius - 1.2);
    const m = new THREE.Matrix4().makeTranslation(x, colH * 0.5 + 0.6, z);
    colIM.setMatrixAt(i, m);
  }
  root.add(colIM);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(radius - 0.6, 3.2, 24), MAT.roof);
  roof.position.y = colH + 0.6 + 1.6;
  root.add(roof);

  return root;
}

/** Wall modules along a polyline */
export function makeWallPath(points, { segment = 6, height = 3, width = 2 } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dist = a.distanceTo(b);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), dir);

    const nSeg = Math.max(1, Math.floor(dist / segment));
    for (let s = 0; s < nSeg; s++) {
      const t0 = s / nSeg, t1 = (s + 1) / nSeg;
      const p = new THREE.Vector3().lerpVectors(a, b, (t0 + t1) / 2);
      const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, (dist / nSeg) * 0.9), MAT.stone);
      block.position.copy(p); block.quaternion.copy(quat);
      g.add(block);
    }
  }
  return g;
}

export { MAT };
