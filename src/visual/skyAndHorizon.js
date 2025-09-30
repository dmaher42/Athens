// SKYSYS_START
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function createProceduralSky(scene, renderer, { elevation = 35, azimuth = 180, turbidity = 10, rayleigh = 2, mieCoefficient = 0.005, mieDirectionalG = 0.8 } = {}) {
  const sky = new Sky();
  sky.name = 'ProceduralSky';
  sky.scale.setScalar(45000); // huge dome
  scene.add(sky);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = turbidity;
  uniforms.rayleigh.value = rayleigh;
  uniforms.mieCoefficient.value = mieCoefficient;
  uniforms.mieDirectionalG.value = mieDirectionalG;

  const sun = new THREE.Vector3();
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sun);

  // Give scene a default blue background if none set by env
  if (!scene.background) {
    renderer.setClearAlpha(1);
    renderer.setClearColor(0x87ceeb, 1);
  }
  return sky;
}

/**
 * Create an inward-facing "mountain ring" at horizon using a deformed cylinder.
 * No textures: simple gradient MeshBasicMaterial so it's always visible behind world geometry.
 */
export function createHorizonMountains({ radius = 12000, height = 1200, segments = 128, noise = 0.35, seed = 42, colorTop = 0x8fa5b3, colorBottom = 0x6c7a86 } = {}) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 2, true); // open-ended
  // Inward-facing: flip normals
  g.scale(-1, 1, 1);

  // Perturb the top rim to form peaks
  const pos = g.attributes.position;
  const rnd = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // top half vertices only
    if (y > 0) {
      const n = (rnd() - 0.5) * 2;               // [-1,1]
      const k = 1 + n * noise;                   // vary radius slightly
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
      // add some height variation near the top
      pos.setY(i, y + (n * noise * height * 0.25));
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals(); // not critical for Basic, but harmless

  // Vertical color gradient via onBeforeCompile
  const mat = new THREE.MeshBasicMaterial({ depthWrite: false, fog: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying float vY;`
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vY = position.y;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying float vY;
       vec3 colorTop = vec3(${((colorTop>>16)&255)/255}, ${((colorTop>>8)&255)/255}, ${(colorTop&255)/255});
       vec3 colorBottom = vec3(${((colorBottom>>16)&255)/255}, ${((colorBottom>>8)&255)/255}, ${(colorBottom&255)/255});`
    ).replace(
      '#include <output_fragment>',
      `
       float t = smoothstep(0.0, ${height.toFixed(1)}, vY + ${(height*0.5).toFixed(1)} );
       diffuseColor.rgb = mix(colorBottom, colorTop, t);
       #include <output_fragment>
      `
    );
  };

  const mountains = new THREE.Mesh(g, mat);
  mountains.name = 'HorizonMountains';
  mountains.position.y = height * -0.25; // sink slightly so base is below ground
  mountains.renderOrder = -1000;         // draw very early
  mountains.frustumCulled = false;
  mountains.matrixAutoUpdate = true;
  mountains.userData.isBackground = true;
  return mountains;

  // small PRNG to keep shape deterministic
  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
}
// SKYSYS_END
