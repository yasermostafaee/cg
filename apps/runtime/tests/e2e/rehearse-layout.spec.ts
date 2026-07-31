import type { Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * R-022 — the REHEARSE surface's LAYOUT, which is a separate failure class from
 * its behaviour and was not covered at all when the feature landed.
 *
 * Why it escaped: the offline mock retains no rendered page (`templates.html`
 * resolves `null` — deliberately, see `createRuntimeBridge`), so PREVIEW renders
 * its "unavailable in this browser" text and the rehearsal IFRAME never exists in
 * test mode. Every geometry defect below lives in that iframe's box. These specs
 * therefore stub the retained page — a TEST-ONLY override of one bridge method,
 * not a change to what the mock honestly holds.
 */

/**
 * PVW's own PLAY, scoped to the PREVIEW region.
 *
 * The rehearsal transport is named PLAY / NEXT / STOP — the row's vocabulary, for
 * one lifecycle — so an unscoped `name: 'PLAY'` would also match the row's verb.
 * The scoping is the point of the helper.
 */
function previewTransport(page: Page) {
  return page
    .getByRole('region', { name: 'PREVIEW' })
    .getByRole('button', { name: 'PLAY', exact: true });
}

/** The retained page a live bridge would serve. Content is irrelevant — the BOX is the subject. */
async function stubRetainedPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () =>
      Promise.resolve('<!doctype html><html><body style="margin:0;background:#123"></body></html>');
  });
}

test('the rehearsal iframe never widens the shell — PROGRAM stays on screen', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  await stubRetainedPage(page);

  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(previewTransport(page)).toBeVisible();

  // The iframe is a REAL 1920px box (that is what makes the page inside compute
  // its on-air placement); `transform: scale()` shrinks how it looks, never what
  // it occupies. Unbounded, it sized the strip and pushed PROGRAM off-screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const pgm = await page.getByRole('region', { name: 'PROGRAM' }).boundingBox();
  expect(pgm).not.toBeNull();
  expect(pgm!.x + pgm!.width).toBeLessThanOrEqual(1400);
});

test('the rehearsal is SCALED TO FIT on first render — not only after an edit', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  await stubRetainedPage(page);

  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  // ONE row is rehearsing, so there is ONE frame — asserted rather than assumed.
  // PVW composites every rehearsing row now, so this is a PLURAL selector:
  // `boundingBox()` on it is a strict-mode violation the moment a second row
  // rehearses, and reading "the" frame would silently measure whichever came
  // first. Pinning the count makes the singularity a claim this test makes, not
  // an accident of the fixture.
  //
  // Anchored on `data-rehearsal-frame`, the same stable handle the other specs
  // use. It used to match on the frame's `title`, which is no longer there: a
  // `title` on an iframe doubles as a native tooltip and popped up over the
  // graphic, so the accessible name moved to `aria-label`.
  const frames = page.locator('iframe[data-rehearsal-frame]');
  await expect(frames).toHaveCount(1);
  const frame = frames.first();
  await expect(frame).toBeVisible();

  // The fit scale is MEASURED off the containing box. When that box was itself
  // sized by the iframe, the measurement said "there is room for all of it" and
  // the scale came out ~1 — the rehearsal filled the whole panel, un-letterboxed,
  // until an unrelated re-render (typing in any Inspector field remounts the
  // stage) happened to re-measure against a settled box. The fit must be right
  // the FIRST time, with nothing touched.
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  // 1920 scaled into a panel narrower than half a 1400px viewport: comfortably
  // under half size. Asserted as a bound, not a pixel count, so the test does not
  // re-encode the panel's exact width.
  expect(box!.width).toBeLessThan(960);
});

test('a fullscreen PREVIEW keeps its own EXIT control on screen', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  await stubRetainedPage(page);
  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(previewTransport(page)).toBeVisible();

  await page.getByRole('button', { name: 'Show PREVIEW (PVW) fullscreen' }).click();

  // THE TRAP THIS CLOSES: fullscreen unmounts the Layers panel, so the layout
  // RESET control goes with it, and the focus is persisted to localStorage — so a
  // reload does not rescue an operator either. The panel's own exit button is the
  // only way back, and it must therefore be ON SCREEN.
  const exit = page.getByRole('button', { name: 'Exit fullscreen PREVIEW (PVW)' });
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1400);

  await exit.click();
  await expect(page.getByRole('region', { name: 'PROGRAM' })).toBeVisible();
});

/**
 * THE ROW VERBS' COLOUR CONTRACT, in a real browser and on PAINTED pixels rather
 * than class names — the class landing and the fill rendering are two different
 * claims and it is the second one the operator sees.
 *
 * Three rules, all asserted here because they are easy to break one at a time:
 *
 *   1. AT REST every verb is neutral and identical. This is the decision that
 *      took colour off the row in the first place — thirty coloured affordances
 *      drowned the state signal — and it is what the two additions below must not
 *      quietly undo.
 *   2. ON HOVER a verb takes its own colour (`--r-verb-*`). One button at a time,
 *      under the pointer the operator is already looking at, disambiguating the
 *      glyph at the moment of the click — which matters most here because this
 *      product's STOP and CLEAR mean the OPPOSITE of the reference product's.
 *   3. ENGAGED, the ON PVW toggle is filled in the row's own REHEARSING violet,
 *      and it is still the only verb that wears a colour while at rest.
 */
test('row verbs rest neutral, tint on hover, and only the engaged toggle stays filled', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  const row = app.layerRow(layer);

  const bg = (name: string): Promise<string> =>
    row
      .getByRole('button', { name, exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  /**
   * Wait for the SETTLED colour.
   *
   * `.cg-btn` transitions `background`, so a bare read straight after a hover or
   * a click samples a frame mid-animation — this test first failed on
   * `rgb(125, 60, 238)` where it wanted `rgb(124, 58, 237)`, two units out and
   * on its way. Polling waits for the end state without weakening the claim: the
   * exact colour is still what has to arrive.
   */
  const expectBg = async (name: string, rgb: string): Promise<void> => {
    await expect.poll(async () => bg(name), { message: `${name} background` }).toBe(rgb);
  };

  // (1) AT REST — the toggle is neutral, identical to every other verb.
  const restingClear = await bg('CLEAR');
  await expectBg('ON PVW', restingClear);

  // (2) ON HOVER — each ENABLED verb takes its own colour, and they differ from
  // each other. Hovered one at a time, because that is the only way they ever
  // appear: the point is telling adjacent icon-only glyphs apart at the moment of
  // the click, which matters most on this surface because its STOP and CLEAR mean
  // the OPPOSITE of the reference product's.
  await row.getByRole('button', { name: 'CLEAR', exact: true }).hover();
  await expectBg('CLEAR', 'rgb(222, 81, 5)'); // --r-verb-clear #DE5105
  await row.getByRole('button', { name: 'PLAY', exact: true }).hover();
  await expectBg('PLAY', 'rgb(34, 221, 122)'); // --r-verb-play #22DD7A
  await row.getByRole('button', { name: 'REMOVE', exact: true }).hover();
  await expectBg('REMOVE', 'rgb(255, 0, 0)'); // --r-verb-remove #FF0000

  // A DISABLED verb does not light up. STOP is disabled on a loaded-not-aired
  // row, and every hover rule carries `:not(:disabled)` precisely so an inert
  // control cannot advertise itself as pressable.
  const stop = row.getByRole('button', { name: 'STOP', exact: true });
  await expect(stop).toBeDisabled();
  await stop.hover({ force: true });
  await expectBg('STOP', 'rgba(0, 0, 0, 0)');

  // Off the row again: the tint is HOVER-ONLY and leaves nothing behind.
  await page.mouse.move(0, 0);
  await expectBg('CLEAR', restingClear);

  await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(row.getByRole('button', { name: 'OFF PVW', exact: true })).toBeVisible();
  // Park the pointer off the row. A `click()` leaves the mouse ON the button, so
  // reading the colour there samples the HOVER fill (#8B5CF6) — a real rule, but
  // not the one this step is about.
  await page.mouse.move(0, 0);

  // (3) ENGAGED — filled with `--r-rehearsing-strong` (#7C3AED), with nothing
  // hovered, so this is the RESTING appearance of an engaged toggle.
  await expectBg('OFF PVW', 'rgb(124, 58, 237)');

  // …and it is still the ONLY verb wearing a colour at rest.
  await expectBg('CLEAR', restingClear);
  await expectBg('REMOVE', restingClear);

  // (4) ON AIR — PLAY is disabled, and GREEN. It is disabled BECAUSE its state is
  // already true, so the fill lands on a control that cannot be pressed: it is
  // reporting "this row is the one on air", not offering an action. Taking the
  // row off rehearse first, since PLAY is interlocked while it is on PVW.
  await row.getByRole('button', { name: 'OFF PVW', exact: true }).click();
  await expect(row.getByRole('button', { name: 'ON PVW', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'PLAY', exact: true }).click();
  await page.mouse.move(0, 0);

  const play = row.getByRole('button', { name: 'PLAY', exact: true });
  await expect(play).toBeDisabled();
  await expectBg('PLAY', 'rgb(34, 221, 122)'); // --r-verb-play #22DD7A
});

test('the transport reads PLAY / NEXT / STOP, and the caveats cost no permanent height', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  await stubRetainedPage(page);
  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();

  const pvw = page.getByRole('region', { name: 'PREVIEW' });
  await expect(pvw.getByRole('button', { name: 'PLAY', exact: true })).toBeVisible();
  await expect(pvw.getByRole('button', { name: 'NEXT', exact: true })).toBeVisible();
  await expect(pvw.getByRole('button', { name: 'STOP', exact: true })).toBeVisible();

  // R-022's acceptance requires the caveats to be stated IN the panel, so they are
  // DISCLOSED rather than deleted — reachable in one click, costing no height until
  // asked for. Both halves are asserted: hidden by default, and really there.
  const caveats = page.getByText('not pixel-identical');
  await expect(caveats).toBeHidden();
  const toggle = pvw.getByRole('button', { name: 'What rehearsal does not prove' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(caveats).toBeVisible();
});

test('the header prints one word per verb BUTTON, so no word names the wrong glyph', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));

  const heads = await page
    .getByRole('region', { name: 'Layers' })
    .locator('[data-verb-head]')
    .allTextContents();
  const buttons = await app
    .layerRow(layer)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));

  // The header's word row and the row's button row lay out on the SAME grid, so a
  // count mismatch does not merely omit a word — it shifts every head to the right
  // of the gap onto the wrong glyph, and wraps the last button onto a second line.
  // This product's STOP (graceful) and CLEAR (hard kill) are the INVERSE of the
  // reference product's, so a head above the wrong glyph is an air risk, which is
  // the whole reason the header prints words at all.
  expect(heads.length).toBe(buttons.length);
  expect(heads).toEqual(['LOAD', 'PLAY', 'ON PVW', 'NEXT', 'STOP', 'CLEAR']);
});
