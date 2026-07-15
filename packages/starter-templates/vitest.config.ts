import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // D-125 — stub Canvas 2D so DOM-env tests that import `@cg/template-runtime`
    // (→ `lottie_light`) don't crash at module init. See the setup file.
    setupFiles: ['./vitest.setup-canvas.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
    },
  },
});
