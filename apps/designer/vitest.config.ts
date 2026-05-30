import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/platform/**/*.ts', 'src/renderer/state/**/*.ts'],
      exclude: ['src/platform/cg-runtime.ts'],
    },
  },
});
