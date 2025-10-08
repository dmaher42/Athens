import * as THREE from 'three';
import { disposeAll } from '../utils/disposable.ts';

function buildSanityGeometry() {
  const group = new THREE.Group();
  group.name = 'DevSanityGeometry';

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(60, 60, 60),
    new THREE.MeshStandardMaterial({
      color: '#f87171',
      transparent: true,
      opacity: 0.4,
      metalness: 0.1,
      roughness: 0.6
    })
  );
  box.position.set(0, 30, 0);
  box.castShadow = true;
  group.add(box);

  const boxEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(60, 60, 60)),
    new THREE.LineBasicMaterial({ color: '#f8fafc' })
  );
  boxEdges.position.copy(box.position);
  group.add(boxEdges);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.02;
  group.add(plane);

  return group;
}

function disposeSanityGeometry(group) {
  if (!group) {
    return;
  }
  group.traverse((child) => {
    if (child.isMesh || child.isLineSegments) {
      disposeAll(child.geometry);
      const { material } = child;
      if (Array.isArray(material)) {
        material.forEach((mat) => disposeAll(mat));
      } else {
        disposeAll(material);
      }
    }
  });
}

export function createSanityGeometryController(scene) {
  if (!scene || typeof scene.add !== 'function') {
    return {
      show() {
        return false;
      },
      hide() {
        return false;
      },
      toggle() {
        return false;
      },
      isVisible() {
        return false;
      },
      dispose() {}
    };
  }

  let sanityGeometry = null;

  function show() {
    if (sanityGeometry) {
      return true;
    }
    sanityGeometry = buildSanityGeometry();
    scene.add(sanityGeometry);
    return true;
  }

  function hide() {
    if (!sanityGeometry) {
      return false;
    }
    scene.remove(sanityGeometry);
    disposeSanityGeometry(sanityGeometry);
    disposeAll(sanityGeometry);
    sanityGeometry = null;
    return false;
  }

  function toggle(forceVisible) {
    if (typeof forceVisible === 'boolean') {
      return forceVisible ? show() : !hide();
    }
    return sanityGeometry ? hide() : show();
  }

  function isVisible() {
    return Boolean(sanityGeometry);
  }

  return {
    show,
    hide,
    toggle,
    isVisible,
    dispose() {
      hide();
    }
  };
}
