import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { Composition, Element, Layer, Scene } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { Exporter } from '../src/platform/Exporter.js';
import { ExporterSingleFile } from '@cg/single-file-export';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { scopeSceneToComposition } from '../src/renderer/state/scene-doc.js';
import {
  defaultImage,
  defaultRepeater,
  defaultSequence,
} from '../src/renderer/state/element-defaults.js';

/**
 * D-086 — per-composition export scoping. Exports package the OPEN composition plus
 * its transitive nested CLOSURE (children reached via a `composition` instance OR a
 * `repeater`) — never sibling compositions. The runtime's only play-entry is
 * `scene.layers`, so the scoped scene also LIFTS the root comp's layers up; a raw,
 * layerless root would render a blank frame. And because the scoped scene's
 * `compositions` is just the closure, the exporter's whole-project preflight
 * auto-scopes too: a broken sibling no longer blocks a valid root.
 */

const A_ROOT = 'a-root';
const A_CHILD = 'a-child';
const A_REP = 'a-rep';
const A_SIB = 'a-sib';
const A_SEQ = 'a-seq';
// Distinct VALID hex digests (the manifest/pack rejects non-hex sha256).
const HEX: Record<string, string> = {
  r: 'a1'.repeat(32),
  c: 'b2'.repeat(32),
  p: 'c3'.repeat(32),
  s: 'd4'.repeat(32),
  q: 'e5'.repeat(32),
};
const shaOf = (k: string): string => HEX[k]!;
const pathOf = (sha: string): string => `assets/image/${sha}.png`;

const ASSETS: Record<string, { meta: AssetMeta; bytes: Uint8Array }> = {
  [A_ROOT]: assetFixture(A_ROOT, shaOf('r'), 11),
  [A_CHILD]: assetFixture(A_CHILD, shaOf('c'), 22),
  [A_REP]: assetFixture(A_REP, shaOf('p'), 33),
  [A_SIB]: assetFixture(A_SIB, shaOf('s'), 44),
  [A_SEQ]: assetFixture(A_SEQ, shaOf('q'), 55),
};

function assetFixture(
  assetId: string,
  sha: string,
  marker: number,
): { meta: AssetMeta; bytes: Uint8Array } {
  return {
    meta: {
      assetId,
      kind: 'image',
      filename: `${assetId}.png`,
      sha256: sha,
      byteSize: 5,
      workingPath: `p/${sha}.png`,
    },
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, marker]),
  };
}

/** AssetStore stub exposing only what the exporters call, over a chosen present set. */
function stubAssets(presentIds: readonly string[]): AssetStore {
  const present = new Set(presentIds);
  const get = (id: string): AssetMeta | null => (present.has(id) ? ASSETS[id]!.meta : null);
  return {
    list: async () => presentIds.map((id) => ASSETS[id]!.meta),
    get: async (id: string) => get(id),
    bytes: async (id: string) => (present.has(id) ? ASSETS[id]!.bytes : null),
  } as unknown as AssetStore;
}

function imageEl(id: string, assetId: string): Element {
  return defaultImage(id, 0, 0, assetId);
}

function compInstance(id: string, compositionId: string): Element {
  return {
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };
}

function layerOf(children: Element[]): Layer {
  return {
    id: `L-${children[0]?.id ?? 'x'}`,
    name: 'L',
    visible: true,
    locked: false,
    blendMode: 'normal',
    children,
  };
}

function comp(id: string, children: Element[]): Composition {
  return {
    id,
    name: id,
    resolution: { width: 200, height: 100 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [layerOf(children)],
    fields: [],
    bindings: [],
  };
}

/**
 * Root R holds its own image plus a `composition` instance of C and a `repeater` of
 * P; S is a sibling never referenced from R. Each comp carries a distinct image.
 */
function fourCompScene(): Scene {
  return {
    schemaVersion: 1,
    id: 's-d086',
    name: 'project',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [], // post-D-024 the root is layerless; content lives in compositions
    compositions: [
      comp('R', [
        imageEl('imgR', A_ROOT),
        compInstance('instC', 'C'),
        defaultRepeater('repP', 0, 0, { id: 'P', fields: [] }),
      ]),
      comp('C', [imageEl('imgC', A_CHILD)]),
      comp('P', [imageEl('imgP', A_REP)]),
      comp('S', [imageEl('imgS', A_SIB)]),
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function makeVcgExporter(presentIds: readonly string[]): Exporter {
  return new Exporter({
    assets: stubAssets(presentIds),
    cgJs: 'export const createRuntime = () => {}; export const installCasparGlobals = () => {};',
    cgCss: 'html{background:transparent}',
  });
}

function makeHtmlExporter(presentIds: readonly string[]): ExporterSingleFile {
  return new ExporterSingleFile({
    cgJsIife:
      'var CG = { createRuntime: function(){ return { ready: Promise.resolve() }; }, installCasparGlobals: function(){} };',
    cgCss: 'html{background:transparent}',
    fontsCss: '',
    assets: stubAssets(presentIds),
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

const ALL = [A_ROOT, A_CHILD, A_REP, A_SIB] as const;

describe('D-086 — .vcg packages the root closure, excludes siblings', () => {
  it('packages the root + nested (composition AND repeater) images, NOT the sibling', async () => {
    const scoped = scopeSceneToComposition(fourCompScene(), 'R')!;
    expect(scoped).not.toBeNull();
    // The root's layers are lifted up (the runtime play-entry) and the sibling is gone.
    expect(scoped.layers).toHaveLength(1);
    expect((scoped.compositions ?? []).map((c) => c.id).sort()).toEqual(['C', 'P']);

    const { vcg } = await makeVcgExporter(ALL).produce(scoped);
    const { files } = await unpack(vcg);

    expect(files.has(pathOf(shaOf('r')))).toBe(true); // root's own image
    expect(files.has(pathOf(shaOf('c')))).toBe(true); // via composition instance
    expect(files.has(pathOf(shaOf('p')))).toBe(true); // via repeater
    expect(files.has(pathOf(shaOf('s')))).toBe(false); // sibling — excluded
  });
});

/**
 * 🔴 `B-352` — every composition of one project exported with the PROJECT's id, so in CG Control each
 * import replaced the one before it. Each composition's package now has an id of its own, the same
 * on every re-export.
 */
describe('🔴 B-352 — one package id per composition', () => {
  it('two compositions of one project export with two ids, neither the project’s', async () => {
    const project = fourCompScene();
    const r = scopeSceneToComposition(project, 'R')!;
    const s = scopeSceneToComposition(project, 'S')!;
    expect(r.id).not.toBe(s.id);
    expect(r.id).not.toBe(project.id);
    const manifestId = async (scene: Scene): Promise<string> =>
      (await unpack((await makeVcgExporter(ALL).produce(scene)).vcg)).manifest.id;
    expect(await manifestId(r)).toBe(r.id);
    expect(await manifestId(s)).toBe(s.id);
  });

  it('the same composition re-exported keeps its id (its template UPDATES in CG Control)', () => {
    expect(scopeSceneToComposition(fourCompScene(), 'R')!.id).toBe(
      scopeSceneToComposition(fourCompScene(), 'R')!.id,
    );
  });

  it('a project saved as a copy (another project id) exports the same composition under another id', () => {
    const copy = { ...fourCompScene(), id: 'the-copy' };
    expect(scopeSceneToComposition(copy, 'R')!.id).not.toBe(
      scopeSceneToComposition(fourCompScene(), 'R')!.id,
    );
  });
});

describe('D-086 — single-file HTML inlines the root closure, excludes siblings', () => {
  it('inlines the nested (composition + repeater) images, never the sibling', async () => {
    const scoped = scopeSceneToComposition(fourCompScene(), 'R')!;
    const { html } = await makeHtmlExporter(ALL).produce(scoped);
    // All inlined assets resolve to the same 5-byte PNG fixture; assert each id is
    // wired into the assetUrls map and the sibling id never appears.
    expect(html).toContain('imgR');
    expect(html).toContain('imgC');
    expect(html).toContain('imgP');
    expect(html).not.toContain('imgS');
    expect(html).toContain('data:image/png;base64,');
  });
});

describe('D-083 — a sequence COMPOSITION item pulls its comp into the export closure', () => {
  /** Root RS holds a sequence whose item-2 is a composition item referencing Q (which carries an image). */
  function sequenceCompScene(): Scene {
    const seq = defaultSequence('seqEl', 0, 0);
    seq.items = [
      { id: 's1', text: 'Headline' },
      { id: 's2', kind: 'composition', compositionId: 'Q' },
    ];
    return {
      schemaVersion: 1,
      id: 's-d083',
      name: 'rotating-title',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [],
      compositions: [comp('RS', [seq]), comp('Q', [imageEl('imgQ', A_SEQ)])],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    };
  }

  it('packages the composition referenced ONLY by a sequence item (its asset is bundled)', async () => {
    const scoped = scopeSceneToComposition(sequenceCompScene(), 'RS')!;
    expect(scoped).not.toBeNull();
    // Q is reachable from RS only through the sequence composition item.
    expect((scoped.compositions ?? []).map((c) => c.id)).toEqual(['Q']);

    const { vcg } = await makeVcgExporter([A_SEQ]).produce(scoped);
    const { files } = await unpack(vcg);
    expect(files.has(pathOf(shaOf('q')))).toBe(true);
  });
});

describe('🔴 B-249 — a per-composition export carries no dangling `entryCompositionId`', () => {
  it('exporting the MAIN composition: the root IS the entry, so the pointer is absent', async () => {
    const scoped = scopeSceneToComposition({ ...fourCompScene(), entryCompositionId: 'R' }, 'R')!;
    // `R` was flattened into the root and is not in `compositions` — the id would name nothing.
    expect((scoped.compositions ?? []).map((c) => c.id)).not.toContain('R');
    expect('entryCompositionId' in scoped).toBe(false);
    // …and the PACKAGE says the same: the template.json a reader gets has no pointer either.
    const { scene } = await unpack((await makeVcgExporter(ALL).produce(scoped)).vcg);
    expect('entryCompositionId' in scene).toBe(false);
  });

  it('exporting a composition that NESTS the project main: still absent, never the nested one', () => {
    // The project's main is C, which R instances. Copied through, the export would name a
    // composition it does contain — and a reader would take a NESTED panel for the entry.
    const project = { ...fourCompScene(), entryCompositionId: 'C' };
    const scoped = scopeSceneToComposition(project, 'R')!;
    expect((scoped.compositions ?? []).map((c) => c.id)).toContain('C');
    expect('entryCompositionId' in scoped).toBe(false);
  });

  it('the PROJECT is untouched — only the export drops it', () => {
    const project = { ...fourCompScene(), entryCompositionId: 'R' };
    scopeSceneToComposition(project, 'R');
    expect(project.entryCompositionId).toBe('R');
  });
});

describe('D-086 — preflight auto-scopes to the closure', () => {
  it('a missing asset in a SIBLING comp does not block the root export', async () => {
    const scene = fourCompScene();
    // Everything resolves except the sibling S's asset.
    const present = [A_ROOT, A_CHILD, A_REP];

    // Whole-project export WOULD block on the sibling's missing asset…
    await expect(makeVcgExporter(present).produce(scene)).rejects.toThrow(/missing-asset|blocked/);

    // …but the scoped root export drops S entirely, so it succeeds.
    const scoped = scopeSceneToComposition(scene, 'R')!;
    const { vcg } = await makeVcgExporter(present).produce(scoped);
    expect(vcg.byteLength).toBeGreaterThan(0);
  });
});
