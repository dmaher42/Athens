import assert from 'node:assert/strict';
import test from 'node:test';
import { mock } from 'node:test';

type ThreeModule = typeof import('three');

class FakeElement {
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  id = '';
  clientWidth = 1024;
  clientHeight = 768;

  appendChild(child: FakeElement) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child: FakeElement) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }

  contains(child: FakeElement) {
    return this.children.includes(child);
  }

  getContext(_: string) {
    return {};
  }

  addEventListener() {}
  removeEventListener() {}
}

class FakeCanvas extends FakeElement {
  width = 1024;
  height = 768;

  getContext() {
    return {};
  }
}

function createFakeContainer(): FakeElement {
  const container = new FakeElement();
  container.clientWidth = 1024;
  container.clientHeight = 768;
  return container;
}

function setupDom(three: ThreeModule) {
  const body = new FakeElement();
  const documentStub = {
    body,
    createElement(tag: string) {
      return tag === 'canvas' ? new FakeCanvas() : new FakeElement();
    },
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Document;

  const rafHandles = new Map<number, NodeJS.Timeout>();
  let rafId = 1;

  const windowStub: any = {
    devicePixelRatio: 1,
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      const id = rafId++;
      const handle = setTimeout(() => cb(0), 0);
      rafHandles.set(id, handle);
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      const handle = rafHandles.get(id);
      if (handle) {
        clearTimeout(handle);
        rafHandles.delete(id);
      }
    },
    setTimeout,
    clearTimeout,
    location: { search: '' },
    navigator: {},
    THREE: three,
    performance: { now: () => Date.now() },
  };

  (globalThis as any).window = windowStub;
  (globalThis as any).document = documentStub;
  (globalThis as any).performance = windowStub.performance;
  (globalThis as any).requestAnimationFrame = windowStub.requestAnimationFrame;
  (globalThis as any).cancelAnimationFrame = windowStub.cancelAnimationFrame;
}

function teardownDom() {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).performance;
  delete (globalThis as any).requestAnimationFrame;
  delete (globalThis as any).cancelAnimationFrame;
}

async function stubThree(): Promise<ThreeModule> {
  const THREE = await import('three');

  mock.method(THREE, 'WebGLRenderer', function WebGLRenderer(this: any) {
    this.domElement = new FakeCanvas();
    this.domElement.style = this.domElement.style || {};
    this.shadowMap = { enabled: false };
    this.autoClear = true;
    this.setClearColor = () => {};
    this.setClearAlpha = () => {};
    this.setPixelRatio = () => {};
    this.setSize = () => {};
    this.render = () => {};
    this.dispose = () => {};
    this.getContext = () => ({
      getExtension: () => null,
    });
    this.capabilities = { getMaxAnisotropy: () => 1 };
    return this;
  });

  mock.method(THREE, 'TextureLoader', function TextureLoader(this: any) {
    this.load = (
      _url: string,
      onLoad: (tex: any) => void,
      _onProgress?: () => void,
      onError?: (err: unknown) => void,
    ) => {
      try {
        const texture = new THREE.Texture();
        texture.repeat.set(1, 1);
        texture.dispose = () => {};
        setTimeout(() => onLoad(texture), 0);
      } catch (error) {
        onError?.(error);
      }
      return {};
    };
    return this;
  });

  mock.method(THREE, 'CubeTextureLoader', function CubeTextureLoader(this: any) {
    this.load = (
      _urls: string[],
      onLoad: (tex: any) => void,
      _onProgress?: () => void,
      onError?: (err: unknown) => void,
    ) => {
      try {
        const texture = new THREE.CubeTexture();
        texture.dispose = () => {};
        setTimeout(() => onLoad(texture), 0);
      } catch (error) {
        onError?.(error);
      }
      return {};
    };
    return this;
  });

  mock.method(THREE, 'PMREMGenerator', function PMREMGenerator(this: any) {
    this.compileEquirectangularShader = () => {};
    this.fromEquirectangular = () => ({ texture: new THREE.Texture() });
    this.fromCubemap = () => ({ texture: new THREE.Texture() });
    this.dispose = () => {};
    return this;
  });

  mock.method(THREE, 'AudioListener', function AudioListener(this: any) {
    this.context = { state: 'running', resume: () => Promise.resolve() };
    this.getContext = () => this.context;
    return this;
  });

  mock.method(THREE, 'AudioLoader', function AudioLoader(this: any) {
    this.load = (
      _url: string,
      onLoad: (buffer: any) => void,
      _onProgress?: () => void,
      onError?: (err: unknown) => void,
    ) => {
      try {
        setTimeout(() => onLoad({}), 0);
      } catch (error) {
        onError?.(error);
      }
      return {};
    };
    return this;
  });

  mock.method(THREE, 'Audio', function Audio(this: any, _listener: any) {
    this.setBuffer = () => {};
    this.setLoop = () => {};
    this.setVolume = () => {};
    this.play = () => {};
    this.stop = () => {};
    return this;
  });

  return THREE;
}

function mockSkyModule(THREE: ThreeModule) {
  mock.module('three/examples/jsm/objects/Sky.js', () => {
    class SkyStub extends THREE.Object3D {
      material: any;
      geometry: THREE.BufferGeometry;

      constructor() {
        super();
        this.material = {
          uniforms: {
            turbidity: { value: 0 },
            rayleigh: { value: 0 },
            mieCoefficient: { value: 0 },
            mieDirectionalG: { value: 0 },
            sunPosition: { value: new THREE.Vector3() },
            up: { value: new THREE.Vector3(0, 1, 0) },
          },
          dispose: () => {},
        };
        this.geometry = new THREE.BufferGeometry();
      }
    }

    return { Sky: SkyStub };
  });
}

async function stubEnvironmentModule() {
  const environmentModule = await import('../../environment/envCore.ts');
  mock.method(environmentModule, 'createEnvironment', () => ({
    async applySkyMode() {},
    async applySkyImage() {},
    setMode() {},
    dispose() {},
  }));
}

async function stubAppModules(THREE: ThreeModule) {
  await stubEnvironmentModule();

  const mainModule = await import('../../main.js');
  mock.method(mainModule, 'setupGround', async () => ({
    root: new THREE.Group(),
    dispose() {},
  }));
  mock.method(mainModule, 'updateTrees', () => {});

  const cityModule = await import('../../buildings/createCity.js');
  mock.method(cityModule, 'createCity', async () => {
    const root = new THREE.Group();
    root.userData = { layeredGround: false } as any;
    root.getObjectByName = () => ({ isMesh: true, material: { dispose() {} } }) as any;
    return {
      root,
      materials: [],
      dispose() {},
    };
  });

  const grassModule = await import('../../materials/groundGrass.js');
  mock.method(grassModule, 'loadGrassMaterial', async () => ({ dispose() {} }));

  const navmeshModule = await import('../../navmesh/buildNavMesh.js');
  mock.method(navmeshModule, 'buildNavMeshFromMeshes', () => ({ dispose() {} }));

  const navPathModule = await import('../../navmesh/pathfinder.js');
  mock.method(navPathModule, 'createNavMeshPathfinder', () => ({ dispose() {} }));

  const npcModule = await import('../../npc/npcSystem.js');
  mock.method(npcModule, 'createNpcSystem', () => ({
    initializeNpcs: () => {},
    update: () => {},
    dispose: () => {},
  }));

  const mainCharModule = await import('../../npc/mainCharacter.js');
  mock.method(mainCharModule, 'createMainCharacter', () => ({
    object3d: new THREE.Object3D(),
    ready: Promise.resolve(),
    update: () => {},
    dispose: () => {},
  }));

  const keyboardModule = await import('../../input/keyboard.js');
  mock.method(keyboardModule, 'createKeyboard', () => ({
    isActionDown: () => false,
    isDown: () => false,
    dispose: () => {},
  }));

  const followCameraModule = await import('../../camera/followCamera.js');
  mock.method(followCameraModule, 'createFollowCamera', () => ({
    target: new THREE.Vector3(),
    update: () => {},
    dispose: () => {},
    setPointerLockElement: () => {},
    setTarget: () => {},
    syncImmediate: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  const seedCameraModule = await import('../../camera/seedCameraBehindPlayer.js');
  mock.method(seedCameraModule, 'seedCameraBehindPlayer', () => {});

  const flyBypassModule = await import('../../dev/flyBypass.js');
  mock.method(flyBypassModule, 'installFlyBypass', () => ({ tick: () => {} }));

  const loopModule = await import('../../engine/loop.js');
  mock.method(loopModule, 'createGameLoop', () => ({
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    dispose: () => {},
    isRunning: () => true,
    resetClock: () => {},
  }));

  const groundRegistryModule = await import('../../physics/groundRegistry.js');
  mock.method(groundRegistryModule, 'markGround', () => {});
  mock.method(groundRegistryModule, 'collectGround', () => []);

  const colliderRegistryModule = await import('../../physics/colliderRegistry.js');
  mock.method(colliderRegistryModule, 'markColliders', () => {});
  mock.method(colliderRegistryModule, 'collectColliders', () => []);
  mock.method(colliderRegistryModule, 'buildAABBs', () => []);

  const groundProjectModule = await import('../../physics/groundProject.js');
  mock.method(groundProjectModule, 'sampleGroundY', () => null);
  mock.method(groundProjectModule, 'snapGroupToGround', () => false);
  mock.method(groundProjectModule, 'snapObjectToGround', () => false);
  mock.method(groundProjectModule, 'snapChildrenToGround', () => {});

  const collisionWorldModule = await import('../../physics/collisionWorld.ts');
  mock.method(collisionWorldModule, 'loadWorldWithColliders', async () => ({ colliderMesh: null, bvh: null }));

  const characterModule = await import('../../controls/CharacterController.ts');
  mock.method(characterModule, 'CharacterController', class CharacterController {
    camera: THREE.PerspectiveCamera;
    headOffset = new THREE.Vector3(0, 0.75, 0);
    velocity = new THREE.Vector3();
    walkSpeed = 4;
    privatePosition = new THREE.Vector3();
    privateAutoUpdate = false;
    privateAttached: THREE.Object3D | null = null;
    privateFlying = false;
    updateCalls: Array<{ dt: number; input: any; world: any }> = [];

    constructor(camera: THREE.PerspectiveCamera, start = new THREE.Vector3(), options: any = {}) {
      this.camera = camera;
      if (Number.isFinite(options?.height)) {
        const height = Math.max(options.height, 0);
        const offsetY = Math.max(0.2, height * 0.5 - 0.1);
        this.headOffset.set(0, offsetY, 0);
      }
      this.privatePosition.copy(start);
      this.privateAutoUpdate = Boolean(options?.autoUpdateCamera);
      if (this.privateAutoUpdate) {
        this.camera.position.copy(this.privatePosition).add(this.headOffset);
      }
    }

    get position() {
      return this.privatePosition;
    }

    update(dt: number, input: any, world: any) {
      this.updateCalls.push({ dt, input, world });
    }

    dispose() {}

    attach(object: THREE.Object3D | null) {
      this.privateAttached = object ?? null;
      if (this.privateAttached?.position) {
        this.privateAttached.position.copy(this.privatePosition);
      }
    }

    setPosition(position: THREE.Vector3) {
      if (!position) return;
      this.privatePosition.copy(position);
      if (this.privateAttached?.position) {
        this.privateAttached.position.copy(this.privatePosition);
      }
      if (this.privateAutoUpdate) {
        this.camera.position.copy(this.privatePosition).add(this.headOffset);
      }
    }

    setFlyingActive(active: boolean) {
      this.privateFlying = Boolean(active);
    }

    isFlying() {
      return this.privateFlying;
    }

    isRunning() {
      return false;
    }
  } as any);

  const inputModule = await import('../../controls/input.ts');
  mock.method(inputModule, 'getInput', () => ({ forward: 0, right: 0, jump: false, sprint: false }));

  const landmarksLoader = await import('../../landmarks-loader.js');
  mock.method(landmarksLoader, 'loadLandmarks', async () => ({
    dispose: () => {},
    featureLines: { updateResolution: () => {} },
  }));

  const landmarkOverlayModule = await import('../../map/landmarks.js');
  mock.method(landmarkOverlayModule, 'createLandmarkOverlay', async () => ({
    requestRender: () => {},
    destroy: () => {},
  }));

  const placerModule = await import('../../dev/landmarkPlacer.js');
  mock.method(placerModule, 'createLandmarkPlacer', () => ({ dispose: () => {} }));

  const roadsPointsModule = await import('../../roads/collectRoadPoints.js');
  mock.method(roadsPointsModule, 'collectRoadPoints', () => []);

  const roadNetworkModule = await import('../../roads/roadNetwork.js');
  mock.method(roadNetworkModule, 'buildRoadNetwork', () => new THREE.Group());

  const uiModule = await import('../../ui/originalUi.js');
  mock.method(uiModule, 'createOriginalUi', () => ({ setTimeLabel: () => {}, destroy: () => {}, dispose: () => {} }));

  const ambientModule = await import('../../audio/ambient.ts');
  mock.method(ambientModule, 'initAmbient', async () => {});
  mock.method(ambientModule, 'registerExternalAmbientTracks', () => {});

  const renderGuardModule = await import('../../safety/hardenPositions.ts');
  mock.method(renderGuardModule, 'installRenderGuard', () => {});

  const skyDebugModule = await import('../../dev/skyDebugHooks.js');
  mock.method(skyDebugModule, 'installSkyDev', () => {});
}

test('environment modules import without runtime side effects', async () => {
  mock.restoreAll();
  const THREE = await import('three');
  let loaderCount = 0;
  mock.method(THREE, 'TextureLoader', function TextureLoader(this: any) {
    loaderCount += 1;
    this.load = () => { throw new Error('should not load during import'); };
    return this;
  });
  mock.method(THREE, 'CubeTextureLoader', function CubeTextureLoader(this: any) {
    loaderCount += 1;
    this.load = () => { throw new Error('should not load during import'); };
    return this;
  });
  mock.method(THREE, 'PMREMGenerator', function PMREMGenerator(this: any) {
    loaderCount += 1;
    return this;
  });

  await import('../../environment/EnvironmentController.ts');
  await import('../../scene/sky.ts');

  assert.strictEqual(loaderCount, 0);
  mock.restoreAll();
});

test('applySkyMode uses procedural sky environment', async () => {
  mock.restoreAll();
  const THREE = await import('three');
  mockSkyModule(THREE);

  mock.method(THREE, 'WebGLRenderer', function WebGLRenderer(this: any) {
    this.domElement = new FakeCanvas();
    this.dispose = () => {};
    this.render = () => {};
    this.getContext = () => ({ getExtension: () => null });
    return this;
  });

  let pmremCalls = 0;
  mock.method(THREE, 'PMREMGenerator', function PMREMGenerator(this: any) {
    this.fromScene = () => {
      pmremCalls += 1;
      const texture = new THREE.Texture();
      texture.dispose = () => {};
      return { texture, dispose: () => {} } as any;
    };
    this.dispose = () => {};
    return this;
  });

  const { createEnvironment } = await import('../../environment/envCore.ts');
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer();
  const env = createEnvironment({ scene, renderer });

  await env.applySkyMode('day');

  assert.ok(scene.environment instanceof THREE.Texture);
  assert.ok(scene.background instanceof THREE.Color);
  assert.ok(pmremCalls > 0);

  mock.restoreAll();
});

test('applySkyMode disposes previous procedural textures', async () => {
  mock.restoreAll();
  const THREE = await import('three');
  mockSkyModule(THREE);

  mock.method(THREE, 'WebGLRenderer', function WebGLRenderer(this: any) {
    this.domElement = new FakeCanvas();
    this.dispose = () => {};
    this.render = () => {};
    this.getContext = () => ({ getExtension: () => null });
    return this;
  });

  let disposeCount = 0;
  mock.method(THREE, 'PMREMGenerator', function PMREMGenerator(this: any) {
    this.fromScene = () => {
      const texture = new THREE.Texture();
      texture.dispose = () => {
        disposeCount += 1;
      };
      return { texture, dispose: () => {} } as any;
    };
    this.dispose = () => {};
    return this;
  });

  const { createEnvironment } = await import('../../environment/envCore.ts');
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer();
  const env = createEnvironment({ scene, renderer });

  await env.applySkyMode('day');
  const firstTexture = scene.environment as THREE.Texture | null;
  await new Promise((resolve) => setTimeout(resolve, 220));
  await env.applySkyMode('dusk');

  assert.notStrictEqual(scene.environment, firstTexture);
  assert.ok(disposeCount >= 1);

  mock.restoreAll();
});

test('initializeAthens resolves with stubbed environment', async () => {
  mock.restoreAll();
  const THREE = await stubThree();
  setupDom(THREE);
  await stubAppModules(THREE);

  const { initializeAthens } = await import('../initializeAthens.js');
  const container = createFakeContainer();

  try {
    const context = await initializeAthens({ container, layout: 'classic', layoutConfig: {} });
    assert.ok(context);
    assert.ok(context.camera, 'expected camera to be initialized');
    assert.ok(context.controller, 'expected controller to be initialized');

    const placeholderCameraPosition = new THREE.Vector3(90, 110, 180);
    const distanceFromPlaceholder = context.camera.position.distanceTo(placeholderCameraPosition);
    assert.ok(distanceFromPlaceholder > 50, 'camera should not remain at the placeholder position');

    const controllerCenter = context.controller.position?.clone
      ? context.controller.position.clone()
      : context.controller.position;
    assert.ok(controllerCenter, 'expected controller to expose a position');

    const cameraToController = context.camera.position.distanceTo(controllerCenter);
    assert.ok(cameraToController < 5, 'camera should align near the controller position');

    context.dispose?.();
  } finally {
    mock.restoreAll();
    teardownDom();
  }
});

test('character controller updates even when skippedLargeDt is true', async () => {
  mock.restoreAll();
  const THREE = await stubThree();
  setupDom(THREE);
  await stubAppModules(THREE);

  const loopModule = await import('../../engine/loop.js');
  let capturedUpdate: ((dt: number, meta: { skippedLargeDt?: boolean }) => void) | null = null;
  mock.method(loopModule, 'createGameLoop', (update) => {
    capturedUpdate = update;
    return {
      start: () => {},
      stop: () => {},
      pause: () => {},
      resume: () => {},
      dispose: () => {},
      isRunning: () => true,
      resetClock: () => {},
    };
  });

  const { initializeAthens } = await import('../initializeAthens.js');
  const container = createFakeContainer();

  let context: Awaited<ReturnType<typeof initializeAthens>> | null = null;
  try {
    context = await initializeAthens({ container, layout: 'classic', layoutConfig: {} });
    assert.ok(context, 'expected initialization context');
    const controller: any = context.controller;
    assert.ok(controller, 'expected controller to exist');
    assert.ok(Array.isArray(controller.updateCalls), 'expected controller to record update calls');
    assert.strictEqual(controller.updateCalls.length, 0, 'no updates should be recorded before ticking');
    assert.ok(typeof capturedUpdate === 'function', 'expected game loop update handler');

    capturedUpdate?.(0.25, { skippedLargeDt: true });

    assert.strictEqual(controller.updateCalls.length, 1, 'controller should update even when skippedLargeDt is true');
    assert.strictEqual(controller.updateCalls[0]?.dt, 0.25, 'controller should receive the clamped delta');
  } finally {
    context?.dispose?.();
    mock.restoreAll();
    teardownDom();
  }
});
