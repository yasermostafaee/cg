import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * Phase 8 §13 / M10.2 — Template-runtime bootstrap latency budget.
 *
 * Exit criterion: "Template runtime: bootstrap < 500 ms with 3 fonts
 * and 2 images."
 *
 * Bootstrap = `createRuntime(scene)` + `play({})`. The fonts are
 * declared (not actually loaded — happy-dom doesn't implement
 * FontFaceSet; we skip via `skipFontLoad: true` to match the production
 * code path where fonts are pre-loaded by Electron's CEF). The image
 * elements reference assetIds — the runtime constructs the DOM nodes
 * but doesn't fetch the binaries (that's the Designer's preview path).
 *
 * The budget is enforced against the *warm* iterations after a
 * discarded first pass to absorb JIT + happy-dom startup.
 */

const BOOTSTRAP_BUDGET_MS = 500;
const WARM_ITERATIONS = 3;

function sceneWithMedia(): Scene {
  const baseTransform = {
    position: { x: 0, y: 0 },
    size: { w: 480, h: 80 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  };
  const baseElProps = {
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as const;
  return {
    schemaVersion: 1,
    id: 'bootstrap-budget',
    name: 'bootstrap-budget',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...baseElProps,
            id: 'bg',
            name: 'background',
            type: 'shape',
            shape: 'rounded-rect',
            cornerRadius: 8,
            fill: { kind: 'solid', color: '#0F172A' },
          },
          {
            ...baseElProps,
            id: 'logo',
            name: 'logo',
            type: 'image',
            assetId: 'asset-logo',
            fit: 'contain',
            preserveAspect: true,
          },
          {
            ...baseElProps,
            id: 'flag',
            name: 'flag',
            type: 'image',
            assetId: 'asset-flag',
            fit: 'contain',
            preserveAspect: true,
          },
          {
            ...baseElProps,
            id: 'title',
            name: 'title',
            type: 'text',
            text: 'Headline',
            font: {
              family: 'Inter',
              weight: 700,
              style: 'normal',
              size: 56,
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            align: 'start',
            direction: 'auto',
            fitMode: 'fixed',
            overflow: 'clip',
          },
          {
            ...baseElProps,
            id: 'subtitle',
            name: 'subtitle',
            type: 'text',
            text: 'Subhead',
            font: {
              family: 'Vazirmatn',
              weight: 400,
              style: 'normal',
              size: 32,
              lineHeight: 1.3,
              letterSpacing: 0,
            },
            color: '#E5E7EB',
            align: 'start',
            direction: 'rtl',
            fitMode: 'fixed',
            overflow: 'ellipsis',
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [
      { family: 'Inter', weights: [400, 700], styles: ['normal'], source: 'bundled' },
      { family: 'Vazirmatn', weights: [400, 700], styles: ['normal'], source: 'bundled' },
      {
        family: 'Noto Sans Arabic',
        weights: [400],
        styles: ['normal'],
        source: 'bundled',
      },
    ],
    metadata: {
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('M10.2 — template-runtime bootstrap budget', () => {
  it(`createRuntime + play() with 3 fonts + 2 images stays under ${String(BOOTSTRAP_BUDGET_MS)}ms`, async () => {
    const scene = sceneWithMedia();

    // Warm pass — absorbs happy-dom + JIT setup.
    const warm = createRuntime(scene, { skipFontLoad: true, skipTickers: true });
    await warm.play({});
    warm.remove();
    document.body.innerHTML = '';
    document.body.className = '';

    const samples: number[] = [];
    for (let i = 0; i < WARM_ITERATIONS; i++) {
      const start = performance.now();
      const runtime = createRuntime(scene, { skipFontLoad: true, skipTickers: true });
      await runtime.play({});
      samples.push(performance.now() - start);
      runtime.remove();
      document.body.innerHTML = '';
      document.body.className = '';
    }

    const max = Math.max(...samples);
    const median = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0;
    expect(
      max,
      `bootstrap max ${max.toFixed(1)}ms; samples ${samples.map((s) => s.toFixed(1)).join('/')}`,
    ).toBeLessThan(BOOTSTRAP_BUDGET_MS);
    expect(median).toBeLessThan(BOOTSTRAP_BUDGET_MS);
  });
});
