import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // B-073 — these are socket + timer integration tests: a boot alone is
    // connect + AMCP handshake + resync, and the suite runs fileParallelism
    // forks that contend for the CPU. The old 10 s default sat BELOW the
    // internal budgets several tests already spend (`HEALTH_MS` + serve +
    // round-trips), so a contended fork hit the *test* timeout before its own
    // assertions could speak. The ceiling exists to catch a genuine hang, not
    // to police how fast a loaded box schedules a handshake.
    testTimeout: 45_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
    },
  },
});
