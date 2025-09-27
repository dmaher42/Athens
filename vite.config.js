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
    base: normalizedBase,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      open: true,
    },
  };
});
