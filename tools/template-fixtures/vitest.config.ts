import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.mjs'],
    coverage: {
      // Build script (build.mjs) is exercised by the integration test;
      // coverage on it isn't meaningful since it's run end-to-end.
      enabled: false,
    },
  },
});
