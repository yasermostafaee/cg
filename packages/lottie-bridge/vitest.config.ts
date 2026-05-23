import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        // M3.3 ships the wiring; full functional coverage of bounce/segment
        // playback would need a real browser. happy-dom smoke tests verify
        // the lifecycle but not the renderer.
        lines: 70,
        functions: 80,
        branches: 60,
        statements: 70,
      },
    },
  },
});
