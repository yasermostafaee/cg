import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Runtime browser SPA. The renderer lives under `src/renderer`; the
 * `src/platform` layer provides the in-process `window.cg` bridge (a mock
 * until the CasparCG WebSocket↔TCP bridge lands). Workspace packages
 * (`@cg/*`) resolve to their built `dist/` via the pnpm workspace.
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
    port: 5174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
});
