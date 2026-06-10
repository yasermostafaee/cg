import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { ExporterSingleFile } from '../src/platform/ExporterSingleFile.js';
import type { AssetStore } from '../src/platform/AssetStore.js';

function makeScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'My Template',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    background: 'transparent',
    layers: [],
    fields: [
      { id: 'f0', label: 'Title', required: true, type: 'text', default: 'Hello', maxLength: 100 },
      { id: 'logo', label: 'Logo', required: false, type: 'image', accept: ['png'] },
    ],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as Scene;
}

function makeExporter(): ExporterSingleFile {
  return new ExporterSingleFile({
    cgJsIife:
      'var CG = { createRuntime: function () { return { ready: Promise.resolve() }; }, installCasparGlobals: function () {} };',
    cgCss: 'html,body{background:transparent}',
    fontsCss: "@font-face{font-family:'Vazirmatn';src:url('/fonts/v.woff2') format('woff2')}",
    assets: { bytes: async () => null } as unknown as AssetStore,
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

describe('ExporterSingleFile', () => {
  it('produces one self-contained HTML with no external resource references', async () => {
    const { html, filename } = await makeExporter().produce(makeScene());

    expect(filename).toBe('My-Template.html');
    // No external resource loads: no module imports, no fetch, no <link>, no
    // remote src/href, and the bundled font URL is inlined to a data URI.
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/\bfetch\(/);
    expect(html).not.toMatch(/import\s/);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href=/);
    expect(html).not.toContain('/fonts/v.woff2');
    expect(html).toContain('url(data:font/woff2;base64,');
    // Scene inlined as a JS literal + the IIFE runtime bootstrap.
    expect(html).toContain('var scene =');
    expect(html).toContain('CG.createRuntime(scene)');
    expect(html).toContain('CG.installCasparGlobals');
  });

  it('embeds a parseable GDD schema with the dynamic fields', async () => {
    const { html, issues } = await makeExporter().produce(makeScene());

    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(gdd.properties['f0']?.type).toBe('string');
    expect(gdd.required).toContain('f0');

    // An image field is exported but flagged as not portable to third-party clients.
    expect(issues.some((i) => i.fieldId === 'logo' && i.severity === 'warning')).toBe(true);
  });

  it('embeds D-020 out-point + playout metadata with the outro duration (ms)', async () => {
    const scene: Scene = {
      ...makeScene(),
      lifecycle: { outPoint: 80 },
      playout: { mode: 'auto-out', holdMs: 3000 },
    } as unknown as Scene;
    const { html } = await makeExporter().produce(scene);

    const m = /<script name="cg-playout"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const meta = JSON.parse((m?.[1] ?? '').trim()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      mode: 'auto-out',
      holdMs: 3000,
      outPoint: 80,
      // (100 - 80) / 50 fps * 1000 = 400 ms
      outroDurationMs: 400,
    });
  });
});

describe('ExporterSingleFile — D-028 list field / ticker preflight', () => {
  it('exports a list field as a GDD array and warns about limited third-party clients', async () => {
    const scene: Scene = {
      ...makeScene(),
      fields: [
        {
          id: 'headlines',
          label: 'Headlines',
          required: false,
          type: 'list',
          default: [{ id: 'i1', text: 'خبر' }],
        },
      ],
    } as unknown as Scene;
    const { html, issues } = await makeExporter().produce(scene);

    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(gdd.properties['headlines']?.type).toBe('array');
    expect(gdd.properties['headlines']?.items?.type).toBe('object');

    expect(
      issues.some(
        (i) =>
          i.code === 'gdd-list-field-limited-clients' &&
          i.severity === 'warning' &&
          i.fieldId === 'headlines',
      ),
    ).toBe(true);
  });
});

describe('ExporterSingleFile — D-028 finite ticker under a TIMED hold (info)', () => {
  it('flags the combo as info (authored intent, never blocks)', async () => {
    const scene: Scene = {
      ...makeScene(),
      playout: { mode: 'auto-out', holdMs: 3000 },
      layers: [
        {
          id: 'L1',
          name: 'band',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'tk-1',
              name: 'Crawl',
              type: 'ticker',
              transform: {
                position: { x: 0, y: 980 },
                size: { w: 1200, h: 72 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
              font: {
                family: 'Vazirmatn',
                weight: 500,
                style: 'normal',
                size: 36,
                lineHeight: 1.4,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              direction: 'rtl',
              speed: 120,
              repeat: 2,
              cycleBoundary: 'seamless',
              gap: 48,
              items: [{ id: 'i1', text: 'sample' }],
            },
          ],
        },
      ],
      fields: [],
    } as unknown as Scene;
    const { issues } = await makeExporter().produce(scene);
    const info = issues.find((i) => i.code === 'ticker-finite-with-timed-hold');
    expect(info).toBeDefined();
    expect(info?.severity).toBe('info');
    expect(info?.elementId).toBe('tk-1');
  });

  it('stays silent when the hold is content-driven', async () => {
    const scene: Scene = {
      ...makeScene(),
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      layers: [],
      fields: [],
    } as unknown as Scene;
    const { issues } = await makeExporter().produce(scene);
    expect(issues.some((i) => i.code === 'ticker-finite-with-timed-hold')).toBe(false);
  });
});
