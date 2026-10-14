import { describe, expect, it } from 'vitest';
import type { Element as SceneElement, Scene } from '@cg/shared-schema';
import { collectImageElements } from '../src/image-export.js';
import { ExporterSingleFile } from '../src/exporter-single-file.js';
import { cgJsIife } from '../src/cg-runtime.js';
import type { ImageAssetSource } from '../src/image-export.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` — a picture a countdown STEP swaps in is shown by NO image
 * element at build time, so the export must carry it on its own account: otherwise the page on air
 * swaps to a picture it does not have. `collectImageElements` is the one list both exporters and
 * preflight read, so this is where it is pinned.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 } as const;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'l',
        name: 'l',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...EL,
            id: 'cd',
            name: 'cd',
            type: 'clock',
            font: {
              family: 'Vazirmatn',
              weight: 600,
              style: 'normal',
              size: 48,
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            color: '#ffffff',
            align: 'center',
            verticalAlign: 'middle',
            mode: 'countdown',
            format: 'mm:ss',
            digits: 'latin',
            target: { kind: 'duration', ms: 60_000 },
            steps: {
              steps: [
                {
                  name: 'Step 1',
                  atMs: 30_000,
                  changes: [
                    {
                      elementId: 'logo',
                      property: 'image',
                      value: { assetId: 'logo-red', source: 'project' },
                    },
                  ],
                },
              ],
            },
          },
          {
            ...EL,
            id: 'logo',
            name: 'logo',
            type: 'image',
            assetId: 'logo-blue',
            source: 'project',
            fit: 'contain',
            preserveAspect: true,
          },
        ] as SceneElement[],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
  } as unknown as Scene;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('a step’s picture is exported', () => {
  it('collectImageElements lists the picture a step swaps in, beside the authored one', () => {
    expect(
      collectImageElements(scene())
        .map((r) => r.assetId)
        .sort(),
    ).toEqual(['logo-blue', 'logo-red']);
  });

  it('the single-file page carries its bytes in the asset map the runtime swaps from', async () => {
    const assets: ImageAssetSource = {
      get: async (id) => ({ id, filename: `${id}.png`, kind: 'image', size: PNG.length }) as never,
      bytes: async () => PNG,
    };
    const { html, issues } = await new ExporterSingleFile({
      cgJsIife,
      cgCss: '',
      fontsCss: '',
      assets,
      fetchUrl: async () => new ArrayBuffer(0),
    }).produce(scene());
    expect(issues).toEqual([]);
    expect(html).toContain('"logo-red":"data:image/png;base64,');
    expect(html).toContain('"logo-blue":"data:image/png;base64,');
  });
});
