import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

/**
 * Designer browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge. Workspace
 * packages (`@cg/*`) resolve to their built `dist/` via the pnpm workspace —
 * `turbo run build` builds them first.
 */
export default defineConfig({
  plugins: [vanillaExtractPlugin(), react()],
  // D-128 — the ffmpeg.wasm wrapper spawns its class worker via
  // `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.
  // esbuild dep pre-bundling would relocate the module into `.vite/deps/` and
  // break that relative URL (the classic ffmpeg+Vite worker 404), so both
  // wrapper packages are excluded; in `vite build` Rollup's worker transform
  // emits the worker as a same-origin chunk instead. The 32 MB core js+wasm are
  // delivered as `?url` build assets (see renderer/features/assets/video-convert.ts) —
  // same-origin, lazy, never a CDN (P-001 / D-128 note (k)).
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    // Defaults to loopback. Set HOST=0.0.0.0 (or `true`) to expose the dev
    // server on the LAN — e.g. to open the Designer from another device.
    // Override the port with PORT (e.g. PORT=80 for a bare http://<ip>/ URL).
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 4000,
  },
  preview: {
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 5000,
  },
});
