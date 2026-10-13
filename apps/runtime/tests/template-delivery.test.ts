import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { pack, sha256Hex } from '@cg/vcg-format';
import { CG_RUNTIME_VERSION } from '@cg/shared-schema';
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
    editorBackdrop: 'transparent',
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
async function buildVcgWithImage(
  templateId = 'tpl-delivery-1',
  manifestName = 'delivery-lower-third',
  minRuntimeVersion = '0.0.0',
): Promise<Uint8Array> {
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
    name: manifestName,
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-06-30T00:00:00.000Z',
      exportedAt: '2026-06-30T00:01:00.000Z',
    },
    compatibility: { minRuntimeVersion, minCasparCGVersion: '2.3.0' },
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
    // R-004 — the manifest's display name crosses the import boundary onto TemplateInfo.
    expect(template.name).toBe('delivery-lower-third');

    expect(html).toContain('<!doctype html');
    // The REAL @cg/template-runtime IIFE + the scene literal are inlined.
    // D-137 §9 — the boot call now NAMES its render mode; 'output' is what makes a
    // Live Source paint zero pixels in the artifact that goes on air.
    expect(html).toContain("CG.createRuntime(scene, { mode: 'output', assetUrls:");
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

  // R-004 — `ManifestSchema.name` is `z.string()` with no `.min(1)`, so a blank name is a
  // packageable reality. It must leave `name` unset (NOT set it to "") so the Library falls
  // back to the id rather than rendering an empty row.
  it('falls back to the scene name when the packaged manifest name is blank', async () => {
    const { template } = await produceTemplateDelivery(await buildVcgWithImage('tpl-blank', '  '));

    expect(template.templateId).toBe('tpl-blank');
    // The fixture scene's own name is the fallback source, so a blank manifest name still
    // yields a usable display name — what must NOT happen is a recorded empty string.
    expect(template.name).not.toBe('');
    expect(template.name).toBe('delivery-lower-third');
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

describe('produceTemplateDelivery — B-196 the runtime-contract guard', () => {
  it('🔴 REFUSES a package from a newer build, and the message names both versions', async () => {
    /*
      The direction that needs a guard: a package declaring a rendering contract this build does
      not implement. Something already refuses it — `schemaVersion` is a literal and
      `ElementSchema` is a union — but what an operator gets from those is a zod path into an
      element array. This is the sentence.
    */
    const bytes = await buildVcgWithImage('tpl-future', 'future lower third', '99.0.0');
    await expect(produceTemplateDelivery(bytes)).rejects.toThrow(/future lower third/);
    await expect(produceTemplateDelivery(bytes)).rejects.toThrow(/99\.0\.0/);
    // The build's own version, matched literally — escaping the dots by hand here would be a
    // second spelling of the constant, and the point is that the message quotes it verbatim.
    await expect(produceTemplateDelivery(bytes)).rejects.toThrow(CG_RUNTIME_VERSION);
    await expect(produceTemplateDelivery(bytes)).rejects.toThrow(/Update this station/);
  });

  it('🔴 the guard runs BEFORE the render — a refused package is never built', async () => {
    // Rendering a package that must be refused wastes the work and, worse, would let a render
    // failure mask the real reason with `could not be rendered`.
    const bytes = await buildVcgWithImage('tpl-future-2', 'future two', '99.0.0');
    await expect(produceTemplateDelivery(bytes)).rejects.not.toThrow(/could not be rendered/);
  });

  it('every package written before the field meant anything still imports', async () => {
    // The literal `'0.0.0'` the exporter wrote for the whole life of the format. A guard that
    // refused these would be worse than the gap it closes.
    const { template } = await produceTemplateDelivery(
      await buildVcgWithImage('tpl-legacy', 'legacy', '0.0.0'),
    );
    expect(template.templateId).toBe('tpl-legacy');
  });

  it('a package from THIS build imports', async () => {
    const { template } = await produceTemplateDelivery(
      await buildVcgWithImage('tpl-current', 'current', CG_RUNTIME_VERSION),
    );
    expect(template.templateId).toBe('tpl-current');
  });
});

describe('produceTemplateDelivery — B-066 Persian UTF-8 integrity (upstream hops)', () => {
  it('a packed .vcg with Persian field defaults keeps the exact codepoints through unpack + delivery', async () => {
    // The upstream half of the "????" trace: .vcg pack → verify/unpack →
    // TemplateInfo fields + the served scene literal. Byte-exact or red.
    const persianDefault = 'سارا نادری';
    const { template, html } = await produceTemplateDelivery(await buildVcgWithImage('tpl-fa'));

    const delivered = template.fields.find((f) => f.id === 'anchor');
    expect(delivered?.type).toBe('text');
    const deliveredDefault = (delivered as { default?: string } | undefined)?.default;
    expect([...(deliveredDefault ?? '')].map((c) => c.codePointAt(0))).toEqual(
      [...persianDefault].map((c) => c.codePointAt(0)),
    );
    // The served page's inlined scene literal carries the Persian raw (UTF-8
    // meta charset page) — no "?" downconversion anywhere in the default.
    expect(html).toContain(persianDefault);
    expect(deliveredDefault).not.toContain('?');
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
    // R-004 — the caller gets what to TELL the operator, not the UUID it just registered.
    expect(result.displayName).toBe('delivery-lower-third');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.html).toContain('CG.createRuntime');
    expect((sent[0]?.template as { templateId: string }).templateId).toBe('tpl-deliver');
    expect((sent[0]?.template as { name?: string }).name).toBe('delivery-lower-third');
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

/**
 * D-121 — a `.vcg` that BUNDLES its font must put that face on air.
 *
 * This is the on-air half of the fix, asserted against the REAL delivery path
 * (verify → unpack → single-file re-render → the HTML the bridge serves to CEF).
 * It needs no Runtime/bridge change: `vcgImageAssetSource` resolves an `assetId`
 * through `manifest.assetIndex` → `files`, path- and kind-agnostically, so a
 * `fonts/…` entry resolves exactly as an `assets/…` one does.
 *
 * The payoff is a content-driven ticker's crawl measuring REAL glyph widths — which
 * is what ends its hold — on a playout machine where the font isn't installed.
 * Note `fontsCss` is deliberately omitted: nothing but the package can supply the
 * face, so a pass here cannot be a system-install false positive.
 */
const FONT_WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 9, 8, 7, 6, 5]);
const FONT_ASSET_ID = 'vazir-pkg';
const FONT_FAMILY = `asset-${FONT_ASSET_ID}`;

/** A `.vcg` carrying a content-driven ticker whose face ships INSIDE the package. */
async function buildVcgWithFont(templateId = 'tpl-font-1'): Promise<Uint8Array> {
  const scene = {
    schemaVersion: 1,
    id: 'scene-font-1',
    name: 'crawl-with-packaged-font',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'tk-1',
            name: 'Ticker',
            type: 'ticker',
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 0,
            transform: {
              position: { x: 0, y: 980 },
              size: { w: 1920, h: 72 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            font: {
              family: FONT_FAMILY,
              weight: 500,
              style: 'normal',
              size: 36,
              lineHeight: 1.4,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            direction: 'rtl',
            verticalAlign: 'middle',
            speed: 120,
            gap: 64,
            items: [{ id: 'it-1', text: 'خبر فوری' }],
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [{ family: FONT_FAMILY, weights: [500], styles: ['normal'], source: 'bundled' }],
    metadata: { createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
  } as unknown as Scene;

  const fontPath = `fonts/${sha256Hex(FONT_WOFF2)}.woff2`;
  const assetIndex: readonly AssetEntry[] = [
    {
      id: FONT_ASSET_ID,
      path: fontPath,
      kind: 'font',
      bytes: FONT_WOFF2.byteLength,
      sha256: sha256Hex(FONT_WOFF2),
      mime: 'font/woff2',
    },
  ];
  const fontDeps: readonly FontReference[] = [
    { family: FONT_FAMILY, weights: [500], styles: ['normal'], source: 'bundled' },
  ];

  return pack({
    scene,
    manifestExtras: {
      id: templateId,
      name: 'crawl-with-packaged-font',
      authoring: {
        designerVersion: '0.0.0',
        createdAt: '2026-07-13T00:00:00.000Z',
        exportedAt: '2026-07-13T00:01:00.000Z',
      },
      compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps,
      assetIndex,
    } satisfies Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
      fontDeps: readonly FontReference[];
      assetIndex: readonly AssetEntry[];
    },
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    fonts: new Map([[fontPath, FONT_WOFF2]]),
  });
}

describe('produceTemplateDelivery — D-121 packaged fonts reach the on-air HTML', () => {
  it("inlines the PACKAGE's font as base64 so the crawl measures real glyphs off-machine", async () => {
    const { html } = await produceTemplateDelivery(await buildVcgWithFont());

    // The face the ticker renders with comes from the package — not the OS.
    const expected = `data:font/woff2;base64,${Buffer.from(FONT_WOFF2).toString('base64')}`;
    expect(html).toContain(`@font-face{font-family:"${FONT_FAMILY}"`);
    expect(html).toContain(expected);
    // Self-contained: CEF fetches nothing (the served page's CSP is `font-src data:`).
    expect(html).not.toMatch(/url\(['"]?(https?:|file:|\/fonts\/)/);
  });
});

/**
 * D-137 / C-015 phase 2 — the LIVE SOURCE CARRIER is derived at import.
 *
 * This is the ONLY moment the app holds the unpacked scene: the bridge parses no
 * HTML and `LibraryEntry` keeps `{ template, html }` and nothing else, so a fact
 * missed here is unrecoverable. These tests assert the block is emitted for every
 * import — including one with no Live Source at all, which is what makes an
 * ABSENT block mean "imported by an older build" rather than "has none".
 */
async function buildVcgWithLiveSource(
  templateId: string,
  over: { defaultPosition?: Scene['defaultPosition'] } = {},
): Promise<Uint8Array> {
  const scene: Scene = {
    ...fixtureScene(),
    ...(over.defaultPosition !== undefined ? { defaultPosition: over.defaultPosition } : {}),
    // A 960×540 composition instanced into a 480×270 box ⇒ ×0.5 on both axes.
    compositions: [
      {
        id: 'comp-box',
        name: 'box',
        resolution: { width: 960, height: 540 },
        frameRange: { in: 0, out: 50 },
        editorBackdrop: 'transparent',
        layers: [
          {
            id: 'comp-layer',
            name: 'live',
            visible: true,
            locked: false,
            blendMode: 'normal',
            children: [
              {
                id: 'el-live',
                name: 'guest',
                type: 'video-placeholder',
                transform: {
                  position: { x: 200, y: 100 },
                  size: { w: 400, h: 200 },
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  anchor: { x: 0, y: 0 },
                },
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                routeKey: 'guest-1',
                expectedAspect: 16 / 9,
              },
            ],
          },
        ],
      },
    ],
    layers: [
      {
        id: 'layer-1',
        name: 'Content',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'inst-1',
            name: 'box instance',
            type: 'composition',
            transform: {
              position: { x: 1000, y: 600 },
              size: { w: 480, h: 270 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            compositionId: 'comp-box',
          },
        ],
      },
    ],
  };
  const fontDeps: readonly FontReference[] = [];
  const assetIndex: readonly AssetEntry[] = [];
  const manifestExtras = {
    id: templateId,
    name: 'live-source-delivery',
    authoring: {
      designerVersion: '0.0.0',
      createdAt: '2026-08-09T00:00:00.000Z',
      exportedAt: '2026-08-09T00:01:00.000Z',
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
  });
}

describe('produceTemplateDelivery — D-137 the Live Source carrier', () => {
  it('carries the scene resolution, the resolved default position, and every declaration', async () => {
    const { template } = await produceTemplateDelivery(
      await buildVcgWithLiveSource('tpl-live-1', {
        defaultPosition: { anchor: 'bottom-left', offset: { x: 12, y: -8 } },
      }),
    );

    expect(template.liveSources?.resolution).toEqual({ width: 1920, height: 1080 });
    // The AUTHORED position rides the carrier verbatim. Without it the bridge —
    // which appends `pos` only when an OPERATOR override exists — would place the
    // live box against `centered` while the page placed the hole against this.
    expect(template.liveSources?.defaultPosition).toEqual({
      anchor: 'bottom-left',
      offset: { x: 12, y: -8 },
    });
    expect(template.liveSources?.sources).toEqual([
      {
        elementId: 'el-live',
        sourceId: 'guest-1',
        // Composition-local (200,100)+400×200, through a ×0.5 instance at (1000,600).
        rect: { x: 1100, y: 650, width: 200, height: 100 },
        expectedAspect: 16 / 9,
        dynamic: false,
        // `multibox-layout-switch` 5.2 — this plate sits inside a ROOT-LEVEL composition
        // instance, which is exactly what a BOX is under A′, so its position WITHIN that box
        // is carried as fractions. Composed with an arrangement's cell rect it gives the
        // plate's hole in that arrangement — the pair that replaces a per-plate rect the
        // import cannot derive (which plate lands in which cell is the operator's toggles).
        // The instance is 480×270 at (1000,600); the plate is 200×100 at (1100,650).
        boxRelativeRect: {
          x: 100 / 480,
          y: 50 / 270,
          width: 200 / 480,
          height: 100 / 270,
        },
      },
    ]);
  });

  it('falls back to CENTRED when the author set no position — never absent', async () => {
    const { template } = await produceTemplateDelivery(await buildVcgWithLiveSource('tpl-live-2'));
    expect(template.liveSources?.defaultPosition).toEqual({
      anchor: 'center',
      offset: { x: 0, y: 0 },
    });
  });

  it('emits the block with an EMPTY sources array for a template with no Live Source', async () => {
    const { template } = await produceTemplateDelivery(await buildVcgWithImage('tpl-live-none'));
    // Present-and-empty, NOT absent. Absent is reserved for "imported before this
    // existed", and collapsing the two is what would put a template with real
    // holes on air with nothing behind them.
    expect(template.liveSources).toBeDefined();
    expect(template.liveSources?.sources).toEqual([]);
  });
});
