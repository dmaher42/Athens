const { createRequire } = require('module');
if (typeof globalThis.require !== 'function') {
  globalThis.require = createRequire(process.cwd() + '/scripts/generate-sky-ground-assets.js');
}
