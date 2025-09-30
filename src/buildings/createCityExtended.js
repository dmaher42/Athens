import * as THREE from 'three';
import { loadMaterials } from '../materials/library.js';
import { createTemple } from './temple.js';
import { createStoa } from './stoa.js';
import { createTheater } from './theater.js';
import { createHouseBlock } from './houses.js';
import { createCityWalls, createGate } from './gatesWalls.js';
import { snapGroupToGround, sampleGroundY } from '../physics/groundProject.js';
import { markGround, collectGround } from '../physics/groundRegistry.js';
import { createTholos } from './tholos.js';
import { createStadium } from './stadium.js';
import { createPort } from './port.js';

export async function createCityExtended({ renderer, scene, layout = 'classic', layoutConfig = {} } = {}) {
  const materials = await loadMaterials(renderer);
  const root = new THREE.Group();
  root.name = 'AthensCity_Extended';

  if (scene && typeof scene.add === 'function') {
    scene.add(root);
  }

  markGround(scene ?? root);
  const groundMeshes = collectGround(scene ?? root);

  if (layout === 'athensPlan') {
    // CITYPLAN_START
    const PRESET = {
      Agora: { x: -40, y: 'ground', z: 30 },
      Stoa_of_Attalos: { x: -20, y: 'ground', z: 20 },
      Tholos: { x: -48, y: 'ground', z: 18 },
      Theater_of_Dionysus: { x: 35, y: 'ground', z: 15 },
      Stadium: { x: 80, y: 'ground', z: 10 },
      CityGate_South: { x: 10, y: 'ground', z: 110 },
      Port_Quay_A: { x: 10, y: 'ground', z: 160 }
    };

    const plateauHeight = typeof scene?.userData?.acropolis?.plateauHeight === 'number'
      ? scene.userData.acropolis.plateauHeight
      : null;

    const resolveConfigEntry = (key) => {
      const preset = PRESET[key] ? { ...PRESET[key] } : {};
      const override = layoutConfig?.[key];
      if (override instanceof THREE.Vector3) {
        return { x: override.x, y: override.y, z: override.z };
      }
      if (Array.isArray(override)) {
        const [ox = preset.x ?? 0, oy = preset.y ?? 0, oz = preset.z ?? 0] = override;
        return { x: ox, y: oy, z: oz };
      }
      if (override && typeof override === 'object') {
        return { ...preset, ...override };
      }
      if (typeof override === 'number') {
        return { ...preset, y: override };
      }
      return preset;
    };

    const resolvePosition = (key, fallback = new THREE.Vector3()) => {
      const config = resolveConfigEntry(key);
      const position = fallback.clone();
      const x = typeof config.x === 'number' ? config.x : fallback.x;
      const z = typeof config.z === 'number' ? config.z : fallback.z;
      let yValue = config.y;
      if (yValue === 'ground' && groundMeshes.length) {
        const sampled = sampleGroundY(x, z, groundMeshes, { fromY: 400 });
        if (typeof sampled === 'number') {
          yValue = sampled;
        } else {
          yValue = fallback.y;
        }
      } else if (yValue === 'acropolis' && typeof plateauHeight === 'number') {
        yValue = plateauHeight;
      } else if (typeof yValue !== 'number') {
        yValue = fallback.y ?? 0;
      }
      position.set(x, yValue ?? 0, z);
      return position;
    };

    const applyLayoutToExisting = (key) => {
      const target = scene?.getObjectByName?.(key);
      if (!target) {
        return;
      }
      const currentPosition = target.position instanceof THREE.Vector3 ? target.position : new THREE.Vector3();
      const desired = resolvePosition(key, currentPosition);
      target.position.copy(desired);
      target.updateMatrixWorld?.();
    };

    applyLayoutToExisting('Agora');

    const heph = createTemple(materials, {
      footprint: [22, 45],
      columns: [6, 13],
      position: new THREE.Vector3(-60, 0, 45),
      groundMeshes
    });
    heph.name = 'Temple_of_Hephaestus';
    root.add(heph);

    const stoaPosition = resolvePosition('Stoa_of_Attalos', new THREE.Vector3(80, 0, -40));
    const stoa = createStoa(materials, {
      length: 120,
      depth: 16,
      colSpacing: 5,
      position: stoaPosition,
      groundMeshes
    });
    stoa.name = 'Stoa_of_Attalos';
    root.add(stoa);

    const tholosPosition = resolvePosition('Tholos');
    const tholos = createTholos(materials, { position: tholosPosition });
    root.add(tholos);

    const theaterPosition = resolvePosition('Theater_of_Dionysus', new THREE.Vector3(150, 0, 120));
    const theater = createTheater(materials, {
      radius: 55,
      steps: 18,
      position: theaterPosition,
      groundMeshes
    });
    theater.name = 'Theater_of_Dionysus';
    root.add(theater);

    const stadiumPosition = resolvePosition('Stadium');
    const stadium = createStadium(materials, { position: stadiumPosition });
    root.add(stadium);

    const housesNW = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: new THREE.Vector3(-90, 0, -60),
      groundMeshes
    });
    housesNW.name = 'Houses_NW';
    root.add(housesNW);

    const housesNE = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: new THREE.Vector3(40, 0, -80),
      groundMeshes
    });
    housesNE.name = 'Houses_NE';
    root.add(housesNE);

    const wallPath = [
      new THREE.Vector3(-220, 0, -200),
      new THREE.Vector3(220, 0, -200),
      new THREE.Vector3(220, 0, 220),
      new THREE.Vector3(-220, 0, 220),
      new THREE.Vector3(-220, 0, -200)
    ];
    const walls = createCityWalls(materials, {
      path: wallPath,
      towerEvery: 120,
      height: 9,
      thickness: 4,
      groundMeshes
    });
    walls.name = 'CityWalls';
    root.add(walls);

    const gatePosition = resolvePosition('CityGate_South', new THREE.Vector3(0, 0, -200));
    const gate = createGate(materials, {
      width: 10,
      height: 8,
      position: gatePosition,
      facingYaw: 0,
      thickness: 4,
      groundMeshes
    });
    gate.name = 'CityGate_South';
    root.add(gate);

    const portPosition = resolvePosition('Port_Quay_A');
    const port = createPort(materials, { position: portPosition });
    root.add(port);
    // CITYPLAN_END
  } else {
    const heph = createTemple(materials, {
      footprint: [22, 45],
      columns: [6, 13],
      position: new THREE.Vector3(-60, 0, 30),
      groundMeshes
    });
    heph.name = 'Temple_of_Hephaestus';
    root.add(heph);

    const stoa = createStoa(materials, {
      length: 120,
      depth: 16,
      colSpacing: 5,
      position: new THREE.Vector3(80, 0, -40),
      groundMeshes
    });
    stoa.name = 'Stoa_of_Attalos';
    root.add(stoa);

    const theater = createTheater(materials, {
      radius: 55,
      steps: 18,
      position: new THREE.Vector3(150, 0, 120),
      groundMeshes
    });
    theater.name = 'Theater_of_Dionysus';
    root.add(theater);

    const housesNW = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: new THREE.Vector3(40, 0, -100),
      groundMeshes
    });
    housesNW.name = 'Houses_NW';
    root.add(housesNW);

    const housesNE = createHouseBlock(materials, {
      rows: 3,
      cols: 4,
      spacing: 14,
      position: new THREE.Vector3(120, 0, -100),
      groundMeshes
    });
    housesNE.name = 'Houses_NE';
    root.add(housesNE);

    const wallPath = [
      new THREE.Vector3(-220, 0, -200),
      new THREE.Vector3(220, 0, -200),
      new THREE.Vector3(220, 0, 220),
      new THREE.Vector3(-220, 0, 220),
      new THREE.Vector3(-220, 0, -200)
    ];
    const walls = createCityWalls(materials, {
      path: wallPath,
      towerEvery: 120,
      height: 9,
      thickness: 4,
      groundMeshes
    });
    walls.name = 'CityWalls';
    root.add(walls);

    const gate = createGate(materials, {
      width: 10,
      height: 8,
      position: new THREE.Vector3(0, 0, -200),
      facingYaw: 0,
      thickness: 4,
      groundMeshes
    });
    gate.name = 'CityGate_North';
    root.add(gate);
  }

  root.children.forEach((child) => {
    if (!groundMeshes.length) return;
    snapGroupToGround(child, groundMeshes, { hover: 0.03 });
  });

  return { root, materials };
}

export default createCityExtended;
