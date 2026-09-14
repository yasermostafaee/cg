import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 **THE DOOR TO THE SOURCE DEFAULTS — ITS LINE ENDS WITH ITS WORDS.**
 *
 * The owner, 2026-09-15: «خط ریز آبی زیر نقطه زرد جالب نیست حذفش کن.» The control is an accent
 * LINK carrying an amber warning dot, and with the underline declared on the BUTTON the line was
 * drawn across everything the button contained — the gap and the dot included — so a thin blue
 * tick sat under an amber mark and read as a third thing the control was trying to say.
 *
 * ── WHY THIS IS AN E2E AND NOT A DOM TEST ───────────────────────────────────
 *
 * ⚠ **A TEXT DECORATION IS PAINT.** The fix that a reading of CSS Text Decoration 3 recommends —
 * making the dot an ATOMIC INLINE (`display: inline-block`), which the spec exempts from a
 * PROPAGATED decoration — does not stop the ancestor drawing its OWN line across that box's
 * area, and Chromium draws it. It was tried first and left **6** accent pixels under the dot.
 * Nothing in a computed style says so: the descendant's `text-decoration-line` computes to `none`
 * either way, before and after the real fix, so a `getComputedStyle` assertion would have passed
 * against the broken surface in both engines (golden rule 12c).
 *
 * So this counts PIXELS in a real engine, in two bands:
 *   - under the DOT's own column band → must be 0;
 *   - under the WORDS → must be many, **the positive control**, without which "no blue pixels"
 *     is equally true of a link that lost its underline altogether, or of a panel that never
 *     rendered.
 *
 * Measured at the time of writing: 0 under the dot, 411 under the words.
 */
test('the warning dot carries no underline, and the link’s words still do', async ({ app }) => {
  await app.page.setViewportSize({ width: 1280, height: 900 });
  /*
    A one-plate template and an EMPTY catalogue, which is what makes the dot appear at all: the
    plate can be owed a source only when there is no source it could already have.
  */
  await app.page.evaluate(async () => {
    const w = window as unknown as {
      cg: {
        sources: { setConfig: (r: unknown) => Promise<unknown> };
        templates: { import: (r: { template: unknown; html: string }) => Promise<unknown> };
      };
    };
    await w.cg.sources.setConfig({ sources: [] });
    const rect = { x: 0, y: 0, width: 960, height: 540 };
    await w.cg.templates.import({
      template: {
        templateId: 'tpl-dot',
        name: 'dot',
        sourceFileName: 'dot.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
          sources: [{ elementId: 'el-1', sourceId: 'p-1', rect, dynamic: false }],
        },
      },
      html: '<!doctype html><html><body>dot</body></html>',
    });
  });
  const row = await app.loadTemplate('tpl-dot');
  await app.selectLayerRow(row);

  const link = app.inspector.locator('[data-open-template-defaults]');
  await expect(link, 'the door says a plate is owed a source').toHaveAttribute(
    'data-defaults-needed',
    '1',
  );
  const dot = link.locator('span[aria-label*="needs a source"]');
  await expect(dot).toBeVisible();

  const box = await link.boundingBox();
  const dotBox = await dot.boundingBox();
  if (box === null || dotBox === null) throw new Error('the link and its dot must both have a box');
  const shot = await app.page.screenshot({ clip: box, scale: 'css' });
  /*
    Decoded back inside the page, because that is where a canvas is. Accent-blue is separated
    from the amber dot by hue rather than by an exact value: the amber has the HIGHER red
    channel, so `blue - red > 40` cannot match it whatever the token's exact spelling
    (`#74cdf6` / `rgb(116 205 246)` — the value has notations, the test has a property).
  */
  const png = await app.page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    const cols: number[] = [];
    for (let x = 0; x < img.width; x++) {
      let n = 0;
      for (let y = 0; y < img.height; y++) {
        const i = (y * img.width + x) * 4;
        // `?? 0` because `noUncheckedIndexedAccess` is on and a clamped array read is typed
        // `number | undefined`. A zero can only make the test STRICTER (it matches nothing).
        const r = px[i] ?? 0;
        const g = px[i + 1] ?? 0;
        const b = px[i + 2] ?? 0;
        if (b > 150 && b - r > 40 && g > 120) n++;
      }
      cols.push(n);
    }
    return { cols, width: img.width, height: img.height };
  }, shot.toString('base64'));

  const dx = Math.round(dotBox.x - box.x);
  const dw = Math.round(dotBox.width);
  const underDot = png.cols.slice(dx, dx + dw).reduce((a, b) => a + b, 0);
  // …stopping short of the dot's own band, so the mark's margin belongs to neither side.
  const underWords = png.cols.slice(0, Math.max(1, dx - 4)).reduce((a, b) => a + b, 0);

  expect(underWords, 'the WORDS keep their underline — the positive control').toBeGreaterThan(20);
  expect(underDot, 'no accent pixel anywhere in the dot’s column band').toBe(0);
});
