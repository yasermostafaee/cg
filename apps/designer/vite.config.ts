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
