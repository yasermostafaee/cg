import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { createBuildStamp } from '@cg/splash-kit/build-stamp';

/**
 * Designer browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge. Workspace
 * packages (`@cg/*`) resolve to their built `dist/` via the pnpm workspace —
 * `turbo run build` builds them first.
 */
/**
 * THE BUILD STAMP, from @cg/splash-kit: ONE object, computed ONCE, feeding BOTH the HTML
 * transform and the __CG_BUILD__ define. It is the SAME plugin the Runtime stamps from, so
 * what an operator reads off either splash identifies the running build exactly and the two
 * products cannot disagree about which build is on the box.
 *
 * The HTML transform is not a preference: the splash paints BEFORE the bundle, so a define
 * global does not exist yet at the moment it renders.
 */
const { plugin: buildStampPlugin, stamp: buildStamp } = createBuildStamp(
  fileURLToPath(new URL('.', import.meta.url)),
);

export default defineConfig({
  plugins: [vanillaExtractPlugin(), react(), buildStampPlugin],
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
  define: {
    __CG_BUILD__: JSON.stringify(buildStamp),
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
