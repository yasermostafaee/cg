import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // D-125 — stub Canvas 2D so tests that import `@cg/template-runtime`
    // (→ `lottie_light`) don't crash at module init. See the setup file.
    setupFiles: ['./vitest.setup-canvas.mjs'],
    include: ['tests/**/*.test.mjs'],
    coverage: {
      // Build script (build.mjs) is exercised by the integration test;
      // coverage on it isn't meaningful since it's run end-to-end.
      enabled: false,
    },
  },
});
