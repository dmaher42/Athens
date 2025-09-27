import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawBase = env.VITE_BASE ?? env.BASE ?? '/';
  const normalizedBase = (() => {
    if (!rawBase) return '/';
    const withLeading = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  })();

  return {
    cacheDir: 'node_modules/.vite-athens',
    base: normalizedBase,
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
  };
});
