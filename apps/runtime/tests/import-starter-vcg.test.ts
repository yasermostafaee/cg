import { describe, expect, it } from 'vitest';
import { pack, unpack } from '@cg/vcg-format';
import {
  compositionClosure,
  migrateGlobalFieldsToCompositions,
  type AssetEntry,
  type FontReference,
  type Manifest,
  type Scene,
} from '@cg/shared-schema';
import { STARTER_TEMPLATES } from '@cg/starter-templates';
import { produceTemplateDelivery } from '../src/renderer/features/library/templateDelivery.js';

/**
 * D-119 cross-app boundary guard, modeled on import-path-morph-vcg.test.ts:
 * every starter template, exported the way the Designer actually exports it
 * (per-composition scoping of the ENTRY comp — see scene-doc.ts
 * `scopeSceneToComposition`), must cross the runtime app's REAL import path
 * (`produceTemplateDelivery` = verify → unpack → single-file render). The
 * starters collectively exercise every element kind the set relies on —
 * ticker, clock (wall + timezone), sequence, path (+ whole-shape morph
 * track), composition instances — so ANY schema drift between the apps
 * fails HERE, at the boundary the operator actually crosses.
 */

/**
 * Mirror the Designer's load + export projection for a starter:
 * `ensureCompositions` migrates root fields into the owning comp, then
 * `scopeSceneToComposition` lifts the entry comp onto the scene root and
 * keeps only its transitive nested closure. (The off-frame static filter is
 * a size optimization and is irrelevant to schema fidelity, so it is not
 * replicated.)
 */
function scopedExportOf(starterScene: Scene): Scene {
  const migrated = migrateGlobalFieldsToCompositions({ ...starterScene, layers: [] });
  const comps = migrated.compositions ?? [];
  const entryId = migrated.entryCompositionId ?? comps[0]?.id;
  const entry = comps.find((c) => c.id === entryId);
  if (entry === undefined) throw new Error('starter has no entry composition');
  const closure = compositionClosure(migrated, entry.id);
  return {
    ...migrated,
    name: entry.name,
    resolution: entry.resolution,
    frameRange: entry.frameRange,
    ...(entry.activeRange !== undefined ? { activeRange: entry.activeRange } : {}),
    ...(entry.lifecycle !== undefined ? { lifecycle: entry.lifecycle } : {}),
    ...(entry.playout !== undefined ? { playout: entry.playout } : {}),
    layers: entry.layers,
    fields: entry.fields ?? [],
    bindings: entry.bindings ?? [],
    compositions: comps.filter((c) => closure.has(c.id)),
  };
}

/** A verifiable `.vcg` — the same `pack()` the Designer's Exporter uses. */
async function buildStarterVcg(id: string, scene: Scene): Promise<Uint8Array> {
  const fontDeps: readonly FontReference[] = scene.fonts;
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: `tpl-${id}`,
    name: scene.name,
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-07-12T00:00:00.000Z',
      exportedAt: '2026-07-12T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
    fontDeps,
    assetIndex,
  } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  return pack({
    scene,
    manifestExtras,
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    assets: new Map(),
  });
}

describe('runtime import — every D-119 starter .vcg crosses the boundary', () => {
  for (const starter of STARTER_TEMPLATES) {
    it(`${starter.id}: verify → unpack → render, scene preserved verbatim`, async () => {
      const scoped = scopedExportOf(starter.scene);
      const bytes = await buildStarterVcg(starter.id, scoped);

      const delivery = await produceTemplateDelivery(bytes);
      expect(delivery.template.templateId).toBe(`tpl-${starter.id}`);
      expect(delivery.template.templateType).toBe(starter.scene.templateType);

      const { scene } = await unpack(bytes);
      expect(scene).toEqual(scoped);

      // The on-air footprint comp travels in the package (nested closure).
      const onairTag = starter.scene.metadata.tags?.find((t) => t.startsWith('onair:'));
      const onairId = onairTag?.slice('onair:'.length) ?? '';
      expect((scene.compositions ?? []).map((c) => c.id)).toContain(onairId);
    });
  }

  it('irib-news: the delivered HTML carries the live composite intact', async () => {
    const starter = STARTER_TEMPLATES.find((s) => s.id === 'irib-news');
    if (starter === undefined) throw new Error('irib-news starter missing');
    const scoped = scopedExportOf(starter.scene);
    const delivery = await produceTemplateDelivery(await buildStarterVcg('irib-news', scoped));
    // Clocks with per-element timezones, the crawl, the brand tag, and the
    // migrated data-key fields all survive to the playout side.
    expect(delivery.html).toContain('"clock"');
    expect(delivery.html).toContain('"Asia/Tehran"');
    expect(delivery.html).toContain('"UTC"');
    expect(delivery.html).toContain('"ticker"');
    expect(delivery.html).toContain('@IRIBNEWS');
    expect(delivery.html).toContain('"ticker-items"');
    expect(delivery.html).toContain('"headlines"');
  });

  it('logo-bug: the whole-shape path-morph track survives to the playout side', async () => {
    const starter = STARTER_TEMPLATES.find((s) => s.id === 'logo-bug');
    if (starter === undefined) throw new Error('logo-bug starter missing');
    const scoped = scopedExportOf(starter.scene);
    const delivery = await produceTemplateDelivery(await buildStarterVcg('logo-bug', scoped));
    expect(delivery.html).toContain('"kind":"path"');
    expect(delivery.html).toContain('"loop-cycle"');
  });

  it('sequence: the finite sequence element and its list binding survive', async () => {
    const starter = STARTER_TEMPLATES.find((s) => s.id === 'sequence');
    if (starter === undefined) throw new Error('sequence starter missing');
    const scoped = scopedExportOf(starter.scene);
    const delivery = await produceTemplateDelivery(await buildStarterVcg('sequence', scoped));
    expect(delivery.html).toContain('"sequence"');
    expect(delivery.html).toContain('"sequence-items"');
    expect(delivery.html).toContain('"content-driven"');
  });
});
