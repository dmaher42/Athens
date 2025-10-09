import { existsSync } from 'node:fs';
import { mkdir, readFile, copyFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Accessor,
  Document,
  NodeIO,
  Primitive
} from '@gltf-transform/core';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_MODELS_DIR = resolve(ROOT_DIR, 'public', 'assets', 'models');
const SOURCE_MODELS_DIR = resolve(ROOT_DIR, 'models');

function ensureFloat32(array) {
  return array instanceof Float32Array ? array : new Float32Array(array);
}

function ensureUint16(array) {
  return array instanceof Uint16Array ? array : new Uint16Array(array);
}

function buildCylinder({ height, topRadius, bottomRadius, radialSegments }) {
  const segments = Math.max(3, radialSegments | 0);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = t * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const xTop = cos * topRadius;
    const zTop = sin * topRadius;
    const xBottom = cos * bottomRadius;
    const zBottom = sin * bottomRadius;

    positions.push(xTop, height, zTop);
    positions.push(xBottom, 0, zBottom);

    normals.push(cos, 0, sin);
    normals.push(cos, 0, sin);

    uvs.push(t, 1);
    uvs.push(t, 0);
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;
    indices.push(a, c, b);
    indices.push(c, d, b);
  }

  return {
    positions: ensureFloat32(positions),
    normals: ensureFloat32(normals),
    uvs: ensureFloat32(uvs),
    indices: ensureUint16(indices)
  };
}

function buildCone({ height, radius, radialSegments }) {
  const segments = Math.max(3, radialSegments | 0);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const slope = radius / Math.max(0.0001, height);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = t * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = cos * radius;
    const z = sin * radius;
    positions.push(x, 0, z);
    normals.push(cos, slope, sin);
    uvs.push(t, 0);
  }

  const apexIndex = positions.length / 3;
  positions.push(0, height, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);

  const centerIndex = apexIndex + 1;
  positions.push(0, 0, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let i = 0; i < segments; i += 1) {
    const current = i;
    const next = i + 1;
    indices.push(current, next, apexIndex);
  }

  for (let i = 0; i < segments; i += 1) {
    const current = i;
    const next = i + 1;
    indices.push(centerIndex, next, current);
  }

  return {
    positions: ensureFloat32(positions),
    normals: ensureFloat32(normals),
    uvs: ensureFloat32(uvs),
    indices: ensureUint16(indices)
  };
}

function buildSphere({ radius, widthSegments, heightSegments }) {
  const width = Math.max(3, widthSegments | 0);
  const height = Math.max(2, heightSegments | 0);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let y = 0; y <= height; y += 1) {
    const v = y / height;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let x = 0; x <= width; x += 1) {
      const u = x / width;
      const theta = u * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const nx = cosTheta * sinPhi;
      const ny = cosPhi;
      const nz = sinTheta * sinPhi;

      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, 1 - v);
    }
  }

  const vertsPerRow = width + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = y * vertsPerRow + x;
      const b = a + vertsPerRow;
      const c = b + 1;
      const d = a + 1;

      if (y > 0) {
        indices.push(a, b, d);
      }
      if (y < height - 1) {
        indices.push(d, b, c);
      }
    }
  }

  return {
    positions: ensureFloat32(positions),
    normals: ensureFloat32(normals),
    uvs: ensureFloat32(uvs),
    indices: ensureUint16(indices)
  };
}

function createPrimitive(document, buffer, geometry, material, name) {
  const positionAccessor = document
    .createAccessor(`${name}-position`, buffer)
    .setType(Accessor.Type.VEC3)
    .setArray(geometry.positions);

  const normalAccessor = document
    .createAccessor(`${name}-normal`, buffer)
    .setType(Accessor.Type.VEC3)
    .setArray(geometry.normals);

  const uvAccessor = document
    .createAccessor(`${name}-uv`, buffer)
    .setType(Accessor.Type.VEC2)
    .setArray(geometry.uvs);

  const indexAccessor = document
    .createAccessor(`${name}-indices`, buffer)
    .setType(Accessor.Type.SCALAR)
    .setArray(geometry.indices);

  return document
    .createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES)
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('NORMAL', normalAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);
}

function createCypressDocument() {
  const document = new Document();
  const buffer = document.createBuffer('cypress-buffer');
  const scene = document.createScene('CypressScene');

  const trunkMaterial = document
    .createMaterial('CypressTrunkMaterial')
    .setBaseColorFactor([0.35, 0.22, 0.14, 1])
    .setMetallicFactor(0.05)
    .setRoughnessFactor(0.85);

  const leavesMaterial = document
    .createMaterial('CypressLeavesMaterial')
    .setBaseColorFactor([0.28, 0.42, 0.26, 1])
    .setMetallicFactor(0.02)
    .setRoughnessFactor(0.75);

  const trunkGeom = buildCylinder({
    height: 2.2,
    topRadius: 0.18,
    bottomRadius: 0.24,
    radialSegments: 10
  });

  const leavesGeom = buildCone({ height: 2.6, radius: 0.9, radialSegments: 12 });

  const trunkPrimitive = createPrimitive(document, buffer, trunkGeom, trunkMaterial, 'cypress-trunk');
  const leavesPrimitive = createPrimitive(document, buffer, leavesGeom, leavesMaterial, 'cypress-leaves');

  const trunkMesh = document.createMesh('CypressTrunkMesh').addPrimitive(trunkPrimitive);
  const leavesMesh = document.createMesh('CypressLeavesMesh').addPrimitive(leavesPrimitive);

  const trunkNode = document.createNode('CypressTrunk').setMesh(trunkMesh);
  const leavesNode = document
    .createNode('CypressLeaves')
    .setMesh(leavesMesh)
    .setTranslation([0, 2.2, 0]);

  scene.addChild(trunkNode);
  scene.addChild(leavesNode);

  return document;
}

function createPlaneTreeDocument() {
  const document = new Document();
  const buffer = document.createBuffer('plane-buffer');
  const scene = document.createScene('PlaneTreeScene');

  const trunkMaterial = document
    .createMaterial('PlaneTrunkMaterial')
    .setBaseColorFactor([0.4, 0.3, 0.18, 1])
    .setMetallicFactor(0.05)
    .setRoughnessFactor(0.9);

  const canopyMaterial = document
    .createMaterial('PlaneCanopyMaterial')
    .setBaseColorFactor([0.32, 0.46, 0.27, 1])
    .setMetallicFactor(0.02)
    .setRoughnessFactor(0.72);

  const trunkGeom = buildCylinder({
    height: 1.7,
    topRadius: 0.24,
    bottomRadius: 0.32,
    radialSegments: 12
  });

  const canopyGeom = buildSphere({ radius: 1.45, widthSegments: 16, heightSegments: 12 });

  const trunkPrimitive = createPrimitive(document, buffer, trunkGeom, trunkMaterial, 'plane-trunk');
  const canopyPrimitive = createPrimitive(document, buffer, canopyGeom, canopyMaterial, 'plane-canopy');

  const trunkMesh = document.createMesh('PlaneTrunkMesh').addPrimitive(trunkPrimitive);
  const canopyMesh = document.createMesh('PlaneCanopyMesh').addPrimitive(canopyPrimitive);

  const trunkNode = document.createNode('PlaneTrunk').setMesh(trunkMesh);
  const canopyNode = document
    .createNode('PlaneCanopy')
    .setMesh(canopyMesh)
    .setTranslation([0, 2.1, 0]);

  scene.addChild(trunkNode);
  scene.addChild(canopyNode);

  return document;
}

function createOliveTreeDocument() {
  const document = new Document();
  const buffer = document.createBuffer('olive-buffer');
  const scene = document.createScene('OliveTreeScene');

  const trunkMaterial = document
    .createMaterial('OliveTrunkMaterial')
    .setBaseColorFactor([0.4, 0.3, 0.2, 1])
    .setMetallicFactor(0.04)
    .setRoughnessFactor(0.88);

  const canopyMaterial = document
    .createMaterial('OliveCanopyMaterial')
    .setBaseColorFactor([0.32, 0.45, 0.28, 1])
    .setMetallicFactor(0.02)
    .setRoughnessFactor(0.7);

  const trunkGeom = buildCylinder({
    height: 1.8,
    topRadius: 0.2,
    bottomRadius: 0.35,
    radialSegments: 12
  });

  const canopyGeom = buildSphere({ radius: 1.05, widthSegments: 18, heightSegments: 14 });

  const trunkPrimitive = createPrimitive(document, buffer, trunkGeom, trunkMaterial, 'olive-trunk');
  const canopyPrimitive = createPrimitive(document, buffer, canopyGeom, canopyMaterial, 'olive-canopy');

  const trunkMesh = document.createMesh('OliveTrunkMesh').addPrimitive(trunkPrimitive);
  const canopyMesh = document.createMesh('OliveCanopyMesh').addPrimitive(canopyPrimitive);

  const trunkNode = document.createNode('OliveTrunk').setMesh(trunkMesh);

  const primaryCanopy = document
    .createNode('OliveCanopyPrimary')
    .setMesh(canopyMesh)
    .setTranslation([0, 1.6, 0])
    .setScale([1.15, 0.85, 1.15]);

  const secondaryCanopy = document
    .createNode('OliveCanopySecondary')
    .setMesh(canopyMesh)
    .setTranslation([0.4, 1.4, -0.3])
    .setScale([0.9, 0.75, 1])
    .setRotation([0, Math.PI / 5, 0]);

  scene.addChild(trunkNode);
  scene.addChild(primaryCanopy);
  scene.addChild(secondaryCanopy);

  return document;
}

async function writeGlb(document, targetPath) {
  const io = new NodeIO();
  await mkdir(dirname(targetPath), { recursive: true });
  await io.write(targetPath, document);
  console.log(`Generated ${basename(targetPath)}`);
}

async function copyNpcModel(filename) {
  const sourcePath = join(SOURCE_MODELS_DIR, filename);
  const targetPath = join(PUBLIC_MODELS_DIR, filename);

  if (!existsSync(sourcePath)) {
    console.warn(`Missing source model: ${filename}`);
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });

  if (existsSync(targetPath)) {
    const [current, source] = await Promise.all([readFile(targetPath), readFile(sourcePath)]);
    if (current.equals(source)) {
      return;
    }
  }

  await copyFile(sourcePath, targetPath);
  console.log(`Copied ${filename}`);
}

async function copyNpcModels() {
  const entries = await readdir(SOURCE_MODELS_DIR, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'))
      .map((entry) => copyNpcModel(entry.name))
  );
}

async function main() {
  await writeGlb(createCypressDocument(), join(PUBLIC_MODELS_DIR, 'cypress.glb'));
  await writeGlb(createPlaneTreeDocument(), join(PUBLIC_MODELS_DIR, 'plane.glb'));
  await writeGlb(createOliveTreeDocument(), join(PUBLIC_MODELS_DIR, 'olive.glb'));
  await copyNpcModels();

  // The legacy README file in the public models directory was unused by runtime code
  // and bloated the production bundle. We intentionally skip recreating it here.
}

main().catch((error) => {
  console.error('Failed to generate static assets:', error);
  process.exitCode = 1;
});
