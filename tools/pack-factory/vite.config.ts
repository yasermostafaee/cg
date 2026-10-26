import { defineConfig } from 'vite';

export default defineConfig({
  root: 'studio',
  build: {
    outDir: '../dist/studio',
    emptyOutDir: false,
    target: 'es2022',
  },
});
