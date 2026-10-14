import { beforeAll, describe, expect, it } from 'vitest';
import {
  migrateScene,
  type CountdownSteps,
  type Element as SceneElement,
  type Layer,
  type Scene,
} from '@cg/shared-schema';
import type { compileStepCss as CompileStepCss } from '@cg/template-runtime';
import { buildGddSchema } from '@cg/vcg-format';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import { cgJsIife } from '../src/cg-runtime.js';
import type { ImageAssetSource } from '../src/image-export.js';

/**
 * 🔴 `add-azan-countdown` tasks 6.1 / 6.2 (`D-141`) and `DELTA-RUN-NEXT-VERSION-01-A` — **THE STEPS
 * ON AIR ARE THE STEPS IN THE PREVIEW, AND NEITHER EXPORTER KNOWS STEPS EXIST.**
 *
 * The step stylesheet is compiled by the RUNTIME, from the scene, at boot (`ensureStepCss`), after
 * the scene migrations. The single-file page embeds the scene and boots the same runtime, so the
 * page compiles the same text the preview does. These tests prove each link rather than assume it:
 *
 *   - the scene the page embeds compiles, in the page's `output` mode, to the stylesheet the preview
 *     compiles — byte for byte — for a scene authored in steps AND for one still carrying D-141 v1's
 *     zones, which both sides migrate the same way;
 *   - the runtime the page carries is the one with the injector;
 *   - a scene with steps and one without export to pages that differ ONLY in the embedded scene:
 *     the exporter has no step code path at all;
 *   - a clock target bound to a field reaches the GDD as a plain `single-line` string carrying its
 *     pattern — no new `gddType` — and an unbound clock leaves the GDD as it was.
 *
 * (The preview boots in `author` mode — its Live Sources show bars; no element here is one, so
 * the two modes compile the same text.)
 */

/*
  The runtime pulls in `lottie_light`, which touches `canvas.getContext('2d')` at MODULE INIT, and
  happy-dom has no Canvas 2D: the same no-op context `@cg/template-runtime`'s own suite installs
  (`tests/setup-canvas.ts`), then the runtime is imported. Test-environment only.
*/
let compileStepCss: typeof CompileStepCss;
beforeAll(async () => {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (proto !== undefined) {
    proto.getContext = function getContext(type: string): unknown {
      if (type !== '2d') return null;
      const noop = (): undefined => undefined;
      const target: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
      return new Proxy(target, {
        get: (t, prop: string): unknown => (prop in t ? t[prop] : noop),
        set: (t, prop: string, value: unknown): boolean => {
          t[prop] = value;
          return true;
        },
      });
    } as typeof proto.getContext;
  }
  ({ compileStepCss } = await import('@cg/template-runtime'));
});

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 } as const;
const FONT = {
  family: 'Vazirmatn',
  weight: 600,
  style: 'normal',
  size: 48,
  lineHeight: 1.2,
  letterSpacing: 0,
} as const;

/** Three steps at 60 / 30 / 10 min — the preset — plus a hide, a blink and a picture. */
const STEPS: CountdownSteps = {
  steps: [
    {
      name: '60 min',
      atMs: 3_600_000,
      changes: [{ elementId: 'countdown', property: 'textColor', value: '#ffd600' }],
    },
    {
      name: '30 min',
      atMs: 1_800_000,
      changes: [
        { elementId: 'countdown', property: 'textColor', value: '#ff9100' },
        { elementId: 'band', property: 'fill', value: '#ff6d00' },
      ],
    },
    {
      name: '10 min',
      atMs: 600_000,
      changes: [
        { elementId: 'countdown', property: 'textColor', value: '#d50000' },
        { elementId: 'countdown', property: 'blink', value: true },
        { elementId: 'band', property: 'visible', value: false },
      ],
    },
  ],
};

/** D-141 v1's zones for the same intent — what a scene saved before the steps carries. */
const ZONES = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};

type Kind = 'steps' | 'zones' | 'none';

function countdown(kind: Kind): SceneElement {
  return {
    ...EL,
    id: 'countdown',
    name: 'countdown',
    type: 'clock',
    font: FONT,
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'persian',
    target: { kind: 'timeofday', time: '20:32' },
    ...(kind === 'steps' ? { steps: STEPS } : {}),
    ...(kind === 'zones'
      ? {
          zones: ZONES,
          zoneOverrides: ['normal', 'caution', 'warning', 'critical'].map((zone) => ({
            zone,
            textColor: 'zone' as const,
          })),
        }
      : {}),
  } as SceneElement;
}

function band(kind: Kind): SceneElement {
  return {
    ...EL,
    id: 'band',
    name: 'band',
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#202020' },
    ...(kind === 'zones'
      ? {
          zoneOverrides: [
            { zone: 'critical', fill: 'zone' },
            { zone: 'warning', fill: '#ff6d00' },
          ],
        }
      : {}),
  } as SceneElement;
}

function layer(children: SceneElement[]): Layer {
  return { id: 'l1', name: 'l1', visible: true, locked: false, blendMode: 'normal', children };
}

function scene(kind: Kind, extra: Partial<Scene> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 'countdown-scene',
    name: 'Countdown',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [layer([band(kind), countdown(kind)])],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
    ...extra,
  } as unknown as Scene;
}

async function exportHtml(s: Scene): Promise<string> {
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss: '',
    fontsCss: '',
    assets: { get: async () => null, bytes: async () => null } as unknown as ImageAssetSource,
    fetchUrl: async () => new ArrayBuffer(0),
  }).produce(s);
  return html;
}

/** The `var scene = …` literal the page boots, parsed back out of it. */
function embeddedScene(html: string): Scene {
  const m = /var scene = (\{[\s\S]*?\});\n/.exec(html);
  if (m?.[1] === undefined) throw new Error('no inlined scene literal in the page');
  return JSON.parse(m[1]) as Scene;
}

describe('D-141 6.1 — the page compiles the preview’s step stylesheet, byte for byte', () => {
  it.each(['steps', 'zones'] as const)(
    '🔴 a scene authored in %s: the embedded scene compiles, as the page boots it, to exactly the preview’s stylesheet',
    async (kind) => {
      const authored = scene(kind);
      const html = await exportHtml(authored);

      // Both sides boot through the SAME migrations, then the same compiler.
      const preview = compileStepCss(migrateScene(authored), 'author');
      const onAir = compileStepCss(migrateScene(embeddedScene(html)), 'output');

      // Positive control: there IS a stylesheet to compare — a publication for every step.
      expect(preview.css).toContain("[data-cg-cd0='0']");
      expect(preview.css).toContain("[data-cg-cd0='2']");
      expect(preview.warnings).toEqual([]);
      expect(onAir.css).toBe(preview.css);
    },
  );

  it('the page carries the runtime that injects it, and boots it on the embedded scene', async () => {
    const html = await exportHtml(scene('steps'));
    expect(cgJsIife).toContain('cg-steps');
    expect(html).toContain(cgJsIife.slice(0, 200));
    expect(html).toContain("CG.createRuntime(scene, { mode: 'output'");
  });
});

describe('D-141 6.2 — neither exporter has a step code path', () => {
  it('🔴 a scene with steps and one without export to the same page except for the embedded scene', async () => {
    const stepped = await exportHtml(scene('steps'));
    const plain = await exportHtml(scene('none'));
    const strip = (html: string): string => html.replace(/var scene = \{[\s\S]*?\};\n/, '');
    // Control: the scenes really differ, so the comparison below is not vacuous.
    expect(stepped).not.toBe(plain);
    expect(strip(stepped)).toBe(strip(plain));
    // No compiled stylesheet is written into the page by the exporter: the runtime does it at boot.
    expect(stepped).not.toContain('<style id="cg-steps">');
  });

  it('the GDD (the .vcg exporter’s only scene-derived surface besides the scene) is the same with steps and without', () => {
    expect(buildGddSchema(scene('steps'))).toEqual(buildGddSchema(scene('none')));
  });
});

describe('D-141 6.1 — a bound target reaches the GDD as a plain patterned string', () => {
  const TIME = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  const bound = (): Scene =>
    scene('steps', {
      fields: [
        {
          id: 'targetTime',
          label: 'Target time',
          required: true,
          type: 'text',
          default: '20:32',
          pattern: TIME,
        },
      ],
      bindings: [
        { fieldId: 'targetTime', target: { kind: 'clock-target', elementId: 'countdown' } },
      ],
    } as unknown as Partial<Scene>);

  it('🔴 single-line, string, its pattern carried — no new gddType', () => {
    const gdd = buildGddSchema(bound());
    const property = gdd.properties['targetTime'];
    expect(property).toMatchObject({ type: 'string', gddType: 'single-line', pattern: TIME });
    expect(['single-line', 'multi-line', 'color-rrggbb']).toContain(property?.gddType);
  });

  it('control: an UNBOUND clock leaves the GDD as it was — no property appears', () => {
    expect(Object.keys(buildGddSchema(scene('steps')).properties)).toEqual([]);
  });

  it('no preflight issue is raised for the bound target (nothing the client cannot honour)', async () => {
    const { issues } = await new ExporterSingleFile({
      cgJsIife,
      cgCss: '',
      fontsCss: '',
      assets: { get: async () => null, bytes: async () => null } as unknown as ImageAssetSource,
      fetchUrl: async () => new ArrayBuffer(0),
    }).produce(bound());
    expect(issues).toEqual([]);
  });
});
