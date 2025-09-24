import * as THREE from 'three';

export function createGround(scene) {
  const textureLoader = new THREE.TextureLoader();

  // Load Athens dirt texture
  const dirtTexture = textureLoader.load('assets/textures/athens_dirt.jpg');
  dirtTexture.wrapS = dirtTexture.wrapT = THREE.RepeatWrapping;
  dirtTexture.repeat.set(6, 6);

  // Grass material (vivid green)
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x32CD32, // Lime green
    roughness: 1.0,
    metalness: 0.0
  });

  // Dirt material (textured)
  const dirtMaterial = new THREE.MeshStandardMaterial({
    map: dirtTexture,
    roughness: 1.0,
    metalness: 0.0
  });

  // Grass zone
  const grassGeometry = new THREE.PlaneGeometry(50, 50);
  const grassMesh = new THREE.Mesh(grassGeometry, grassMaterial);
  grassMesh.rotation.x = -Math.PI / 2;
  grassMesh.position.set(-25, 0, 0); // Left side
  grassMesh.receiveShadow = true;

  // Dirt zone
  const dirtGeometry = new THREE.PlaneGeometry(50, 50);
  const dirtMesh = new THREE.Mesh(dirtGeometry, dirtMaterial);
  dirtMesh.rotation.x = -Math.PI / 2;
  dirtMesh.position.set(25, 0, 0); // Right side
  dirtMesh.receiveShadow = true;

  // Add both to scene
  scene.add(grassMesh, dirtMesh);
}
