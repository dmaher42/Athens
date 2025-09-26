import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAssetUrl } from '../utils/asset-paths.js';
import {
  loadTextureWithFallback,
  loadGltfWithFallback
} from '../utils/fail-soft-loaders.js';

// Load a texture and create a road mesh
export function createRoadSegment(texturePath, start, end, width = 6) {
  const loader = new THREE.TextureLoader();
  const resolvedTexture = resolveAssetUrl(texturePath);
  const texture = loadTextureWithFallback(resolvedTexture, {
    loader,
    label: 'road segment texture',
    fallbackColor: 0x6b5a45,
    onLoad: (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 1);
      tex.anisotropy = Math.max(tex.anisotropy || 0, 8);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);

  const length = start.distanceTo(end);
  const geometry = new THREE.PlaneGeometry(length, width, 1, 1);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide
  });

  const road = new THREE.Mesh(geometry, material);
  road.rotation.x = -Math.PI / 2;

  // Move road so it goes from start to end
  road.position.copy(start.clone().add(end).multiplyScalar(0.5));
  const angle = Math.atan2(end.z - start.z, end.x - start.x);
  road.rotation.y = -angle;

  road.name = 'RoadSegment';
  return road;
}

// Scatter props (torches, rocks, grass) along the road
export async function scatterPropsAlongRoad(scene, start, end, config) {
  const loader = new GLTFLoader();
  const distance = start.distanceTo(end);
  const direction = end.clone().sub(start).normalize();

  for (const key of Object.keys(config)) {
    const prop = config[key];
    const modelUrl = resolveAssetUrl(prop.model);
    const model = await loadGltfWithFallback(loader, modelUrl, {
      label: `${key} prop`
    });
    const template = model.scene || (Array.isArray(model.scenes) ? model.scenes[0] : null) || new THREE.Group();

    const interval = prop.interval || 10;
    for (let d = 0; d < distance; d += interval) {
      const pos = start.clone().add(direction.clone().multiplyScalar(d));

      // Offset to left/right of the road
      const sideOffset = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random());
      const offset = new THREE.Vector3(-direction.z, 0, direction.x)
        .normalize()
        .multiplyScalar(sideOffset);

      const instance = template.clone(true);
      instance.position.copy(pos.clone().add(offset));

      // Random rotation & scaling
      instance.rotation.y = Math.random() * Math.PI * 2;
      if (prop.randomScale) {
        const s =
          prop.randomScale[0] +
          Math.random() * (prop.randomScale[1] - prop.randomScale[0]);
        instance.scale.set(s, s, s);
      }

      scene.add(instance);
    }
  }
}

// Debug helper: creates a test road with scattered props
window.scatterTest = async function () {
  if (!window.scene) {
    console.error('No scene found on window.');
    return;
  }

  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(50, 0, 0);

  const road = createRoadSegment('assets/roads/road_texture.jpg', start, end);
  window.scene.add(road);

  const config = {
    torch: {
      model: 'assets/props/torch.glb',
      interval: 15
    },
    rock: {
      model: 'assets/props/rock.glb',
      interval: 6,
      randomScale: [0.8, 1.5]
    },
    grass: {
      model: 'assets/props/grass.glb',
      interval: 3,
      randomScale: [0.5, 1.2]
    }
  };

  await scatterPropsAlongRoad(window.scene, start, end, config);
  console.log('Scatter test complete!');
};
