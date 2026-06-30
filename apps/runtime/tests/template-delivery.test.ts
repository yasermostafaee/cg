import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { pack, sha256Hex } from '@cg/vcg-format';
import type { AssetEntry, FontReference, Manifest, Scene } from '@cg/shared-schema';
import {
  importTemplateFromBytes,
  produceTemplateDelivery,
  type TemplateImportBridge,
} from '../src/renderer/features/library/templateDelivery.js';

// B-038 Phase 3 — the bundled app fonts ship in apps/runtime. Read the real
// fonts.css + serve the woff2 from disk so the export inlines the bundled faces
// off-DOM (vitest node env has no `/fonts/` server).
const FONTS_CSS = readFileSync(
  fileURLToPath(new URL('../src/renderer/fonts.css', import.meta.url)),
  'utf-8',
);
function nodeFontFetch(url: string): Promise<ArrayBuffer> {
  // `url` is an app path like `/fonts/vazirmatn/…woff2`; resolve it under public/.
  const file = fileURLToPath(new URL(`../public${url}`, import.meta.url));
  const buf = readFileSync(file);
  return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/**
 * B-038 Phase 2 — the browser produces the self-contained standalone HTML at
 * import and delivers it over `templates.import`. These tests drive the real
 * verify → unpack → single-file-export path against a `pack()`-built `.vcg`
 * (with an image asset), proving: the produced HTML is self-contained (runtime +
 * scene inlined, image inlined as a base64 `data:` URI, no external refs); the
 * delivery sends `{ template, html }`; and a bad package delivers nothing.
 */

// 1×1 transparent PNG — real bytes, so the inlined data URI is a genuine image.
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function fixtureScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-delivery-1',
    name: 'delivery-lower-third',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Content',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'el-logo',
            name: 'logo',
            type: 'image',
            transform: {
              position: { x: 40, y: 40 },
              size: { w: 200, h: 200 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            assetId: 'img-logo',
            source: 'project',
            fit: 'contain',
            preserveAspect: true,
          },
          {
            id: 'el-name',
            name: 'anchor',
            type: 'text',
            transform: {
              position: { x: 100, y: 800 },
              size: { w: 800, h: 80 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            text: '{{anchor}}',
            font: {
              family: 'Vazirmatn',
              weight: 700,
              style: 'normal',
              size: 48,
              lineHeight: 1.4,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            align: 'start',
            direction: 'rtl',
            fitMode: 'autosize',
            overflow: 'ellipsis',
          },
        ],
      },
    ],
    fields: [
      {
        id: 'anchor',
        label: 'Anchor name',
        required: true,
        type: 'text',
        default: 'سارا نادری',
        direction: 'rtl',
      },
    ],
    bindings: [
      {
        fieldId: 'anchor',
        target: { kind: 'text', elementId: 'el-name', placeholder: '{{anchor}}' },
      },
    ],
    fonts: [],
    metadata: { createdAt: '2026-06-30T00:00:00.000Z', updatedAt: '2026-06-30T00:00:00.000Z' },
  } as unknown as Scene;
}

/** Build a verifiable `.vcg` (id = `templateId`) carrying the 1×1 PNG image asset. */
async function buildVcgWithImage(templateId = 'tpl-delivery-1'): Promise<Uint8Array> {
  const scene = fixtureScene();
  const assetPath = `assets/image/${sha256Hex(PNG_1X1)}.png`;
  const assetIndex: readonly AssetEntry[] = [
    {
      id: 'img-logo',
      path: assetPath,
      kind: 'image',
      bytes: PNG_1X1.byteLength,
      sha256: sha256Hex(PNG_1X1),
      mime: 'image/png',
    },
  ];
  const fontDeps: readonly FontReference[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'delivery-lower-third',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-30T00:00:00.000Z',
      exportedAt: '2026-06-30T00:01:00.000Z',
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
    assets: new Map([[assetPath, PNG_1X1]]),
  });
}

describe('produceTemplateDelivery', () => {
  it('renders a self-contained HTML with the runtime + scene inlined and no external refs', async () => {
    const { template, html } = await produceTemplateDelivery(await buildVcgWithImage('tpl-x'));

    expect(template.templateId).toBe('tpl-x');
    expect(template.templateType).toBe('lower-third');
    expect(template.fields[0]?.id).toBe('anchor');

    expect(html).toContain('<!doctype html');
    // The REAL @cg/template-runtime IIFE + the scene literal are inlined.
    expect(html).toContain('CG.createRuntime(scene, { assetUrls:');
    expect(html).toContain('CG.installCasparGlobals');
    // No external resource references — CasparCG fetches nothing extra.
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/url\(['"]?\/fonts\//);
  });

  it('inlines the package image element as a base64 data URI', async () => {
    const { html } = await produceTemplateDelivery(await buildVcgWithImage());
    const expectedDataUri = `data:image/png;base64,${Buffer.from(PNG_1X1).toString('base64')}`;
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain(expectedDataUri);
  });

  it('throws (registers nothing) for bytes that fail verification', async () => {
    const notAVcg = new TextEncoder().encode('this is not a .vcg archive');
    await expect(produceTemplateDelivery(notAVcg)).rejects.toThrow(/failed verification/i);
  });

  // B-038 Phase 3 — the bundled Persian/Latin faces inline as base64; the HTML
  // stays self-contained (CasparCG fetches no external font) so Persian renders
  // with the correct Vazirmatn face on air.
  it('inlines the bundled @font-face faces as base64 with NO external font refs', async () => {
    const { html } = await produceTemplateDelivery(await buildVcgWithImage('tpl-fonts'), {
      fontsCss: FONTS_CSS,
      fetchUrl: nodeFontFetch,
    });

    // The bundled faces (incl. the Vazirmatn Arabic subset used for Persian) are
    // inlined as base64 woff2 data URIs — not left as `/fonts/…` URLs.
    expect(html).toContain('@font-face');
    expect(html).toContain('Vazirmatn');
    expect(html).toContain('data:font/woff2;base64,');
    // Still fully self-contained: no `/fonts/…` URLs survived inlining, no external
    // stylesheet/script/image loads. (A bare namespace string like the SVG xmlns
    // inside the runtime bundle is not an external load, so we don't blanket-ban
    // `http(s)://` — we ban external *references*.)
    expect(html).not.toMatch(/url\(['"]?\/fonts\//);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/src="https?:/);
  });
});

describe('importTemplateFromBytes', () => {
  it('delivers { template, html } to the bridge and returns the registered id', async () => {
    const sent: { template: unknown; html: string }[] = [];
    const bridge: TemplateImportBridge = {
      templates: {
        import: (req) => {
          sent.push(req);
          return Promise.resolve({ registered: true, templateId: req.template.templateId });
        },
      },
    };

    const result = await importTemplateFromBytes(bridge, await buildVcgWithImage('tpl-deliver'));

    expect(result.templateId).toBe('tpl-deliver');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.html).toContain('CG.createRuntime');
    expect((sent[0]?.template as { templateId: string }).templateId).toBe('tpl-deliver');
  });

  it('does not call the bridge when the package is invalid (registers nothing)', async () => {
    const importSpy = vi.fn();
    const bridge: TemplateImportBridge = {
      templates: { import: importSpy },
    };
    const notAVcg = new TextEncoder().encode('garbage');

    await expect(importTemplateFromBytes(bridge, notAVcg)).rejects.toThrow();
    expect(importSpy).not.toHaveBeenCalled();
  });
});
