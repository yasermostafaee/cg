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

/*
 * 🔴 `MONITORS-01` — THE STRIP IS FOLDED AWAY WHEN THE CONSOLE BOOTS, and this file's
 * subject lives inside it, so it is opened first.
 *
 * The default moved from SHOWN to HIDDEN because neither box is confidence monitoring:
 * PGM is a fixed empty placeholder for the unbuilt `C-016`, and PVW is a LOCAL browser
 * render of the rehearsing rows (`R-022` — nothing is ever sent to CasparCG). None of
 * that changes what this file proves, so the state each test was written against is
 * established rather than its assertions being rewritten.
 *
 * `app.showMonitors()` asserts the strip is actually up before returning — see the
 * fixture. Boot state itself is proved in `shell-chrome.spec.ts` §B4.
 */
test.beforeEach(async ({ app }) => {
  await app.showMonitors();
});
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

test('the transport reads PLAY / NEXT / STOP, and is there before anything is', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const layer = await app.importVcg('valid.vcg', await buildValidVcg('tpl-e2e-1'));
  await stubRetainedPage(page);

  const pvw = page.getByRole('region', { name: 'PREVIEW' });

  /*
    🔴 `CONSOLE-LOOK-06` §2 — PRESENT BEFORE THERE IS ANYTHING TO DRIVE, each disabled by its
    own condition. This is the half that changed: the transport used to be rendered by
    `RehearsalStage`, so it did not exist until a row was rehearsing and a page had loaded,
    and the row of buttons appeared under the operator's hand. Our own rule in `LayersPanel`
    says why that is wrong — "controls that come and go move the target under the operator's
    hand mid-reach".
  */
  for (const verb of ['PLAY', 'NEXT', 'STOP'] as const) {
    await expect(pvw.getByRole('button', { name: verb, exact: true })).toBeVisible();
    await expect(pvw.getByRole('button', { name: verb, exact: true })).toBeDisabled();
  }
  // …and the scope they act on is stated beside them, because they drive EVERY rehearsing
  // frame and never the selected one.
  await expect(pvw.getByText('ALL LAYERS')).toBeVisible();

  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  await expect(pvw.getByRole('button', { name: /^PLAY/ })).toBeEnabled();

  /*
    🔴 SUPERSEDED BY THE OWNER, 2026-09-12, and replaced rather than deleted so the change is
    visible: «آیکون اینفو و نمایش توضیحات روی canvas نیاز نیست» — the info icon and the
    on-canvas description are not wanted. What this used to assert was the DISCLOSURE (hidden
    by default, one click to open).

    `R-022`'s acceptance still asks for the two honest caveats to be stated IN the item, so
    they moved to the stamp that already names what this render is, where they cost no
    picture. Both halves are asserted, exactly as before: the toggle is GONE, and the caveats
    are really there.
  */
  await expect(pvw.getByRole('button', { name: /rehearsal does not prove/i })).toHaveCount(0);
  const stamp = pvw.locator('[data-stage-illustration]');
  await expect(stamp).toBeVisible();
  const caveats = (await stamp.getAttribute('title')) ?? '';
  expect(caveats).toMatch(/not pixel-identical/i);
  expect(caveats).toMatch(/placeholder/i);
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
  // §5 — the first head is `ITEM`, not `LOAD`. It is the one column whose control
  // is a TOGGLE, so no verb can name it without being wrong on half the rows: the
  // row under test is BOUND, and its first glyph is a trash can. See
  // `LayerTableHeader`.
  expect(heads).toEqual(['ITEM', 'PLAY', 'ON PVW', 'NEXT', 'STOP', 'CLEAR']);
  // …and the head names the column while the BUTTON goes on naming itself — the
  // two channels the icon-only verbs depend on, and the reason the neutral head
  // costs nothing.
  expect(buttons[0]).toBe('REMOVE');
});
