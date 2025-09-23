import * as THREE from 'three';

const globalScope = typeof globalThis !== 'undefined' ? globalThis : undefined;

if (globalScope && !globalScope.THREE) {
  try {
    globalScope.THREE = THREE;
  } catch (error) {
    console.warn('Unable to expose THREE on the global scope:', error);
  }
}

const threeReady = Promise.resolve(THREE);

export { THREE, threeReady };
export default THREE;
