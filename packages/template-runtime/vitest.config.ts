import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/types.ts'],
      thresholds: {
        // M3.2-α covers the static-render path; M3.2-β adds animation
        // and unblocks the rest of the scene-builder branches. Thresholds
        // tighten with each milestone.
        lines: 75,
        functions: 80,
        branches: 70,
        statements: 75,
      },
    },
  },
});
