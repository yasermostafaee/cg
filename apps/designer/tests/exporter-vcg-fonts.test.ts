import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256Hex, unpack, verify } from '@cg/vcg-format';
import { cgCss, cgJs, ExporterSingleFile, type ImageAssetSource } from '@cg/single-file-export';
import type { AssetMeta } from '@cg/shared-ipc';
import type { Manifest, Scene, TickerElement } from '@cg/shared-schema';
import { Exporter } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import { defaultTicker } from '../src/renderer/state/element-defaults.js';

/**
 * D-121 — the `.vcg` bundles the template's font files.
 *
 * Why this is a correctness bug, not a portability wart: a content-driven ticker
 * measures its text width to decide when the crawl completes one pass, and that
 * pass duration is what ends the hold. Ship no font → the playout machine measures
 * FALLBACK glyphs → wrong width → wrong on-air hold duration.
 *
 * The on-air path is: Runtime app unpacks the `.vcg` → re-renders it through
 * `ExporterSingleFile` with the PACKAGE as the asset source → the bridge serves that
 * one self-contained HTML to CEF. So the package must carry both the font BYTES and
 * an `assetIndex` entry keyed by the `assetId` the family encodes — bytes alone
 * would render a standalone package but still mis-measure on air.
 */

// A stand-in woff2: real magic signature ('wOF2'), so the packaged bytes are
// recognisably a font and the base64 round-trip is exact.
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 9, 8, 7, 6, 5]);
const FONT_SHA = 'b'.repeat(64);
const FONT_ASSET_ID = 'vazir-1';
/** The convention the exporters resolve bytes by: `asset-<assetId>`. */
const BUNDLED_FAMILY = `asset-${FONT_ASSET_ID}`;
const FONT_PATH = `fonts/${FONT_SHA}.woff2`;

const fontMeta: AssetMeta = {
  assetId: FONT_ASSET_ID,
  kind: 'font',
  filename: 'Vazirmatn.woff2',
  sha256: FONT_SHA,
  byteSize: WOFF2.byteLength,
  workingPath: `projects/p/assets/font/${FONT_SHA}.woff2`,
};

function stubAssets(): AssetStore {
  return {
    list: async () => [fontMeta],
    get: async (id: string) => (id === FONT_ASSET_ID ? fontMeta : null),
    bytes: async (id: string) => (id === FONT_ASSET_ID ? WOFF2 : null),
  } as unknown as AssetStore;
}

function makeExporter(): Exporter {
  return new Exporter({
    assets: stubAssets(),
    cgJs: 'export const x = 1;',
    cgCss: 'html{background:transparent}',
  });
}

/**
 * A content-driven ticker scene. `family` picks the failure mode:
 *  - `asset-<id>`  → a bundleable font (bytes live in the AssetStore)
 *  - `Arial`       → a system/licensed face with no shippable bytes
 */
function tickerScene(family: string, opts: { declareFont?: boolean } = {}): Scene {
  const ticker = defaultTicker('tk-1', 0, 980) as TickerElement;
  const scene = {
    schemaVersion: 1,
    id: 's-fonts',
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
        children: [{ ...ticker, font: { ...ticker.font, family } }],
      },
    ],
    fields: [],
    bindings: [],
    // The scene-level font declaration is what the exporter walks for bytes.
    fonts:
      opts.declareFont === false
        ? []
        : [
            {
              family,
              weights: [500],
              styles: ['normal'],
              source: family.startsWith('asset-') ? 'bundled' : 'system',
            },
          ],
    metadata: { createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
  };
  return scene as unknown as Scene;
}

/**
 * The package-backed asset source — a faithful mirror of the Runtime's
 * `vcgImageAssetSource` (`apps/runtime/.../templateDelivery.ts`): resolve an
 * `assetId` through the manifest's `assetIndex` to a path, then to the unpacked
 * bytes. It is deliberately path- and kind-agnostic, which is exactly why a
 * `fonts/…` entry needs no runtime change.
 */
function packageAssetSource(manifest: Manifest, files: ReadonlyMap<string, Uint8Array>) {
  const byId = new Map(manifest.assetIndex.map((e) => [e.id, e] as const));
  return {
    get: (assetId: string) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      return Promise.resolve({
        assetId: entry.id,
        kind: entry.kind === 'audio' ? 'image' : entry.kind,
        filename: entry.path.slice(entry.path.lastIndexOf('/') + 1),
        sha256: entry.sha256,
        byteSize: entry.bytes,
        workingPath: entry.path,
      } as AssetMeta);
    },
    bytes: (assetId: string) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      return Promise.resolve(files.get(entry.path) ?? null);
    },
  } satisfies ImageAssetSource;
}

describe('Exporter (.vcg) — D-121 bundles font files', () => {
  it('packages the font bytes under fonts/ and indexes them by assetId', async () => {
    const { vcg } = await makeExporter().produce(tickerScene(BUNDLED_FAMILY));
    const { manifest, files } = await unpack(vcg);

    expect(files.get(FONT_PATH)).toEqual(WOFF2);

    const entry = manifest.assetIndex.find((e) => e.id === FONT_ASSET_ID);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('font');
    expect(entry?.path).toBe(FONT_PATH);
    expect(entry?.mime).toBe('font/woff2');
    expect(entry?.sha256).toBe(FONT_SHA);
  });

  it('the package CSS references the packaged font from WITHIN the package', async () => {
    const { vcg } = await makeExporter().produce(tickerScene(BUNDLED_FAMILY));
    const { files } = await unpack(vcg);
    const indexHtml = new TextDecoder().decode(files.get('index.html'));

    expect(indexHtml).toContain('@font-face');
    expect(indexHtml).toContain(`font-family: "${BUNDLED_FAMILY}"`);
    // Package-relative — it must resolve inside the package under CEF, with no
    // external fetch and no `file://` escape.
    expect(indexHtml).toContain(`url('./${FONT_PATH}')`);
    expect(indexHtml).not.toMatch(/url\(['"]?(https?:|file:|\/fonts\/)/);
  });

  it('the packaged font survives a pack → verify → unpack round-trip', async () => {
    const { vcg } = await makeExporter().produce(tickerScene(BUNDLED_FAMILY));

    const result = await verify(vcg);
    expect(result.ok).toBe(true);

    const { files } = await unpack(vcg);
    expect(files.get(FONT_PATH)).toEqual(WOFF2);
  });

  /**
   * The measurement-input proof, on the REAL on-air seam. `ExporterSingleFile` is
   * the exporter the Runtime re-renders a `.vcg` through; here it is fed ONLY the
   * package (fontsCss: '' — no app faces, no system install). If the ticker's face
   * comes out base64-inlined from the packaged bytes, then on a machine without the
   * font the crawl measures REAL glyphs, not fallbacks.
   */
  it('the ticker font resolves from the PACKAGE alone — no system install, no external ref', async () => {
    const { vcg } = await makeExporter().produce(tickerScene(BUNDLED_FAMILY));
    const { scene, manifest, files } = await unpack(vcg);

    const html = (
      await new ExporterSingleFile({
        cgJsIife: '/* runtime */',
        cgCss: '',
        fontsCss: '', // deliberately EMPTY: nothing but the package can supply the face
        assets: packageAssetSource(manifest, files),
      }).produce(scene)
    ).html;

    const expectedDataUri = `data:font/woff2;base64,${Buffer.from(WOFF2).toString('base64')}`;
    expect(html).toContain(`@font-face{font-family:"${BUNDLED_FAMILY}"`);
    expect(html).toContain(expectedDataUri);
    // The served page fetches nothing: its own CSP is `font-src data:`.
    expect(html).not.toMatch(/url\(['"]?(https?:|file:|\/fonts\/)/);
  });

  it('skips a system/licensed font instead of failing the export', async () => {
    const { vcg } = await makeExporter().produce(tickerScene('Arial'));
    const { manifest, files } = await unpack(vcg);

    // Export succeeded, and shipped no font bytes it had no right to ship.
    expect([...files.keys()].some((p) => p.startsWith('fonts/'))).toBe(false);
    expect(manifest.assetIndex.some((e) => e.kind === 'font')).toBe(false);
  });
});

describe('Exporter preflight — D-121 re-scopes vcg-ticker-fonts-not-bundled', () => {
  it('stays silent once the ticker font is bundled', async () => {
    const issues = await makeExporter().preflight(tickerScene(BUNDLED_FAMILY));
    expect(issues.some((i) => i.code === 'vcg-ticker-fonts-not-bundled')).toBe(false);
  });

  it('still warns for a font that genuinely cannot be bundled, naming it', async () => {
    const issues = await makeExporter().preflight(tickerScene('Arial'));
    const warn = issues.find((i) => i.code === 'vcg-ticker-fonts-not-bundled');

    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning'); // warn, never block
    expect(warn?.message).toContain('Arial');
    expect(warn?.elementId).toBe('tk-1');
  });

  it('warns when an asset font is declared but its bytes are gone', async () => {
    const exporter = new Exporter({
      assets: { list: async () => [], get: async () => null, bytes: async () => null },
      cgJs: '',
      cgCss: '',
    } as unknown as ConstructorParameters<typeof Exporter>[0]);

    const issues = await exporter.preflight(tickerScene(BUNDLED_FAMILY));
    const warn = issues.find((i) => i.code === 'vcg-ticker-fonts-not-bundled');
    expect(warn).toBeDefined();
    expect(warn?.message).toContain(BUNDLED_FAMILY);
  });
});

/**
 * D-121 owner-verification fixture — the REAL Vazirmatn face, the REAL Exporter.
 *
 * Doubles as a regression test (a genuine woff2 round-trips into the package and
 * reaches the served HTML) and as the generator for the `.vcg` the owner imports
 * into the Runtime app against real CasparCG. Set `D121_FIXTURE_OUT` to a directory
 * to emit the artifacts:
 *
 *   D121_FIXTURE_OUT=fixtures/d121 pnpm --filter @cg/designer test -- exporter-vcg-fonts
 *
 * It writes TWO packages so the check cannot silently false-pass:
 *   crawl-bundled-font.vcg — fonts bundled (the fix)
 *   crawl-no-font.vcg      — identical scene, font bytes withheld (the CONTROL,
 *                            i.e. pre-fix behaviour). If the two look and time the
 *                            SAME on air, the machine is supplying the face and the
 *                            test is not proving anything.
 */
const REAL_WOFF2 = new Uint8Array(
  readFileSync(
    fileURLToPath(
      new URL('../public/fonts/vazirmatn/vazirmatn-arabic-500-normal.woff2', import.meta.url),
    ),
  ),
);
const REAL_ASSET_ID = 'vazir-arabic-500';
const REAL_FAMILY = `asset-${REAL_ASSET_ID}`;

function realFontAssets(present: boolean): AssetStore {
  const meta: AssetMeta = {
    assetId: REAL_ASSET_ID,
    kind: 'font',
    filename: 'Vazirmatn-500.woff2',
    sha256: sha256Hex(REAL_WOFF2),
    byteSize: REAL_WOFF2.byteLength,
    workingPath: `projects/p/assets/font/${sha256Hex(REAL_WOFF2)}.woff2`,
  };
  return {
    list: async () => (present ? [meta] : []),
    get: async (id: string) => (present && id === REAL_ASSET_ID ? meta : null),
    bytes: async (id: string) => (present && id === REAL_ASSET_ID ? REAL_WOFF2 : null),
  } as unknown as AssetStore;
}

/** A CONTENT-DRIVEN crawl: the hold ends when the ticker finishes one pass. */
function contentDrivenCrawlScene(): Scene {
  const ticker = defaultTicker('tk-crawl', 0, 940) as TickerElement;
  return {
    schemaVersion: 1,
    id: 'd121-crawl',
    name: 'D-121 content-driven crawl',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 60 },
    lifecycle: { outPoint: 30 },
    // The hold lasts until the crawl completes its pass — the duration that goes
    // wrong when the font is missing and fallback glyphs are measured.
    playout: { mode: 'auto-out', holdSource: 'content-driven' },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...ticker,
            font: { ...ticker.font, family: REAL_FAMILY, size: 40 },
            direction: 'rtl',
            backgroundColor: '#0B5FFF',
            repeat: 1, // ONE pass, then the hold ends — the measured-width payoff
            items: [
              { id: 'i1', text: 'خبر فوری — آزمایش قلم بسته‌بندی‌شده در فایل vcg' },
              { id: 'i2', text: 'اگر قلم درست بارگذاری شود، مدت زمان حرکت نوار درست است' },
              { id: 'i3', text: 'در غیر این صورت، عرض متن با قلم جایگزین اندازه‌گیری می‌شود' },
            ],
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [{ family: REAL_FAMILY, weights: [500], styles: ['normal'], source: 'bundled' }],
    metadata: { createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
  } as unknown as Scene;
}

describe('D-121 fixture — a real Vazirmatn face rides in the .vcg', () => {
  it('packages the REAL woff2 bytes and serves them to the on-air HTML', async () => {
    const exporter = new Exporter({
      assets: realFontAssets(true),
      cgJs,
      cgCss,
    });
    const { vcg } = await exporter.produce(contentDrivenCrawlScene());

    const result = await verify(vcg);
    expect(result.ok).toBe(true);

    const { scene, manifest, files } = await unpack(vcg);
    const fontPath = `fonts/${sha256Hex(REAL_WOFF2)}.woff2`;
    expect(files.get(fontPath)).toEqual(REAL_WOFF2);
    expect(manifest.assetIndex.find((e) => e.id === REAL_ASSET_ID)?.kind).toBe('font');

    // The face reaches the HTML the bridge serves to CEF — from the package alone.
    const html = (
      await new ExporterSingleFile({
        cgJsIife: '/* runtime */',
        cgCss: '',
        fontsCss: '',
        assets: packageAssetSource(manifest, files),
      }).produce(scene)
    ).html;
    expect(html).toContain(`@font-face{font-family:"${REAL_FAMILY}"`);
    expect(html).toContain(`data:font/woff2;base64,${Buffer.from(REAL_WOFF2).toString('base64')}`);

    const outDir = process.env['D121_FIXTURE_OUT'];
    if (outDir !== undefined && outDir !== '') {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'crawl-bundled-font.vcg'), vcg);

      // The CONTROL: same scene, but the project has lost the font asset — so the
      // exporter can ship no bytes. This is exactly the pre-D-121 package.
      const control = await new Exporter({
        assets: realFontAssets(false),
        cgJs,
        cgCss,
      }).produce(contentDrivenCrawlScene());
      writeFileSync(join(outDir, 'crawl-no-font.vcg'), control.vcg);

      // The GROUND-TRUTH pair (see the comment on `latinCrawlScene`).
      writeFileSync(
        join(outDir, 'crawl-latin-bundled.vcg'),
        (
          await new Exporter({ assets: latinFontAssets(true), cgJs, cgCss }).produce(
            latinCrawlScene(),
          )
        ).vcg,
      );
      writeFileSync(
        join(outDir, 'crawl-latin-control.vcg'),
        (
          await new Exporter({ assets: latinFontAssets(false), cgJs, cgCss }).produce(
            latinCrawlScene(),
          )
        ).vcg,
      );
    }
  });
});

/**
 * The GROUND-TRUTH fixture pair.
 *
 * The Vazirmatn pair above CANNOT prove anything on air, and that is not a packaging
 * failure — it is `scene-builder`'s font stack: every text element renders with
 * `${family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", …`, and the Runtime app
 * inlines its OWN Vazirmatn into every served page. So a missing bundled Vazirmatn
 * falls back to… Vazirmatn. Same typeface, same widths, same crawl duration.
 *
 * This pair defeats that: the bundled face is **Exo 2 ExtraBold (Latin)** under an
 * `asset-*` family name. No OS font can claim that name, and the fallback behind it
 * is Vazirmatn — a visibly narrower face. Bundled vs control therefore MUST differ in
 * measured width, hence in the content-driven crawl duration. If they don't, the
 * packaged font is not reaching the measurement.
 */
const EXO2_WOFF2 = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL('../public/fonts/exo2/exo-2-latin-800-normal.woff2', import.meta.url)),
  ),
);
const EXO2_ASSET_ID = 'exo2-800';
const EXO2_FAMILY = `asset-${EXO2_ASSET_ID}`;

function latinFontAssets(present: boolean): AssetStore {
  const meta: AssetMeta = {
    assetId: EXO2_ASSET_ID,
    kind: 'font',
    filename: 'Exo2-800.woff2',
    sha256: sha256Hex(EXO2_WOFF2),
    byteSize: EXO2_WOFF2.byteLength,
    workingPath: `projects/p/assets/font/${sha256Hex(EXO2_WOFF2)}.woff2`,
  };
  return {
    list: async () => (present ? [meta] : []),
    get: async (id: string) => (present && id === EXO2_ASSET_ID ? meta : null),
    bytes: async (id: string) => (present && id === EXO2_ASSET_ID ? EXO2_WOFF2 : null),
  } as unknown as AssetStore;
}

function latinCrawlScene(): Scene {
  const ticker = defaultTicker('tk-latin', 0, 940) as TickerElement;
  return {
    schemaVersion: 1,
    id: 'd121-latin-crawl',
    name: 'D-121 latin crawl (ground truth)',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 60 },
    lifecycle: { outPoint: 30 },
    playout: { mode: 'auto-out', holdSource: 'content-driven' },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...ticker,
            font: { ...ticker.font, family: EXO2_FAMILY, size: 48, weight: 400 },
            direction: 'ltr',
            backgroundColor: '#0B5FFF',
            speed: 140,
            repeat: 1,
            /**
             * Tuned against the REAL fallback, which is Vazirmatn (`scene-builder`
             * appends it behind every family) — NOT a generic system face. Two things
             * make the gap big enough to see on air:
             *   weight 400 — at 800 the browser faux-bolds BOTH faces and their widths
             *                converge to within 3px (measured), hiding the difference;
             *   lowercase + digits — where Exo 2 runs ~18% wider than Vazirmatn (caps
             *                and kerning pairs are only ~5%).
             * Bundled (Exo 2, wider) therefore crawls NOTICEABLY LONGER than the control.
             */
            items: [
              {
                id: 'i1',
                text: 'bundled font check 0123456789 — this crawl runs longer when exo 2 ships',
              },
              {
                id: 'i2',
                text: 'if both packages take the same time, the packaged font never loaded 0123456789',
              },
              {
                id: 'i3',
                text: 'exo 2 is wider than the vazirmatn fallback in lowercase and digits 0123456789',
              },
              {
                id: 'i4',
                text: 'compare the two crawls: the bundled one should finish clearly later 0123456789',
              },
            ],
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [{ family: EXO2_FAMILY, weights: [800], styles: ['normal'], source: 'bundled' }],
    metadata: { createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
  } as unknown as Scene;
}
