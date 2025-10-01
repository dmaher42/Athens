import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

function excludeDevPublicAssets() {
  let outDir = '';
  return {
    name: 'athens-exclude-dev-assets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_, bundle) {
      for (const [key, output] of Object.entries(bundle)) {
        const fileName = output.type === 'asset' || output.type === 'chunk' ? output.fileName : key;
        if (fileName?.startsWith('dev/')) {
          delete bundle[key];
        }
      }
    },
    closeBundle() {
      if (!outDir) {
        return;
      }
      const devDir = path.join(outDir, 'dev');
      try {
        fs.rmSync(devDir, { recursive: true, force: true });
      } catch (error) {
        // ignore removal failures; directory simply won't exist in final output
      }
    }
  };
}

export default defineConfig(() => ({
  base: '/Athens/',
  cacheDir: 'node_modules/.vite-athens',
  optimizeDeps: {
    force: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 4173,
    open: false,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    sourcemap: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        index: 'index.html',
      },
      plugins: [excludeDevPublicAssets()],
    },
  },
}));
