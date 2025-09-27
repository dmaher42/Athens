export * from 'three';
import * as THREE from 'three';

const threeReady = Promise.resolve(THREE);

export { THREE, threeReady };
export default THREE;
