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

function injectOverlayShader(material) {
  material.userData = material.userData || {};

  if (material.userData.overlayShaderApplied) {
    const uniforms = material.userData.overlayUniforms;
    if (uniforms?.overlayOpacity) {
      uniforms.overlayOpacity.value = material.userData.overlayOpacity ?? OVERLAY_OPACITY;
    }
    return;
  }

  const existingCacheKey = material.customProgramCacheKey?.();

  material.onBeforeCompile = (shader) => {
    const hasAlphaMapUv = shader.fragmentShader.includes('vAlphaMapUv');
    const hasBaseUv = shader.fragmentShader.includes('vUv');
    const samplerFn = shader.fragmentShader.includes('texture2D( alphaMap') ? 'texture2D' : 'texture';
    const uvSelector = hasAlphaMapUv ? 'vAlphaMapUv' : hasBaseUv ? 'vUv' : 'vec2( 0.0 )';

    shader.uniforms.overlayOpacity = {
      value: material.userData.overlayOpacity ?? OVERLAY_OPACITY
    };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <alphamap_pars_fragment>',
        '#include <alphamap_pars_fragment>\nuniform float overlayOpacity;\n'
      )
      .replace(
        '#include <alphamap_fragment>',
        `#ifdef USE_ALPHAMAP\n  vec4 overlayColor = ${samplerFn}( alphaMap, ${uvSelector} );\n  diffuseColor.rgb = mix( diffuseColor.rgb, overlayColor.rgb, overlayOpacity );\n  diffuseColor.a = 1.0;\n#endif`
      );

    material.userData.overlayUniforms = shader.uniforms;
  };

  material.customProgramCacheKey = () =>
    `${existingCacheKey ?? 'ground'}-overlay-${material.userData.overlayOpacity ?? OVERLAY_OPACITY}`;

  material.userData.overlayShaderApplied = true;
  material.needsUpdate = true;
}

function applyOverlayTexture(material, texture, opacity) {
  if (!material) return;

  material.userData = material.userData || {};
  material.userData.overlayOpacity = opacity;

  if (!texture) {
    material.alphaMap = null;
    const uniforms = material.userData.overlayUniforms;
    if (uniforms?.overlayOpacity) {
      uniforms.overlayOpacity.value = 0;
    }
    return;
  }

  material.alphaMap = texture;
  material.transparent = false;
  material.opacity = 1;

  injectOverlayShader(material);

  const uniforms = material.userData.overlayUniforms;
  if (uniforms?.overlayOpacity) {
    uniforms.overlayOpacity.value = opacity;
  }

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
