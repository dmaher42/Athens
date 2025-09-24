import * as THREE from 'three';

const GROUND_SIZE = 10000;
const TEXTURE_REPEAT = 100;
const OVERLAY_OPACITY = 0.4;
const FALLBACK_COLOR = 0x808040;
const DISTRICT_BIAS_TEXTURE_SIZE = 1024;
const DISTRICT_BIAS_STRENGTH = 0.5;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function ensureOverlayBiasState(material) {
  if (!material) {
    return;
  }

  material.userData = material.userData || {};

  if (typeof material.userData.overlayBiasToggle !== 'number') {
    material.userData.overlayBiasToggle = 1;
  }

  if (
    !material.userData.overlayBiasWorldSize ||
    !(material.userData.overlayBiasWorldSize instanceof THREE.Vector2)
  ) {
    material.userData.overlayBiasWorldSize = new THREE.Vector2(GROUND_SIZE, GROUND_SIZE);
  }
}

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

function createDistrictBiasSampler({
  getDustBiasAt,
  size = DISTRICT_BIAS_TEXTURE_SIZE,
  worldSize = GROUND_SIZE
} = {}) {
  if (typeof document === 'undefined' || typeof getDustBiasAt !== 'function') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const imageData = context.createImageData(size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  if (texture.colorSpace !== undefined && THREE.LinearSRGBColorSpace !== undefined) {
    texture.colorSpace = THREE.LinearSRGBColorSpace;
  }

  const sampler = {
    size,
    canvas,
    context,
    imageData,
    texture,
    worldSize,
    getDustBiasAt
  };

  sampler.refresh = () => {
    if (typeof sampler.getDustBiasAt !== 'function') {
      return;
    }

    const data = imageData.data;
    let index = 0;

    for (let y = 0; y < size; y++) {
      const v = size > 1 ? y / (size - 1) : 0;
      const worldZ = (v - 0.5) * worldSize;

      for (let x = 0; x < size; x++) {
        const u = size > 1 ? x / (size - 1) : 0;
        const worldX = (u - 0.5) * worldSize;
        const bias = clamp01(sampler.getDustBiasAt(worldX, worldZ));
        const value = Math.round(bias * 255);
        data[index++] = value;
        data[index++] = value;
        data[index++] = value;
        data[index++] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
    texture.needsUpdate = true;
  };

  sampler.rebuild = (fn) => {
    if (typeof fn === 'function') {
      sampler.getDustBiasAt = fn;
    }

    sampler.refresh();
  };

  sampler.dispose = () => {
    if (sampler.texture) {
      sampler.texture.dispose();
    }
  };

  sampler.refresh();

  return sampler;
}

function applyOverlayBiasSampler(material, sampler, { worldSize = GROUND_SIZE } = {}) {
  if (!material) {
    return;
  }

  ensureOverlayBiasState(material);

  material.userData.overlayBiasSampler = sampler ?? null;
  material.userData.overlayBiasTexture = sampler?.texture ?? null;

  const targetSize = material.userData.overlayBiasWorldSize;
  if (targetSize) {
    targetSize.set(worldSize, worldSize);
  }

  updateOverlayUniforms(material);
  material.needsUpdate = true;
}

function updateOverlayUniforms(material) {
  const uniforms = material.userData?.overlayUniforms;

  if (!uniforms) return;

  ensureOverlayBiasState(material);

  const texture = material.userData.overlayTexture ?? null;
  const opacity = material.userData.overlayOpacity ?? (texture ? OVERLAY_OPACITY : 0);
  const biasTexture = material.userData.overlayBiasTexture ?? null;

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

  if (uniforms.overlayBiasMap) {
    uniforms.overlayBiasMap.value = biasTexture;
  }

  if (uniforms.overlayBiasMapTransform?.value) {
    if (biasTexture && typeof biasTexture.updateMatrix === 'function') {
      biasTexture.updateMatrix();
      uniforms.overlayBiasMapTransform.value.copy(biasTexture.matrix);
    } else {
      uniforms.overlayBiasMapTransform.value.identity();
    }
  }

  if (uniforms.overlayBiasWorldSize && material.userData.overlayBiasWorldSize) {
    uniforms.overlayBiasWorldSize.value.copy(material.userData.overlayBiasWorldSize);
  }

  if (uniforms.overlayBiasToggle) {
    uniforms.overlayBiasToggle.value = material.userData.overlayBiasToggle ?? 1;
  }
}

function injectOverlayShader(material) {
  material.userData = material.userData || {};
  ensureOverlayBiasState(material);

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
    const overlayBiasTexture = material.userData.overlayBiasTexture ?? null;
    const biasWorldSize = (material.userData.overlayBiasWorldSize instanceof THREE.Vector2)
      ? material.userData.overlayBiasWorldSize.clone()
      : new THREE.Vector2(GROUND_SIZE, GROUND_SIZE);
    const biasStrength = DISTRICT_BIAS_STRENGTH.toFixed(3);

    shader.uniforms.overlayOpacity = {
      value: material.userData.overlayOpacity ?? OVERLAY_OPACITY
    };
    shader.uniforms.overlayMap = {
      value: overlayTexture
    };
    shader.uniforms.overlayMapTransform = {
      value: new THREE.Matrix3()
    };
    shader.uniforms.overlayBiasMap = {
      value: overlayBiasTexture
    };
    shader.uniforms.overlayBiasMapTransform = {
      value: new THREE.Matrix3()
    };
    shader.uniforms.overlayBiasWorldSize = {
      value: biasWorldSize
    };
    shader.uniforms.overlayBiasToggle = {
      value: material.userData.overlayBiasToggle ?? 1
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <uv_pars_vertex>',
        '#include <uv_pars_vertex>\n#ifdef USE_OVERLAY_TEXTURE\nvarying vec2 vOverlayUv;\nuniform mat3 overlayMapTransform;\n#endif\n#ifdef USE_OVERLAY_BIAS_TEXTURE\nvarying vec2 vOverlayBiasUv;\nuniform mat3 overlayBiasMapTransform;\nuniform vec2 overlayBiasWorldSize;\n#endif\n'
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n#ifdef USE_OVERLAY_TEXTURE\n  #ifdef USE_UV\n    vec3 overlayUv = vec3( uv, 1.0 );\n    vOverlayUv = ( overlayMapTransform * overlayUv ).xy;\n  #else\n    vOverlayUv = vec2( 0.0 );\n  #endif\n#endif\n#ifdef USE_OVERLAY_BIAS_TEXTURE\n  vec4 worldPos = modelMatrix * vec4( position, 1.0 );\n  vec2 biasUv = ( worldPos.xz / overlayBiasWorldSize ) + 0.5;\n  biasUv = clamp( biasUv, 0.0, 1.0 );\n  vec3 biasUv3 = vec3( biasUv, 1.0 );\n  vOverlayBiasUv = ( overlayBiasMapTransform * biasUv3 ).xy;\n#endif\n`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\n#ifdef USE_OVERLAY_TEXTURE\nuniform sampler2D overlayMap;\nuniform float overlayOpacity;\nvarying vec2 vOverlayUv;\n#endif\n#ifdef USE_OVERLAY_BIAS_TEXTURE\nuniform sampler2D overlayBiasMap;\nuniform float overlayBiasToggle;\nvarying vec2 vOverlayBiasUv;\n#endif\n'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n#ifdef USE_OVERLAY_TEXTURE\n  vec4 overlayColor = texture2D( overlayMap, vOverlayUv );\n  float overlayStrength = overlayOpacity;\n  #ifdef USE_OVERLAY_BIAS_TEXTURE\n    float biasSample = clamp( texture2D( overlayBiasMap, vOverlayBiasUv ).r, 0.0, 1.0 );\n    overlayStrength *= mix( 1.0, 1.0 + biasSample * ${biasStrength}, overlayBiasToggle );\n  #endif\n  diffuseColor.rgb = mix( diffuseColor.rgb, overlayColor.rgb, overlayStrength );\n  diffuseColor.a = 1.0;\n#endif\n`
      );

    shader.defines = shader.defines || {};

    if (overlayTexture) {
      shader.defines.USE_OVERLAY_TEXTURE = 1;
    } else {
      delete shader.defines.USE_OVERLAY_TEXTURE;
    }

    if (overlayBiasTexture) {
      shader.defines.USE_OVERLAY_BIAS_TEXTURE = 1;
    } else {
      delete shader.defines.USE_OVERLAY_BIAS_TEXTURE;
    }

    material.userData.overlayUniforms = shader.uniforms;
    updateOverlayUniforms(material);
  };

  material.customProgramCacheKey = function () {
    const baseKey = typeof baseCustomProgramCacheKey === 'function'
      ? baseCustomProgramCacheKey.call(this)
      : baseCustomProgramCacheKey ?? 'ground';
    const overlayState = this.userData?.overlayTexture ? 'overlay-on' : 'overlay-off';
    const biasState = this.userData?.overlayBiasTexture ? 'bias-on' : 'bias-off';
    return `${baseKey}-overlay-${overlayState}-bias-${biasState}`;
  };

  material.userData.overlayShaderApplied = true;
  material.needsUpdate = true;
}

function applyOverlayTexture(material, texture, opacity) {
  if (!material) return;

  material.userData = material.userData || {};
  ensureOverlayBiasState(material);
  material.userData.overlayOpacity = opacity;
  material.userData.overlayTexture = texture ?? null;

  material.transparent = false;
  material.opacity = 1;

  injectOverlayShader(material);

  updateOverlayUniforms(material);

  material.needsUpdate = true;
}

export async function loadGround(scene, renderer, options = {}) {
  const loader = new THREE.TextureLoader();
  const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const { getDustBiasAt } = options ?? {};

  const material = new THREE.MeshStandardMaterial({
    color: FALLBACK_COLOR,
    roughness: 1,
    metalness: 0
  });
  ensureOverlayBiasState(material);

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
    material.color.set(0x00ff00);
  }

  if (dustTexture) {
    configureRepeatingTexture(dustTexture, TEXTURE_REPEAT, anisotropy, THREE.SRGBColorSpace);
    applyOverlayTexture(material, dustTexture, OVERLAY_OPACITY);
  } else {
    applyOverlayTexture(material, null, 0);
  }

  let districtBiasSampler = null;
  let activeDustBias = typeof getDustBiasAt === 'function' ? getDustBiasAt : null;

  if (typeof activeDustBias === 'function') {
    districtBiasSampler = createDistrictBiasSampler({
      getDustBiasAt: activeDustBias,
      worldSize: GROUND_SIZE
    });
  }

  if (districtBiasSampler) {
    applyOverlayBiasSampler(material, districtBiasSampler, { worldSize: GROUND_SIZE });
  } else {
    applyOverlayBiasSampler(material, null, { worldSize: GROUND_SIZE });
  }

  material.needsUpdate = true;

  ground.userData = ground.userData || {};

  const setDistrictBiasSampler = (fn) => {
    if (typeof fn !== 'function') {
      activeDustBias = null;
      if (districtBiasSampler) {
        districtBiasSampler.dispose();
      }
      districtBiasSampler = null;
      applyOverlayBiasSampler(material, null, { worldSize: GROUND_SIZE });
      return;
    }

    activeDustBias = fn;

    if (districtBiasSampler) {
      districtBiasSampler.rebuild(activeDustBias);
      applyOverlayBiasSampler(material, districtBiasSampler, { worldSize: GROUND_SIZE });
      return;
    }

    const sampler = createDistrictBiasSampler({
      getDustBiasAt: activeDustBias,
      worldSize: GROUND_SIZE
    });

    if (sampler) {
      districtBiasSampler = sampler;
      applyOverlayBiasSampler(material, districtBiasSampler, { worldSize: GROUND_SIZE });
    }
  };

  const refreshDistrictBiasTexture = (fn) => {
    if (typeof fn === 'function') {
      setDistrictBiasSampler(fn);
      return;
    }

    if (districtBiasSampler) {
      districtBiasSampler.rebuild();
      applyOverlayBiasSampler(material, districtBiasSampler, { worldSize: GROUND_SIZE });
    } else if (typeof activeDustBias === 'function') {
      setDistrictBiasSampler(activeDustBias);
    }
  };

  ground.userData.refreshDistrictDustBiasTexture = refreshDistrictBiasTexture;
  ground.userData.setDistrictDustBiasEnabled = (enabled) => {
    material.userData.overlayBiasToggle = enabled ? 1 : 0;
    updateOverlayUniforms(material);
    material.needsUpdate = true;
  };
  ground.userData.isDistrictDustBiasEnabled = () => (material.userData.overlayBiasToggle ?? 1) !== 0;
  ground.userData.setDistrictDustBiasSampler = setDistrictBiasSampler;

  if (scene && !scene.children.includes(ground)) {
    scene.add(ground);
  }

  return ground;
}
