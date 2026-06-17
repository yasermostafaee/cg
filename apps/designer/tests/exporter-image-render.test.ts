import { describe, expect, it } from 'vitest';
import { unpack } from '@cg/vcg-format';
import type { Scene, Element } from '@cg/shared-schema';
import type { AssetMeta } from '@cg/shared-ipc';
import { Exporter } from '../src/platform/Exporter.js';
import { ExporterSingleFile } from '../src/platform/ExporterSingleFile.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { collectImageElements } from '../src/platform/image-export.js';
import { defaultImage } from '../src/renderer/state/element-defaults.js';

/**
 * D-062 — per-project image elements render in exported output: the `.vcg`
 * packages the bytes and wires the served runtime's `<img>` src; the single-file
 * HTML base64-inlines them. A missing image is reported (blocked on `.vcg`, warned
 * on HTML), never silently broken. (The runtime `assetUrls` seam itself is unit-
 * tested in `@cg/template-runtime` `image-assets.test.ts`.)
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SHA = 'a'.repeat(64);
const ASSET_ID = 'logo-1';

const logoMeta: AssetMeta = {
  assetId: ASSET_ID,
  kind: 'image',
  filename: 'logo.png',
  sha256: SHA,
  byteSize: PNG.byteLength,
  workingPath: `projects/p/assets/image/${SHA}.png`,
};
const RELATIVE_PATH = `assets/image/${SHA}.png`;

/** AssetStore stub exposing only what the exporters call (list/get/bytes). */
function stubAssets(present: boolean): AssetStore {
  return {
    list: async () => (present ? [logoMeta] : []),
    get: async (id: string) => (present && id === ASSET_ID ? logoMeta : null),
    bytes: async (id: string) => (present && id === ASSET_ID ? PNG : null),
  } as unknown as AssetStore;
}

function sceneWithImage(): Scene {
  const img: Element = defaultImage('logo', 100, 100, ASSET_ID);
  return {
    schemaVersion: 1,
    id: 's-img',
    name: 'Logo Scene',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [img],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function makeVcgExporter(present: boolean): Exporter {
  return new Exporter({
    assets: stubAssets(present),
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
    assets: stubAssets(present),
    fetchUrl: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('D-062 — .vcg image rendering', () => {
  it('packages the image bytes and bakes the assetUrls map into the served index.html', async () => {
    const { vcg } = await makeVcgExporter(true).produce(sceneWithImage());
    const { files } = await unpack(vcg);

    // (a) the asset bytes are packaged at the relative path
    expect(files.has(RELATIVE_PATH)).toBe(true);
    expect(files.get(RELATIVE_PATH)).toEqual(PNG);

    // (b) the served index.html passes the assetId → relative path map to createRuntime
    const indexHtml = decode(files.get('index.html')!);
    expect(indexHtml).toContain('createRuntime(scene, { assetUrls:');
    expect(indexHtml).toContain(ASSET_ID);
    expect(indexHtml).toContain(RELATIVE_PATH);
    // no external/absolute reference — relative packaged path only
    expect(indexHtml).not.toContain('http://');
  });

  it('blocks the export when the image asset is missing (preflight error)', async () => {
    await expect(makeVcgExporter(false).produce(sceneWithImage())).rejects.toThrow(
      /missing-asset|blocked/,
    );
  });
});

describe('D-062 — single-file HTML image rendering', () => {
  it('base64-inlines the image and bakes it into the createRuntime assetUrls map', async () => {
    const { html, issues } = await makeHtmlExporter(true).produce(sceneWithImage());
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('CG.createRuntime(scene, { assetUrls:');
    expect(html).toContain(ASSET_ID);
    // self-contained: the inlined image is a data: URI, not an external ref
    expect(html).not.toContain(RELATIVE_PATH);
    expect(issues.some((i) => i.code === 'missing-asset')).toBe(false);
  });

  it('warns (does not block) when the image asset is missing', async () => {
    const { html, issues } = await makeHtmlExporter(false).produce(sceneWithImage());
    const miss = issues.find((i) => i.code === 'missing-asset');
    expect(miss).toBeDefined();
    expect(miss?.severity).toBe('warning');
    expect(miss?.elementId).toBe('logo');
    // export still produced (HTML never blocks)
    expect(html).toContain('CG.createRuntime');
  });
});

describe('D-062 — collectImageElements recurses comps + containers', () => {
  it('finds image elements in top-level layers, containers, and compositions', () => {
    // A structural scene (cast — collectImageElements walks the tree, it does not
    // schema-validate) with images at three depths.
    const scene = {
      layers: [
        {
          children: [
            { id: 'top', type: 'image', assetId: 'a-top' },
            {
              id: 'box',
              type: 'container',
              children: [{ id: 'inBox', type: 'image', assetId: 'a-box' }],
            },
          ],
        },
      ],
      compositions: [
        {
          layers: [{ children: [{ id: 'inComp', type: 'image', assetId: 'a-comp' }] }],
        },
      ],
    } as unknown as Scene;

    const ids = collectImageElements(scene)
      .map((r) => r.assetId)
      .sort();
    expect(ids).toEqual(['a-box', 'a-comp', 'a-top']);
  });
});
