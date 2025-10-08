import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

test('initAmbient resolves when audio assets are unavailable', async () => {
  const THREE = await import('three');

  mock.method(THREE, 'AudioListener', function FakeAudioListener(this: any) {
    this.context = { state: 'running', resume: () => Promise.resolve() };
    return this;
  });

  mock.method(THREE, 'AudioLoader', function FakeAudioLoader(this: any) {
    this.load = (_url: string, _onLoad: () => void, _onProgress: () => void, onError?: (err: unknown) => void) => {
      if (typeof onError === 'function') {
        onError(new Error('Not Found'));
      }
    };
    return this;
  });

  mock.method(THREE, 'Audio', function FakeAudio(this: any) {
    this.setBuffer = () => {};
    this.setLoop = () => {};
    this.setVolume = () => {};
    this.play = () => {};
    this.stop = () => {};
    return this;
  });

  const scoped = globalThis as Record<string, unknown>;
  const previousBase = scoped.__ATHENS_BASE__;

  try {
    scoped.__ATHENS_BASE__ = '/Athens/';
    const ambientModule = await import('../src/audio/ambient.ts');

    const cameraStub = {
      add: () => {},
      remove: () => {},
    } as any;

    await assert.doesNotReject(() => ambientModule.initAmbient(cameraStub));
  } finally {
    mock.restoreAll();
    if (typeof previousBase === 'undefined') {
      delete scoped.__ATHENS_BASE__;
    } else {
      scoped.__ATHENS_BASE__ = previousBase;
    }
  }
});
