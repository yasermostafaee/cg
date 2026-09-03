import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { createBuildStamp } from '@cg/splash-kit/build-stamp';

/**
 * Runtime browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge (a mock
 * until the CasparCG WebSocket<->TCP bridge lands). Workspace packages
 * (`@cg/*`) resolve to their built `dist/` via the pnpm workspace.
 */

/**
 * R-035 - THE BUILD STAMP, from `@cg/splash-kit`: ONE object, computed ONCE, feeding
 * BOTH the HTML transform and the `__CG_BUILD__` define. It is SHARED with the Designer
 * rather than copied into it, because what an operator reads off a splash and repeats
 * down a phone line has to identify the running build exactly - and two independently
 * derived stamps are two stamps that can disagree about which build is on the box.
 *
 * The HTML transform is not a preference: the splash paints BEFORE the bundle, so a
 * `define` global does not exist yet at the moment it renders.
 */
const { plugin: buildStampPlugin, stamp: buildStamp } = createBuildStamp(
  fileURLToPath(new URL('.', import.meta.url)),
);
export default defineConfig({
  plugins: [vanillaExtractPlugin(), react(), buildStampPlugin],
  define: {
    __CG_BUILD__: JSON.stringify(buildStamp),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    // P-041 — the DEV server is LAN-visible BY DEFAULT (`true` = every interface, and Vite
    // prints each Network URL). This is a private plant network, and the alternative is a
    // flag someone has to remember (`HOST=0.0.0.0` was that flag) — the failure mode this
    // repo has already paid for. `HOST=127.0.0.1` restricts it back to loopback.
    //
    // The dev-only boundary is Vite's own contract, not a convention: `server.*` is read by
    // the `vite` dev server ONLY. `vite build` binds nothing, and `vite preview` reads
    // `preview.*` below, which stays loopback — so a packaged build cannot inherit this.
    // `tests/vite-config.test.ts` pins both halves.
    //
    // HMR: `server.hmr.host` is deliberately UNSET, so Vite's client falls back to
    // `location.hostname` and a remote browser's HMR socket targets the address it loaded
    // the page from (verified over the LAN address, not assumed — see P-041).
    // Override the port with PORT (e.g. PORT=80 for a bare http://<ip>/ URL).
    host: process.env.HOST ?? true,
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 5174,
  },
  preview: {
    // Loopback by default, unchanged by P-041: `preview` serves the BUILT app, which is the
    // packaged-build path and out of that item's scope. HOST=0.0.0.0 exposes it explicitly.
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT !== undefined ? Number(process.env.PORT) : 7000,
  },
});
