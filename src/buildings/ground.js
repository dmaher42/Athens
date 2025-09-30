import * as THREE from 'three';
import { loadGrassMaterial } from '../materials/groundGrass.js';

function cloneMaterial(source, fallbackColor = 0xffffff) {
  if (source && typeof source.clone === 'function') {
    const material = source.clone();
    if (source.map) {
      material.map = source.map.clone();
      material.map.needsUpdate = true;
    }
    return material;
  }
  return new THREE.MeshStandardMaterial({ color: fallbackColor });
}

function setTextureRepeat(material, repeatX = 1, repeatY = 1) {
  if (material?.map) {
    material.map.repeat.set(repeatX, repeatY);
    material.map.needsUpdate = true;
  }
}

// ACROPOLIS_START
function normalizeVector3(value, fallback = new THREE.Vector3()) {
  if (value instanceof THREE.Vector3) {
    return value.clone();
  }
  if (Array.isArray(value)) {
    const [x = 0, y = 0, z = 0] = value;
    return new THREE.Vector3(x ?? 0, y ?? 0, z ?? 0);
  }
  if (value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
    return new THREE.Vector3(value.x ?? 0, value.y ?? 0, value.z ?? 0);
  }
  return fallback.clone();
}

function buildDebugHelpers(parent, acropolisCenter, plateauRadius, plateauHeight) {
  if (!parent) {
    return;
  }

  const helperSize = Math.max(plateauRadius, 10);
  const axesHelper = new THREE.AxesHelper(helperSize);
  axesHelper.position.set(acropolisCenter.x, 0, acropolisCenter.z);
  axesHelper.name = 'AcropolisDebugAxes';
  parent.add(axesHelper);

  const segments = 64;
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(theta) * plateauRadius, 0, Math.sin(theta) * plateauRadius));
  }
  const circleGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const circleMaterial = new THREE.LineBasicMaterial({ color: 0xffaa00 });
  const circle = new THREE.LineLoop(circleGeometry, circleMaterial);
  circle.position.set(acropolisCenter.x, plateauHeight + 0.05, acropolisCenter.z);
  circle.name = 'AcropolisDebugPlateau';
  parent.add(circle);
}

function buildAcropolisMesa(scene, materials, options) {
  const {
    acropolisCenter: acropolisCenterOption = [0, 0, 0],
    plateauHeight: plateauHeightOption = 28,
    plateauRadius: plateauRadiusOption = 65,
    terraces: terracesOption = 3,
    terraceDrop: terraceDropOption = 6,
    terraceRadiusStep: terraceRadiusStepOption = 22,
    rampWidth: rampWidthOption = 14,
    rampSlope: rampSlopeOption = 0.55,
    rampYawDeg: rampYawDegOption = 210,
    rampLength: rampLengthOption = 110,
    debugAcropolis = false,
  } = options ?? {};

  const acropolisCenter = normalizeVector3(acropolisCenterOption, new THREE.Vector3());
  acropolisCenter.y = 0;

  const plateauHeight = typeof plateauHeightOption === 'number' ? plateauHeightOption : 28;
  const plateauRadius = typeof plateauRadiusOption === 'number' ? plateauRadiusOption : 65;
  const terraces = Math.max(1, Math.floor(typeof terracesOption === 'number' ? terracesOption : 3));
  const terraceDrop = Math.max(0.1, typeof terraceDropOption === 'number' ? terraceDropOption : 6);
  const terraceRadiusStep = typeof terraceRadiusStepOption === 'number' ? terraceRadiusStepOption : 22;
  const rampWidth = Math.max(1, typeof rampWidthOption === 'number' ? rampWidthOption : 14);
  const rampSlope = Math.max(0, typeof rampSlopeOption === 'number' ? rampSlopeOption : 0.55);
  const rampYawDeg = typeof rampYawDegOption === 'number' ? rampYawDegOption : 210;
  const rampLength = Math.max(1, typeof rampLengthOption === 'number' ? rampLengthOption : 110);

  const acropolisGroup = new THREE.Group();
  acropolisGroup.name = 'AcropolisGroup';

  const terraceMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  terraceMaterial.name = 'AcropolisTerraceMaterial';
  setTextureRepeat(terraceMaterial, plateauRadius / 3, plateauRadius / 3);

  const baseExtraHeight = Math.max(plateauHeight - terraces * terraceDrop, 0);

  for (let i = terraces - 1; i >= 0; i -= 1) {
    const stepTop = plateauHeight - i * terraceDrop;
    const extraHeight = i === terraces - 1 ? baseExtraHeight : 0;
    const stepHeight = terraceDrop + extraHeight;
    const radius = plateauRadius + i * terraceRadiusStep;
    const stepBottom = stepTop - stepHeight;

    const geometry = new THREE.CylinderGeometry(radius, radius, stepHeight, 48, 1, false);
    const mesh = new THREE.Mesh(geometry, terraceMaterial);
    mesh.name = `AcropolisTerrace:${terraces - i}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = stepBottom + stepHeight / 2;
    acropolisGroup.add(mesh);
  }

  const dustRingMaterial = cloneMaterial(materials.dust, 0xb89c7a);
  dustRingMaterial.side = THREE.DoubleSide;
  setTextureRepeat(dustRingMaterial, (plateauRadius * 2) / 80, (plateauRadius * 2) / 80);
  const ringInnerRadius = plateauRadius * 1.2;
  const ringExpansion = Math.max(Math.abs(terraces * terraceRadiusStep), rampWidth * 2);
  const ringOuterRadius = plateauRadius + ringExpansion;
  const dustRing = new THREE.Mesh(new THREE.RingGeometry(ringInnerRadius, ringOuterRadius, 64), dustRingMaterial);
  dustRing.name = 'AcropolisDustRing';
  dustRing.rotation.x = -Math.PI / 2;
  dustRing.position.y = 0.05;
  dustRing.receiveShadow = true;
  acropolisGroup.add(dustRing);

  const rockMaterial = cloneMaterial(materials.rock ?? materials.dust, 0x7a6650);
  if (!materials.rock && rockMaterial.color) {
    rockMaterial.color.offsetHSL(0, 0, -0.08);
  }
  rockMaterial.name = 'AcropolisRampMaterial';

  const rampHeight = terraces * terraceDrop + 2;
  const rampGeometry = new THREE.BoxGeometry(rampWidth, rampHeight, rampLength);
  const ramp = new THREE.Mesh(rampGeometry, rockMaterial);
  ramp.name = 'AcropolisRamp';
  ramp.castShadow = true;
  ramp.receiveShadow = true;

  const yaw = THREE.MathUtils.degToRad(rampYawDeg % 360);
  const pitch = Math.atan(rampSlope);
  ramp.rotation.order = 'YXZ';
  ramp.rotation.y = yaw;
  ramp.rotation.x = -pitch;

  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (dir.lengthSq() === 0) {
    dir.set(0, 0, 1);
  }
  dir.normalize();

  const topDistance = Math.max(plateauRadius - rampWidth * 0.5, 0);
  const horizontalCenterDistance = topDistance - rampLength / 2;
  const horizontalOffset = dir.clone().multiplyScalar(horizontalCenterDistance);

  const rampTopOffsetY = (rampHeight / 2) * Math.cos(pitch) + (rampLength / 2) * Math.sin(pitch);
  const embedBias = 0.6;
  const rampCenterY = plateauHeight - rampTopOffsetY + embedBias;

  ramp.position.set(horizontalOffset.x, rampCenterY, horizontalOffset.z);

  acropolisGroup.add(ramp);

  acropolisGroup.position.set(acropolisCenter.x, 0, acropolisCenter.z);

  acropolisGroup.userData.acropolisCenter = acropolisCenter.clone();
  acropolisGroup.userData.plateauHeight = plateauHeight;

  if (scene) {
    const acropolisData = {
      center: acropolisCenter.clone(),
      plateauHeight,
    };
    scene.userData = scene.userData ?? {};
    scene.userData.acropolis = acropolisData;
  }

  if (debugAcropolis) {
    if (scene) {
      buildDebugHelpers(scene, acropolisCenter, plateauRadius, plateauHeight);
    } else {
      buildDebugHelpers(acropolisGroup, new THREE.Vector3(0, 0, 0), plateauRadius, plateauHeight);
    }
  }

  return {
    group: acropolisGroup,
    acropolisCenter: acropolisCenter.clone(),
    plateauHeight,
  };
}

// ACROPOLIS_END

// ACROPOLIS_START

/**
 * @typedef {Object} GroundOptions
 * @property {THREE.Vector3|number[]} [acropolisCenter=[0,0,0]]
 * @property {number} [plateauHeight=28]
 * @property {number} [plateauRadius=65]
 * @property {number} [terraces=3]
 * @property {number} [terraceDrop=6]
 * @property {number} [terraceRadiusStep=22]
 * @property {number} [rampWidth=14]
 * @property {number} [rampSlope=0.55]
 * @property {number} [rampYawDeg=210]
 * @property {number} [rampLength=110]
 * @property {boolean} [debugAcropolis=false]
 */

// ACROPOLIS_END

export async function createGround(sceneOrMaterials = {}, materialsOrOptions = {}, maybeOptions = {}) {
  let scene = null;
  let materials = {};
  let options = {};

  if (sceneOrMaterials?.isScene) {
    scene = sceneOrMaterials;
    materials = materialsOrOptions ?? {};
    options = maybeOptions ?? {};
  } else {
    materials = sceneOrMaterials ?? {};
    options = materialsOrOptions ?? {};
    if (options.scene?.isScene) {
      scene = options.scene;
    }
  }

  const group = new THREE.Group();
  group.name = 'Ground';

  const size = typeof options.size === 'number' ? options.size : 800;
  const repeat = typeof options.repeat === 'number' ? options.repeat : 64;

  const grassMaterial = cloneMaterial(materials.grass, 0x5a8f3a);
  setTextureRepeat(grassMaterial, repeat, repeat);
  const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), grassMaterial);
  groundPlane.name = 'Ground:MainGrass';
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  groundPlane.userData.applyGrassMaterial = async (renderer, applyOptions = {}) => {
    try {
      const appliedRepeat = typeof applyOptions.repeat === 'number' ? applyOptions.repeat : repeat;
      const material = await loadGrassMaterial(renderer, { repeat: appliedRepeat });
      if (material) {
        const previous = groundPlane.material;
        groundPlane.material = material;
        if (previous && previous !== material && typeof previous.dispose === 'function') {
          previous.dispose();
        }
      }
      return groundPlane.material;
    } catch (error) {
      console.warn('[Ground] Failed to apply grass material.', error);
      return groundPlane.material;
    }
  };
  group.add(groundPlane);

  if (options.renderer) {
    groundPlane.userData.applyGrassMaterial(options.renderer, { repeat }).catch((error) => {
      console.warn('[Ground] Grass material application deferred.', error);
    });
  }

  // ACROPOLIS_START
  const mesa = buildAcropolisMesa(scene, materials, options);
  if (mesa?.group) {
    group.add(mesa.group);
  }

  const acropolisCenter = mesa?.acropolisCenter ?? normalizeVector3(options.acropolisCenter ?? [0, 0, 0]);
  acropolisCenter.y = 0;
  const plateauHeight = typeof mesa?.plateauHeight === 'number'
    ? mesa.plateauHeight
    : (typeof options.plateauHeight === 'number' ? options.plateauHeight : 28);

  group.userData.acropolisCenter = acropolisCenter.clone();
  group.userData.plateauHeight = plateauHeight;

  return {
    group,
    acropolisGroup: mesa?.group ?? null,
    acropolisCenter: acropolisCenter.clone(),
    plateauHeight,
  };
  // ACROPOLIS_END
}
