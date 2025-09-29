import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(() => ({
  base: process.env.GH_PAGES === '1' ? '/athens/' : '/',
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
    target: 'esnext',
    rollupOptions: {
      input: {
        index: 'index.html',
      },
    },
  },
}));
