import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        output: {
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    // No externalizeDepsPlugin: sandboxed CJS preloads can't import the ESM
    // builds of @cg/shared-ipc / zod at runtime. Bundle them in so the
    // preload is self-contained. Electron is the only true external.
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          'runtime.preload': resolve(__dirname, 'src/preload/runtime.preload.ts'),
        },
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
