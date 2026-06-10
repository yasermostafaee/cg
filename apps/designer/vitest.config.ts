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
      include: [
        'src/platform/**/*.ts',
        'src/renderer/state/**/*.ts',
        // Canvas-editor PURE LOGIC (the non-React, testable math). The interactive
        // React layer (Gizmo/CanvasOverlay/CanvasArea .tsx) is covered by the
        // Playwright E2E suite, not unit coverage.
        'src/renderer/features/canvas/geometry.ts',
        'src/renderer/features/canvas/hit-test.ts',
        'src/renderer/features/canvas/drill.ts',
        // Timeline-authoring PURE LOGIC (time↔pixel, ruler stride, keyframe lane
        // layout, selection) + the easing-curve handle math. The interactive
        // React layer (TimelineDock/TrackRow/FrameRuler/EasingEditor .tsx) is
        // covered by the Playwright E2E suite, not unit coverage.
        'src/renderer/features/timeline/timeline-geometry.ts',
        'src/renderer/features/inspector/easing-geometry.ts',
      ],
      exclude: ['src/platform/cg-runtime.ts'],
    },
  },
});
