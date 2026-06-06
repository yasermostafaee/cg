import { defineConfig } from 'vitest/config';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default defineConfig({
  // Tests import components that pull their co-located `*.css.ts` stylesheets;
  // the plugin lets vanilla-extract's `style()` resolve under Vitest too.
  plugins: [vanillaExtractPlugin()],
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
