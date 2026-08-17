import { expect, test } from './fixtures/runtime.js';

/**
 * The PAGE never scrolls; the PANELS do.
 *
 * jsdom does no layout, so the unit test can only pin the CSS contract. This drives a real
 * browser and asserts the behaviour that contract exists to produce: overflow a panel and
 * the document must stay exactly one viewport tall, with the scrolling confined to the panel
 * that overflowed.
 */
/**
 * R-028 part B — the subject moved, the invariant did not. The Library, Stack
 * and Fixed-Layers panels merged into ONE Layers list, so "a long stack scrolls
 * its own panel" is now asserted of that list. The viewport is shrunk rather
 * than the row count inflated: overflow is the precondition this contract is
 * about, and forcing it by geometry is exact, where loading N more rows was
 * only ever a guess that N was enough.
 */
test('a long layers list scrolls its own panel, never the page', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 400 });
  await expect(app.layers.locator('.cg-row').first()).toBeVisible();

  // The DOCUMENT does not scroll: its scrollable height is its visible height.
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(doc.scrollHeight).toBe(doc.clientHeight);

  // The layers list DOES scroll, and scrolling it moves nothing else.
  //
  // The scroll container is found by walking UP from a row rather than being
  // named by selector: which wrapper carries `overflow-y` is a styling detail
  // that has already moved once, and a test pinned to it fails on a refactor
  // that kept the contract perfectly. What matters is that the overflow is
  // absorbed somewhere INSIDE the panel and never reaches the document.
  const scrolled = await app.layers
    .locator('.cg-row')
    .first()
    .evaluate((row) => {
      for (let el = row.parentElement; el !== null; el = el.parentElement) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
        if (el.scrollHeight <= el.clientHeight) continue;
        el.scrollTop = 400;
        return { found: true, scrollTop: el.scrollTop };
      }
      return { found: false, scrollTop: 0 };
    });
  expect(scrolled.found).toBe(true);
  expect(scrolled.scrollTop).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/**
 * R-028 part B — the centre column's two stacked panels became two TABS
 * (LAYERS / PLAYOUT). The layout contract has to hold on both: whichever tab is
 * up, its list scrolls itself and the document stays exactly one viewport tall.
 * The playout tab is the one that matters most here — it is a safety surface,
 * and a page that scrolls it out of view is a surface the operator cannot see.
 */
test('the PLAYOUT tab is bounded too: switching tabs never scrolls the page', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 400 });

  await app.playoutTab.click();
  await expect(app.playoutTab).toHaveAttribute('aria-selected', 'true');
  await expect(app.layers.getByText('These layers belong to the PLAYOUT system')).toBeVisible();

  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(doc.scrollHeight).toBe(doc.clientHeight);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // …and back, with the layers list still owning its own scrolling.
  await page.getByRole('tab', { name: /^LAYERS/ }).click();
  await expect(app.layers).toBeVisible();
  const back = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(back.scrollHeight).toBe(back.clientHeight);
});

/**
 * The #312 banners are compact strips, not half the viewport.
 *
 * The banner used to land in the shell's `1fr` grid track and stretch to fill it. This pins
 * the outcome an operator sees: the alert is a strip, and the three panels still own the
 * screen beneath it.
 */
test('the TEST MODE banner is a compact strip, not a block', async ({ app }) => {
  const page = app.page;
  // The E2E fixture boots the app in explicit test mode, so the banner is already up — which
  // is exactly the state that used to eat half the viewport.
  const banner = page.getByRole('alert', { name: 'Test mode' });
  await expect(banner).toBeVisible();

  const viewport = page.viewportSize();
  const box = await banner.boundingBox();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  // Content-sized: heading + one line + the buttons. Nowhere near the half-viewport block
  // the grid stretch produced.
  expect(box?.height ?? 0).toBeLessThan((viewport?.height ?? 0) * 0.25);

  // …and it is still loud: the alert, its heading and its way out are all present.
  await expect(banner).toContainText('NOTHING IS ON AIR');
  await expect(banner.getByRole('button', { name: 'Leave test mode' })).toBeVisible();

  // The page still does not scroll with a banner up.
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(doc.scrollHeight).toBe(doc.clientHeight);
});
