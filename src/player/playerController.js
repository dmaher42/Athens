import { CharacterController } from '../controls/CharacterController.ts';

export function createPlayerController(camera, start, options) {
  if (typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[playerController] createPlayerController is deprecated. Use CharacterController instead.'
    );
  }
  return new CharacterController(camera, start, options);
}

export { CharacterController } from '../controls/CharacterController.ts';

export default createPlayerController;
