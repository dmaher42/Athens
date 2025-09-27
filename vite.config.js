import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
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
    open: true,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        boot: 'boot.html',
      },
    },
  },
}));
