import { test, expect } from './fixtures/runtime.js';

/**
 * `STATION-CHROME-01` §1 — **the tokens resolve in a real browser, and the surfaces
 * the owner named look exactly as they did.**
 *
 * `controls.css` no longer declares the `--r-*` values; `applyThemeVars()` writes them
 * into the document before the first render. That is the ONE new risk this refactor
 * carries, and it is invisible to every other test in the suite: a stylesheet whose
 * `var(--r-…)` resolves to nothing does not throw, does not fail a type check and does
 * not fail a jsdom test — it renders a page with no colours on it. Only a real browser
 * with real cascade can say otherwise, which is what this spec is.
 *
 * ⚠ THE VALUES BELOW ARE NO LONGER "WHAT SHIPPED BEFORE THE MOVE". They were, and that
 * second job is finished: `STATION-CHROME-01` moved 120 colours into `theme.ts` without
 * moving a pixel, and this spec was the evidence. `RUNTIME-REDESIGN-01` Phase 2 then
 * repainted the console from the owner's approved reference, ON PURPOSE, so the accent
 * here is now the reference's blue. What survives — and what this spec is actually for —
 * is the mechanism: the tokens REACH the browser, and nothing on the page is painted
 * with an unresolved `var()`.
 */

const rgb = (r: number, g: number, b: number): string => `rgb(${r}, ${g}, ${b})`;

test('the --r-* tokens resolve in the browser, and the LAYERS table keeps its grounds', async ({
  app,
}) => {
  const page = app.page;

  // ── the mechanism itself ────────────────────────────────────────────────────
  const applied = await page.evaluate(() => {
    const style = document.getElementById('cg-theme-vars');
    const cs = getComputedStyle(document.documentElement);
    return {
      hasStyle: style !== null,
      accent: cs.getPropertyValue('--r-accent').trim(),
      add: cs.getPropertyValue('--r-btn-add').trim(),
      markedFill: cs.getPropertyValue('--r-row-marked-fill').trim(),
      lockScrim: cs.getPropertyValue('--r-lock-scrim').trim(),
    };
  });
  expect(applied.hasStyle, 'applyThemeVars did not install its <style>').toBe(true);
  expect(applied.accent.toLowerCase()).toBe('#74cdf6');
  // The ADD role is its own declaration, and equal in VALUE to the accent today —
  // which is exactly the property that lets the whole palette move at once and the
  // owner's one-line edit to the Add colour stay possible at the same time.
  expect(applied.add.toLowerCase()).toBe('#74cdf6');
  // 🔴 the owner's marked-row fill, byte for byte, through the token.
  expect(applied.markedFill).toBe('rgb(145 93 5)');
  expect(applied.lockScrim).toBe('rgba(15, 23, 42, 0.94)');

  // ── the surfaces ────────────────────────────────────────────────────────────
  await expect(page.locator('.cg-row.has-template').first()).toHaveCSS(
    'background-color',
    rgb(30, 38, 51),
  );
  await expect(page.locator('.cg-row:not(.has-template)').first()).toHaveCSS(
    'background-color',
    rgb(16, 20, 30),
  );

  /*
    A control painted with NO background at all is what an unresolved var looks like — the
    whole failure mode this spec exists to catch.

    ⚠ RE-POINTED BY `AUDIT-CLOSE-01` B1, and the re-point makes it stronger. It read
    `.cg-btn` FIRST, which was a filled bulk verb only because that happened to be the first
    button in the DOM; the app header put a `ghost` control ahead of it, and `ghost` is
    transparent BY DEFINITION (`controls.css` permits it "where surrounding chrome already
    frames the control"). So the spec was asserting a fill against a variant chosen by
    document order. It now names a variant whose fill is part of its contract.
  */
  const painted = await page
    .locator('.cg-btn--neutral')
    .first()
    .evaluate((el) => {
      return getComputedStyle(el).backgroundColor;
    });
  expect(painted, 'a control with no background = the tokens never arrived').not.toBe(
    'rgba(0, 0, 0, 0)',
  );
});

test('STATION SETUP paints from the tokens — its scrim is not transparent', async ({ app }) => {
  const page = app.page;

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Station setup' });
  await expect(dialog).toBeVisible();

  // The modal scrim is `--r-modal-scrim` now. Unresolved, it would be transparent and
  // the console behind would stay fully legible — a real, silent visual regression.
  const scrimBg = await dialog.evaluate((el) => {
    const scrim = el.parentElement;
    return scrim === null ? null : getComputedStyle(scrim).backgroundColor;
  });
  expect(scrimBg).toBe('rgba(0, 0, 0, 0.6)');
});
