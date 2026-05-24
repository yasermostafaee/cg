import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Scene, Layer, Element } from '@cg/shared-schema';
import { AssetService } from '../../src/main/services/AssetService.js';
import { ExportService } from '../../src/main/services/ExportService.js';
import { ProjectService } from '../../src/main/services/ProjectService.js';

/**
 * Phase 8 §13 / M10.0 — Designer perf budget.
 *
 * Exit criterion: "Designer: export for 5-element template < 1.5 s."
 *
 * The budget is enforced against the *warm* export, not the first one —
 * the JIT and the AssetService's first-touch IO have one-time costs
 * that aren't representative of the operator's steady-state experience.
 *
 * The test fails loudly with the measured duration so a regression is
 * easy to diagnose from the CI log.
 */

const WARM_BUDGET_MS = 1500;
const WARM_ITERATIONS = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLED_CG_JS_PATH = path.resolve(APP_ROOT, 'resources/template-runtime/cg.js');

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function fiveElementLayer(): Layer {
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
  const elements: Element[] = [
    {
      ...baseElProps,
      id: 'bg',
      name: 'background',
      type: 'shape',
      shape: 'rounded-rect',
      cornerRadius: 12,
      fill: { kind: 'solid', color: '#0F172A' },
    },
    {
      ...baseElProps,
      id: 'accent',
      name: 'accent',
      type: 'shape',
      shape: 'rect',
      fill: { kind: 'solid', color: '#E11D48' },
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
        family: 'Inter',
        weight: 400,
        style: 'normal',
        size: 32,
        lineHeight: 1.3,
        letterSpacing: 0,
      },
      color: '#E5E7EB',
      align: 'start',
      direction: 'auto',
      fitMode: 'fixed',
      overflow: 'ellipsis',
    },
    {
      ...baseElProps,
      id: 'rule',
      name: 'accent-rule',
      type: 'shape',
      shape: 'rect',
      fill: { kind: 'solid', color: '#FACC15' },
    },
  ];
  return {
    id: 'L1',
    name: 'main',
    visible: true,
    locked: false,
    blendMode: 'normal',
    children: elements,
  };
}

describe('M10.0 — Designer export perf budget', () => {
  it(`warm export for a 5-element template stays under ${String(WARM_BUDGET_MS)}ms`, async () => {
    const cgJs = await fs.promises.readFile(BUNDLED_CG_JS_PATH, 'utf-8');
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-perf-export-'));
    const projects = new ProjectService({
      recentFilePath: path.join(tmp, 'recent.json'),
      randomId: () => 'scene-perf',
    });
    const assets = new AssetService({ workingRoot: path.join(tmp, 'working') });
    const exporter = new ExportService({ cgJs, assets });

    const { scene } = projects.newScene('Perf', 'lower-third');
    const sceneWithLayer: Scene = { ...scene, layers: [fiveElementLayer()] };

    // Warm pass — JIT + first-touch IO. Result is discarded.
    await exporter.run(sceneWithLayer, path.join(tmp, 'warm.vcg'));

    const samples: number[] = [];
    for (let i = 0; i < WARM_ITERATIONS; i++) {
      const start = performance.now();
      await exporter.run(sceneWithLayer, path.join(tmp, `out-${String(i)}.vcg`));
      samples.push(performance.now() - start);
    }
    const max = Math.max(...samples);
    const median = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0;
    // Fail with a diagnostic so a regression is easy to read in CI logs.
    expect(
      max,
      `export max ${String(max.toFixed(1))}ms; samples ${samples.map((s) => s.toFixed(1)).join('/')}`,
    ).toBeLessThan(WARM_BUDGET_MS);
    // Sanity: median is well under the budget (catches a one-off spike masking a real regression).
    expect(median).toBeLessThan(WARM_BUDGET_MS);
  });
});
