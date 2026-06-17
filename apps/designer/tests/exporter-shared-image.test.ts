import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { Scene, Element } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { Exporter } from '../src/platform/Exporter.js';
import { ExporterSingleFile } from '../src/platform/ExporterSingleFile.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import type { ImageAssetLibrary } from '../src/platform/image-export.js';
import { defaultImage } from '../src/renderer/state/element-defaults.js';

/**
 * D-040 — a `source: 'shared'` logo resolves + inlines exactly like a per-project
 * asset, from the SHARED library, on both export paths. Preflight consults BOTH
 * stores (a logo present only in the library is NOT falsely flagged missing).
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SHA = 'b'.repeat(64);
const LOGO_ID = 'lib-logo-1';
const RELATIVE_PATH = `assets/image/${SHA}.png`;

const logoMeta: AssetMeta = {
  assetId: LOGO_ID,
  kind: 'image',
  filename: 'channel-logo.png',
  sha256: SHA,
  byteSize: PNG.byteLength,
  workingPath: `shared/images/${SHA}.png`,
};

/** Project store stub — empty (the logo lives only in the shared library). */
const emptyProject = {
  list: async () => [],
  get: async () => null,
  bytes: async () => null,
} as unknown as AssetStore;

/** Shared library stub holding the logo (or empty when `present` is false). */
function stubLibrary(present: boolean): ImageAssetLibrary {
  return {
    list: () => Promise.resolve(present ? [logoMeta] : []),
    get: (id) => Promise.resolve(present && id === LOGO_ID ? logoMeta : null),
    bytes: (id) => Promise.resolve(present && id === LOGO_ID ? PNG : null),
  };
}

function sceneWithSharedLogo(opts?: { id?: string; inComposition?: boolean }): Scene {
  const logo: Element = defaultImage('logo', 100, 100, LOGO_ID, { source: 'shared' });
  const base = {
    schemaVersion: 1 as const,
    id: opts?.id ?? 's-logo',
    name: 'Logo Scene',
    templateType: 'lower-third' as const,
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent' as const,
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
  const layer = (children: Element[]) => ({
    id: 'L1',
    name: 'main',
    visible: true,
    locked: false,
    blendMode: 'normal' as const,
    children,
  });
  if (opts?.inComposition === true) {
    return {
      ...base,
      layers: [layer([])],
      compositions: [{ ...base, id: 'comp-1', name: 'comp', layers: [layer([logo])] }],
    } as unknown as Scene;
  }
  return { ...base, layers: [layer([logo])] } as unknown as Scene;
}

function makeVcgExporter(present: boolean): Exporter {
  return new Exporter({
    assets: emptyProject,
    sharedImages: stubLibrary(present),
    cgJs: 'export const createRuntime = () => {}; export const installCasparGlobals = () => {};',
    cgCss: 'html{background:transparent}',
  });
}

function makeHtmlExporter(present: boolean): ExporterSingleFile {
  return new ExporterSingleFile({
    cgJsIife:
      'var CG = { createRuntime: function(){ return { ready: Promise.resolve() }; }, installCasparGlobals: function(){} };',
    cgCss: 'html{background:transparent}',
    fontsCss: '',
    assets: emptyProject,
    sharedImages: stubLibrary(present),
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('D-040 — .vcg packages a shared logo from the library', () => {
  it('packages the library bytes and bakes the assetUrls map (resolved from shared, not project)', async () => {
    const { vcg } = await makeVcgExporter(true).produce(sceneWithSharedLogo());
    const { files } = await unpack(vcg);
    expect(files.has(RELATIVE_PATH)).toBe(true);
    expect(files.get(RELATIVE_PATH)).toEqual(PNG);
    const indexHtml = decode(files.get('index.html')!);
    expect(indexHtml).toContain(LOGO_ID);
    expect(indexHtml).toContain(RELATIVE_PATH);
    expect(indexHtml).not.toContain('http://');
  });

  it('packages a logo nested in a composition (recurses comps/containers)', async () => {
    const { vcg } = await makeVcgExporter(true).produce(
      sceneWithSharedLogo({ inComposition: true }),
    );
    const { files } = await unpack(vcg);
    expect(files.get(RELATIVE_PATH)).toEqual(PNG);
  });

  it('the same shared logo in two projects inlines independently from the one source', async () => {
    const a = await makeVcgExporter(true).produce(sceneWithSharedLogo({ id: 'proj-a' }));
    const b = await makeVcgExporter(true).produce(sceneWithSharedLogo({ id: 'proj-b' }));
    expect((await unpack(a.vcg)).files.get(RELATIVE_PATH)).toEqual(PNG);
    expect((await unpack(b.vcg)).files.get(RELATIVE_PATH)).toEqual(PNG);
  });

  it('does NOT block when the logo resolves only in the shared library (preflight unions both stores)', async () => {
    // Regression: a `source: 'shared'` id is not in the project list, but preflight
    // must treat it as known because it resolves in the shared store.
    await expect(makeVcgExporter(true).produce(sceneWithSharedLogo())).resolves.toBeDefined();
  });

  it('blocks when the logo is missing from BOTH stores', async () => {
    await expect(makeVcgExporter(false).produce(sceneWithSharedLogo())).rejects.toThrow(
      /missing-asset|blocked/,
    );
  });
});

describe('D-040 — single-file HTML inlines a shared logo', () => {
  it('base64-inlines the library bytes (self-contained, no external ref)', async () => {
    const { html, issues } = await makeHtmlExporter(true).produce(sceneWithSharedLogo());
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain(LOGO_ID);
    expect(html).not.toContain(RELATIVE_PATH);
    expect(issues.some((i) => i.code === 'missing-asset')).toBe(false);
  });

  it('warns (does not block) when the logo is missing from both stores', async () => {
    const { html, issues } = await makeHtmlExporter(false).produce(sceneWithSharedLogo());
    const miss = issues.find((i) => i.code === 'missing-asset');
    expect(miss?.severity).toBe('warning');
    expect(miss?.elementId).toBe('logo');
    expect(html).toContain('CG.createRuntime');
  });
});
