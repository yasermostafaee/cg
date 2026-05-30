import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Designer browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge. Workspace
 * packages (`@cg/*`) resolve to their built `dist/` via the pnpm workspace —
 * `turbo run build` builds them first.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
