import { expect, test } from './fixtures/runtime.js';

/**
 * The PAGE never scrolls; the PANELS do.
 *
 * jsdom does no layout, so the unit test can only pin the CSS contract. This drives a real
 * browser and asserts the behaviour that contract exists to produce: overflow a panel and
 * the document must stay exactly one viewport tall, with the scrolling confined to the panel
 * that overflowed.
 */
test('a long stack scrolls its own panel, never the page', async ({ app }) => {
  const page = app.page;

  // Overflow the STACK well past the viewport by loading the seeded templates repeatedly —
  // the mock accepts every load. The boot seed already puts rows on the stack, so the target
  // is relative to what is there.
  const rows = page.getByRole('region', { name: 'Stack' }).locator('.cg-row');
  const seeded = await rows.count();
  const loadButtons = app.loadButtons();
  const count = await loadButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < 12; i++) {
    await loadButtons.nth(i % count).click();
  }
  await expect(rows).toHaveCount(seeded + 12);

  // The DOCUMENT does not scroll: its scrollable height is its visible height.
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(doc.scrollHeight).toBe(doc.clientHeight);

  // The stack's own list DOES scroll, and scrolling it moves nothing else.
  const list = page
    .getByRole('region', { name: 'Stack' })
    .locator('div')
    .filter({
      has: page.locator('.cg-row'),
    });
  const scrolled = await list.first().evaluate((el) => {
    el.scrollTop = 400;
    return { scrollTop: el.scrollTop, overflowed: el.scrollHeight > el.clientHeight };
  });
  expect(scrolled.overflowed).toBe(true);
  expect(scrolled.scrollTop).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/**
 * R-021 — the centre column now holds TWO panels (fixed bank above the stack).
 * The layout contract must survive both at once: the fixed panel is capped
 * (`appShell.fixedPanel`), the stack keeps the remainder, and overflowing the
 * stack still scrolls the STACK's own list — never the document.
 */
test('the two-panel centre column stays bounded: fixed bank + long stack never scroll the page', async ({
  app,
}) => {
  const page = app.page;
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
  });
  await page.reload();
  await expect(app.fixedPanel).toBeVisible();

  // Overflow the stack with both panels up.
  const rows = page.getByRole('region', { name: 'Stack' }).locator('.cg-row');
  const seeded = await rows.count();
  const loadButtons = app.loadButtons();
  const count = await loadButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < 12; i++) {
    await loadButtons.nth(i % count).click();
  }
  await expect(rows).toHaveCount(seeded + 12);

  // The DOCUMENT still does not scroll…
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(doc.scrollHeight).toBe(doc.clientHeight);

  // …the fixed panel stays a bounded strip (capped at 40% of its column, so
  // well under half the viewport), and the stack survives beside it.
  const viewport = page.viewportSize();
  const fixedBox = await app.fixedPanel.boundingBox();
  expect(fixedBox).not.toBeNull();
  expect(fixedBox?.height ?? 0).toBeLessThan((viewport?.height ?? 0) * 0.5);
  await expect(page.getByRole('region', { name: 'Stack' })).toBeVisible();
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
