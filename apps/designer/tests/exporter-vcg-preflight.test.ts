import { describe, expect, it } from 'vitest';
import { CG_CONTROL_KEY, type Scene } from '@cg/shared-schema';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { defaultTicker } from '../src/renderer/state/element-defaults.js';

function makeScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'Crawl',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [defaultTicker('tk-1', 0, 980)],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-10T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z' },
  } as unknown as Scene;
}

function makeExporter(): Exporter {
  return new Exporter({
    assets: { list: async () => [] } as unknown as AssetStore,
    cgJs: 'export const x = 1;',
    cgCss: 'html{background:transparent}',
  });
}

describe('Exporter (.vcg) preflight — D-028 ticker', () => {
  /**
   * D-121 SUPERSEDES the original D-028 assertion here (".vcg ships no font bytes,
   * so ANY ticker warns"). The `.vcg` now bundles the fonts it can, and this scene's
   * ticker uses `Vazirmatn` — a face the RUNTIME app ships and inlines itself, so it
   * IS present on air and its crawl measures real glyphs. Warning on it would be a
   * lie. The re-scoped warning (fires only for a font that genuinely can't be
   * bundled, e.g. a system face) is covered in `exporter-vcg-fonts.test.ts`.
   */
  it('no longer warns for a ticker whose face the runtime already ships (D-121)', async () => {
    const issues = await makeExporter().preflight(makeScene());
    expect(issues.some((i) => i.code === 'vcg-ticker-fonts-not-bundled')).toBe(false);
  });

  it('stays silent for scenes without tickers', async () => {
    const scene = { ...makeScene(), layers: [] } as Scene;
    const issues = await makeExporter().preflight(scene);
    expect(issues.some((i) => i.code === 'vcg-ticker-fonts-not-bundled')).toBe(false);
  });

  it('flags a ticker IMAGE separator that references an unknown asset (D-039ext)', async () => {
    const scene = makeScene();
    const ticker = (scene.layers[0] as { children: { separator?: unknown }[] }).children[0];
    ticker.separator = {
      kind: 'image',
      assetId: 'ghost-logo',
      source: 'shared',
      size: { w: 30, h: 24 },
    };
    const issues = await makeExporter().preflight(scene);
    const err = issues.find((i) => i.code === 'missing-asset' && i.message.includes('ghost-logo'));
    expect(err).toBeDefined();
    expect(err?.severity).toBe('error'); // block, exactly like a missing image element
    expect(err?.elementId).toBe('tk-1');
  });

  it('does not flag a plain TEXT separator (no asset)', async () => {
    const scene = makeScene();
    const ticker = (scene.layers[0] as { children: { separator?: unknown }[] }).children[0];
    ticker.separator = ' • ';
    const issues = await makeExporter().preflight(scene);
    expect(issues.some((i) => i.code === 'missing-asset')).toBe(false);
  });
});

describe('tasks.md 6.7 — the reserved control key is not an authorable name', () => {
  /*
    🔴 THIS TEST IS HALF OF A PROOF, not a nicety.

    The bridge carries the active LOOK id to the page inside the `CG UPDATE` field payload,
    under `CG_CONTROL_KEY`. A field id is `z.string().min(1)` and the Designer only trims what
    the author types, so there is NO character class that puts the key out of an author's
    reach — "provably distinct" has to be MADE true. It is made true twice: the page strips the
    key before applying field values (so control data can never become a field value, even in a
    hand-edited scene), and the export refuses a scene that declares the name at all — which is
    what tells the AUTHOR, at the one moment they can still rename it.
  */

  it('🔴 refuses a FIELD whose id is the reserved key, with an error that blocks the export', async () => {
    const scene = makeScene();
    (scene as unknown as { fields: unknown[] }).fields = [
      { id: CG_CONTROL_KEY, type: 'text', label: 'Oops', required: false, default: '' },
    ];

    const issues = await makeExporter().preflight(scene);

    const issue = issues.find((i) => i.code === 'reserved-control-key');
    expect(issue?.severity, 'a warning would ship the collision with a note nobody reads').toBe(
      'error',
    );
    expect(issue?.fieldId).toBe(CG_CONTROL_KEY);
    // …and an error is what actually stops the export.
    await expect(makeExporter().produce(scene)).rejects.toThrow(/reserved-control-key/);
  });

  it('refuses a nested composition INSTANCE whose namespace name is the reserved key', async () => {
    // The other top-level payload shape: a namespace key sits beside the flat field ids, so
    // it can collide in exactly the same way and must be refused by the same rule.
    const scene = makeScene();
    (scene as unknown as { compositions: unknown[] }).compositions = [
      {
        id: 'c1',
        name: 'child',
        resolution: { width: 1920, height: 1080 },
        frameRange: { in: 0, out: 100 },
        editorBackdrop: 'transparent',
        layers: [],
        fields: [{ id: 'inner', type: 'text', label: 'Inner', required: false, default: '' }],
        bindings: [],
      },
    ];
    const layer = (scene as unknown as { layers: { children: unknown[] }[] }).layers[0];
    layer?.children.push({
      id: 'inst-1',
      name: CG_CONTROL_KEY,
      type: 'composition',
      compositionId: 'c1',
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 5,
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
    });

    const issues = await makeExporter().preflight(scene);

    expect(issues.some((i) => i.code === 'reserved-control-key' && i.severity === 'error')).toBe(
      true,
    );
  });

  it('an ordinary scene raises no reserved-key issue at all', async () => {
    const issues = await makeExporter().preflight(makeScene());
    expect(issues.some((i) => i.code === 'reserved-control-key')).toBe(false);
  });
});
