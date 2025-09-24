import * as THREE from 'three';

const GROUND_SIZE = 10000;
const TEXTURE_REPEAT = 100;
const OVERLAY_OPACITY = 0.4;
const FALLBACK_COLOR = 0x808040;

function configureRepeatingTexture(texture, repeats, anisotropy, colorSpace) {
  if (!texture) return;

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.anisotropy = Math.max(texture.anisotropy ?? 0, anisotropy);
  texture.colorSpace = colorSpace;
  if (typeof texture.updateMatrix === 'function') {
    texture.updateMatrix();
  }
  texture.needsUpdate = true;
}

function loadTexture(loader, url, warningMessage) {
  return new Promise((resolve) => {
    const onLoad = (texture) => resolve(texture);
    const onError = (error) => {
      console.warn(warningMessage, error);
      resolve(null);
    };

    try {
      loader.load(url, onLoad, undefined, onError);
    } catch (error) {
      onError(error);
    }
  });
}

function updateOverlayUniforms(material) {
  const uniforms = material.userData?.overlayUniforms;

  if (!uniforms) return;

  const texture = material.userData.overlayTexture ?? null;
  const opacity = material.userData.overlayOpacity ?? (texture ? OVERLAY_OPACITY : 0);

  if (uniforms.overlayOpacity) {
    uniforms.overlayOpacity.value = opacity;
  }

  if (uniforms.overlayMap) {
    uniforms.overlayMap.value = texture;
  }

  if (uniforms.overlayMapTransform?.value) {
    if (texture) {
      if (typeof texture.updateMatrix === 'function') {
        texture.updateMatrix();
      }
      uniforms.overlayMapTransform.value.copy(texture.matrix);
    } else {
      uniforms.overlayMapTransform.value.identity();
    }
  }
}

function injectOverlayShader(material) {
  material.userData = material.userData || {};

  if (material.userData.overlayShaderApplied) {
    updateOverlayUniforms(material);
    return;
  }

  if (!material.userData.baseCustomProgramCacheKey) {
    material.userData.baseCustomProgramCacheKey = material.customProgramCacheKey;
  }

  const baseCustomProgramCacheKey = material.userData.baseCustomProgramCacheKey;

  material.onBeforeCompile = (shader) => {
    const overlayTexture = material.userData.overlayTexture ?? null;

    shader.uniforms.overlayOpacity = {
      value: material.userData.overlayOpacity ?? OVERLAY_OPACITY
    };
    shader.uniforms.overlayMap = {
      value: overlayTexture
    };
    shader.uniforms.overlayMapTransform = {
      value: new THREE.Matrix3()
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <uv_pars_vertex>',
        '#include <uv_pars_vertex>\n#ifdef USE_OVERLAY_TEXTURE\nvarying vec2 vOverlayUv;\nuniform mat3 overlayMapTransform;\n#endif\n'
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n#ifdef USE_OVERLAY_TEXTURE\n  #ifdef USE_UV\n    vec3 overlayUv = vec3( uv, 1.0 );\n    vOverlayUv = ( overlayMapTransform * overlayUv ).xy;\n  #else\n    vOverlayUv = vec2( 0.0 );\n  #endif\n#endif\n`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\n#ifdef USE_OVERLAY_TEXTURE\nuniform sampler2D overlayMap;\nuniform float overlayOpacity;\nvarying vec2 vOverlayUv;\n#endif\n'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n#ifdef USE_OVERLAY_TEXTURE\n  vec4 overlayColor = texture2D( overlayMap, vOverlayUv );\n  diffuseColor.rgb = mix( diffuseColor.rgb, overlayColor.rgb, overlayOpacity );\n  diffuseColor.a = 1.0;\n#endif\n`
      );

    shader.defines = shader.defines || {};

    if (overlayTexture) {
      shader.defines.USE_OVERLAY_TEXTURE = 1;
    } else {
      delete shader.defines.USE_OVERLAY_TEXTURE;
    }

    material.userData.overlayUniforms = shader.uniforms;
    updateOverlayUniforms(material);
  };

  material.customProgramCacheKey = function () {
    const baseKey = typeof baseCustomProgramCacheKey === 'function'
      ? baseCustomProgramCacheKey.call(this)
      : baseCustomProgramCacheKey ?? 'ground';
    const overlayState = this.userData?.overlayTexture ? 'overlay-on' : 'overlay-off';
    return `${baseKey}-overlay-${overlayState}`;
  };

  material.userData.overlayShaderApplied = true;
  material.needsUpdate = true;
}

function applyOverlayTexture(material, texture, opacity) {
  if (!material) return;

  material.userData = material.userData || {};
  material.userData.overlayOpacity = opacity;
  material.userData.overlayTexture = texture ?? null;

  material.transparent = false;
  material.opacity = 1;

  injectOverlayShader(material);

  updateOverlayUniforms(material);

  material.needsUpdate = true;
}

export async function loadGround(scene, renderer) {
  const loader = new THREE.TextureLoader();
  const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  const material = new THREE.MeshStandardMaterial({
    color: FALLBACK_COLOR,
    roughness: 1,
    metalness: 0
  });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  const grassTextureUrl = new URL('../../public/assets/textures/grass.jpg', import.meta.url).href;
  const dustTextureUrl = new URL('../../public/assets/textures/athens_dust.jpg', import.meta.url).href;

  const [grassTexture, dustTexture] = await Promise.all([
    loadTexture(loader, grassTextureUrl, '[ground] grass.jpg not found; using flat color.'),
    loadTexture(loader, dustTextureUrl, '[ground] athens_dust.jpg not found; alpha blend disabled.')
  ]);

  if (grassTexture) {
    configureRepeatingTexture(grassTexture, TEXTURE_REPEAT, anisotropy, THREE.SRGBColorSpace);
    material.map = grassTexture;
    material.color.set(0xffffff);
  }

  if (dustTexture) {
    configureRepeatingTexture(dustTexture, TEXTURE_REPEAT, anisotropy, THREE.SRGBColorSpace);
    applyOverlayTexture(material, dustTexture, OVERLAY_OPACITY);
  } else {
    applyOverlayTexture(material, null, 0);
  }

  material.needsUpdate = true;

  if (scene && !scene.children.includes(ground)) {
    scene.add(ground);
  }

  return ground;
}
