import { defineConfig } from 'vite';

const base = process.env.GHPAGES_BASE ?? process.env.BASE_PATH ?? process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0'
  },
  preview: {
    host: '0.0.0.0'
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      include: []
    }
  }
});
