import type { Locator, Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * PVW's frames carried an OPAQUE CANVAS, and this suite asserts it is gone by
 * looking at PIXELS.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 *
 * CSS Color Adjust: when the used `color-scheme` of an embedded document differs
 * from its embedder's, the UA renders the embedded document's canvas OPAQUE. The
 * console's root declares `color-scheme: dark` (`@cg/ui`'s `theme.css`) and the
 * served template page declares none, so it resolves `normal` → light. Mismatch,
 * on every frame.
 *
 * Two symptoms, one cause:
 *
 *   1. a flat white 16:9 area where the raster is, hiding the transparency
 *      checker the operator judges alpha against;
 *   2. the COMPOSITE looking broken while being correct — the frames are all
 *      there and stacked in layer order, but the topmost one's opaque canvas
 *      occludes every frame below it, so only the highest graphic is visible.
 *
 * ── WHY THESE TESTS SAMPLE PIXELS ───────────────────────────────────────────
 *
 * THE CANVAS IS NOT AN ELEMENT. No computed style reports it: with the bug fully
 * present, `html`, `body` and `.cg-stage` all measure `rgba(0, 0, 0, 0)` while
 * the box renders white. Asserting a computed background here is not a weaker
 * test, it is a test of something else — and it is the fourth time this project
 * would have shipped one (a density test that only ran at the widest density; a
 * draft spec exercising the one path that never unmounts; a background assertion
 * that passed with AND without its fix — that last one was in THIS file's sibling
 * and is the direct reason this suite exists).
 *
 * So both tests below composite the real thing and read the resulting pixel.
 * Both were run against the unfixed code and both went RED (white, and the upper
 * graphic's colour, respectively).
 */

/** The transparency checker's two square colours (`#3d4253` / `#5b6075`). */
const CHECKER_DARK: RGB = [61, 66, 83];
const CHECKER_LIGHT: RGB = [91, 96, 117];
/** What the opaque canvas painted. */
const WHITE: RGB = [255, 255, 255];

type RGB = [number, number, number];

/**
 * A served-page stand-in that paints ONE opaque rectangle in raster
 * coordinates and is transparent everywhere else.
 *
 * `size` is the fraction of the 1920×1080 raster the rectangle covers from the
 * top-left, so a caller can place a graphic where another frame is transparent
 * and sample the overlap — which is the whole subject of the second test.
 */
function paintedPage(color: string, size: { w: number; h: number }): string {
  return `<!doctype html><html><head>
<style>html,body{width:1920px;height:1080px;background:transparent;overflow:hidden;margin:0}</style>
</head><body>
  <div class="cg-stage" style="position:relative;width:1920px;height:1080px">
    <div style="position:absolute;left:0;top:0;width:${String(Math.round(1920 * size.w))}px;height:${String(Math.round(1080 * size.h))}px;background:${color}"></div>
  </div>
  <script>window.play=function(){};window.update=function(){};window.next=function(){};window.stop=function(){};</script>
</body></html>`;
}

/** A page that paints NOTHING — transparent across the whole raster. */
function transparentPage(): string {
  return paintedPage('transparent', { w: 0, h: 0 });
}

/**
 * Serve a DIFFERENT stand-in page per template.
 *
 * The composite test needs two distinct graphics, so the stub is keyed by
 * `templateId` rather than returning one page for everything.
 */
async function stubPagesByTemplate(page: Page, pages: Record<string, string>): Promise<void> {
  await page.evaluate((byId: Record<string, string>) => {
    (
      window as unknown as { cg: { templates: { html: (id: string) => Promise<string | null> } } }
    ).cg.templates.html = (id: string) => Promise.resolve(byId[id] ?? null);
  }, pages);
}

function frames(page: Page): Locator {
  return page.locator('iframe[data-rehearsal-frame]');
}

async function rehearseRow(page: Page, layer: number): Promise<void> {
  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();
}

/**
 * The COMPOSITED colour at a fractional point of `locator`'s box.
 *
 * An element screenshot captures the page region at that element's box —
 * including everything painted OVER it — so screenshotting the checker yields
 * exactly the stack the operator sees, with the frames on top. The PNG is
 * decoded through the browser's own canvas rather than a decoding dependency:
 * the fractions make it independent of device pixel ratio.
 */
async function sampleRgb(page: Page, locator: Locator, fx: number, fy: number): Promise<RGB> {
  const png = await locator.screenshot();
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(
    async ({ uri, x, y }: { uri: string; x: number; y: number }) => {
      const img = new Image();
      img.src = uri;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const px = Math.min(img.naturalWidth - 1, Math.max(0, Math.floor(img.naturalWidth * x)));
      const py = Math.min(img.naturalHeight - 1, Math.max(0, Math.floor(img.naturalHeight * y)));
      const d = ctx.getImageData(px, py, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as [number, number, number];
    },
    { uri: dataUri, x: fx, y: fy },
  );
}

/** Within a small tolerance — screenshots are subject to colour management. */
function isRgb(actual: RGB, expected: RGB, tolerance = 6): boolean {
  return actual.every((c, i) => Math.abs(c - (expected[i] ?? 0)) <= tolerance);
}

/**
 * ── CHECKER THROUGH FRAME ───────────────────────────────────────────────────
 *
 * One row rehearsing a page that paints nothing. Every pixel of the raster is
 * therefore the CHECKER, which is what makes alpha readable — these are keyed
 * graphics and the part that matters most is the part that is transparent.
 *
 * Unfixed, this samples pure white.
 */
test('the checker shows through a frame — the canvas is not opaque', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const layer = await app.importVcg('a.vcg', await buildValidVcg('tpl-clear'));
  await stubPagesByTemplate(page, { 'tpl-clear': transparentPage() });
  await rehearseRow(page, layer);
  await expect(frames(page)).toHaveCount(1);

  const checker = page.locator('[data-rehearsal-checker]');
  await expect(checker).toHaveCount(1);
  await expect
    .poll(async () =>
      frames(page)
        .first()
        .evaluate((el) => (el as HTMLIFrameElement).contentDocument?.readyState === 'complete'),
    )
    .toBe(true);

  // Sample a few points across the raster rather than one: the checker is a 48px
  // two-tone pattern, so a single sample says less than a spread does, and an
  // opaque canvas would be white at all of them.
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.25, 0.4],
    [0.75, 0.62],
  ] as const) {
    const rgb = await sampleRgb(page, checker, fx, fy);
    expect(
      isRgb(rgb, WHITE),
      `expected checker at ${String(fx)},${String(fy)}, got ${rgb.join()}`,
    ).toBe(false);
    expect(
      isRgb(rgb, CHECKER_DARK) || isRgb(rgb, CHECKER_LIGHT),
      `expected a checker square colour at ${String(fx)},${String(fy)}, got ${rgb.join()}`,
    ).toBe(true);
  }
});

/**
 * ── STACK THROUGH STACK — the owner's actual repro ──────────────────────────
 *
 * Two rows on different CasparCG layers. The HIGHER layer paints only a corner;
 * the LOWER layer paints the whole raster. Where the higher graphic is
 * transparent, the lower one must show through.
 *
 * This is the test that proves `dev-pvw-composite` actually delivers. That
 * change put every rehearsing row on screen in the right order, and an opaque
 * canvas on the topmost frame hid all of it — the composite has been correct and
 * invisible. Unfixed, the centre sample returns the OPAQUE CANVAS, not the lower
 * graphic.
 */
test('a lower-layer graphic is visible through a higher-layer frame', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });

  const LOWER: RGB = [0, 128, 255];
  const UPPER: RGB = [255, 0, 0];

  // Imported in ascending layer order; the SECOND import takes the higher layer,
  // so the corner-painting page is the one on top.
  const lowLayer = await app.importVcg('low.vcg', await buildValidVcg('tpl-lower'));
  const highLayer = await app.importVcg('high.vcg', await buildValidVcg('tpl-upper'));
  expect(highLayer).toBeGreaterThan(lowLayer);

  await stubPagesByTemplate(page, {
    // The lower graphic fills the raster — a full-frame background plate.
    'tpl-lower': paintedPage(`rgb(${LOWER.join(',')})`, { w: 1, h: 1 }),
    // The upper graphic occupies the top-left quarter only — a logo bug. Its
    // remaining three quarters are transparent, and that is where the lower one
    // has to be readable.
    'tpl-upper': paintedPage(`rgb(${UPPER.join(',')})`, { w: 0.25, h: 0.25 }),
  });

  await rehearseRow(page, lowLayer);
  await rehearseRow(page, highLayer);
  await expect(frames(page)).toHaveCount(2);
  await expect
    .poll(async () =>
      frames(page).evaluateAll((els) =>
        els.every((el) => (el as HTMLIFrameElement).contentDocument?.readyState === 'complete'),
      ),
    )
    .toBe(true);

  const checker = page.locator('[data-rehearsal-checker]');

  // Inside the upper graphic's rectangle: the HIGHER layer wins, which is also
  // the z-order assertion — a composite stacked the wrong way round would show
  // the lower colour here.
  const inUpper = await sampleRgb(page, checker, 0.12, 0.12);
  expect(isRgb(inUpper, UPPER), `expected the upper graphic, got ${inUpper.join()}`).toBe(true);

  // Outside it: the upper frame is transparent there, so the LOWER graphic must
  // be visible through it. This is the pixel the owner could not see.
  const throughUpper = await sampleRgb(page, checker, 0.6, 0.6);
  expect(isRgb(throughUpper, WHITE), `the frame is still opaque: ${throughUpper.join()}`).toBe(
    false,
  );
  expect(
    isRgb(throughUpper, LOWER),
    `expected the lower graphic through the upper frame, got ${throughUpper.join()}`,
  ).toBe(true);
});
