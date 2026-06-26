import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
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
    background: 'transparent',
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
  it('warns that .vcg ships no font bytes, so a ticker measures fallback glyphs', async () => {
    const issues = await makeExporter().preflight(makeScene());
    const warn = issues.find((i) => i.code === 'vcg-ticker-fonts-not-bundled');
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning'); // warn, don't block
    expect(warn?.elementId).toBe('tk-1');
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
