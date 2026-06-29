import { describe, expect, it } from 'vitest';
import { ExporterSingleFile, cgCss, cgJsIife } from '@cg/single-file-export';
import type { Scene } from '@cg/shared-schema';
import type { ImageAssetSource } from '@cg/single-file-export';

/**
 * B-038 Phase 1 — proves `@cg/single-file-export` is importable from the **Runtime**
 * (browser-tier) and produces a self-contained HTML using the REAL runtime bundle.
 * This is the precondition for Phase 2 (the bridge obtaining render HTML); the
 * Runtime app itself does not yet use the exporter.
 */

function fixtureScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's1',
    name: 'Runtime Fixture',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    background: 'transparent',
    layers: [],
    fields: [
      { id: 'f0', label: 'Title', required: true, type: 'text', default: 'سلام', maxLength: 100 },
    ],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as Scene;
}

const nullAssets: ImageAssetSource = {
  get: () => Promise.resolve(null),
  bytes: () => Promise.resolve(null),
};

describe('@cg/single-file-export is Runtime-importable', () => {
  it('produces a self-contained HTML for a fixture scene with the real IIFE runtime inlined', async () => {
    const exporter = new ExporterSingleFile({ cgJsIife, cgCss, fontsCss: '', assets: nullAssets });
    const { html } = await exporter.produce(fixtureScene());

    expect(html).toContain('<!doctype html');
    expect(html).toContain('CG.createRuntime(scene, { assetUrls:');
    expect(html).toContain('CG.installCasparGlobals');
    // The REAL @cg/template-runtime IIFE bundle (window.CG) is inlined — not a stub.
    expect(cgJsIife).toContain('var CG');
    expect(html).toContain(cgJsIife);
    // No external resource references (CasparCG fetches nothing extra).
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/src="https?:/);
  });
});
