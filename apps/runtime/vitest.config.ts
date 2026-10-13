import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { createBuildStamp } from '@cg/splash-kit/build-stamp';

/**
 * `CLIENT-TEST-RELEASE-01` B1 — the build stamp the app is built with (`vite.config.ts`), so a dom
 * spec renders the version line from the same `__CG_BUILD__` object the bundle carries.
 */
const { stamp } = createBuildStamp(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  define: {
    __CG_BUILD__: JSON.stringify(stamp),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/platform/**/*.ts'],
    },
  },
});
