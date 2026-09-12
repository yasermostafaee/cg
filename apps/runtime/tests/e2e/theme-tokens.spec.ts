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

    🔴 AND THE SAME TRAP CAUGHT IT A SECOND TIME — `CONSOLE-LOOK-06` DELTA D4 made the layers
    bar's bulk verbs QUIET (the reference's `.layer-toolbar .btn` is transparent with a line
    border), and they are `neutral`, and they are first in the DOM. `.first()` picked one and
    the sentinel reddened over a change that was correct.

    ⚠ The lesson is the one B1 already wrote and did not go far enough with: a sentinel must
    name its subject by the PROPERTY it is testing, never by position. So it now asks for a
    neutral button whose fill is unconditional — one OUTSIDE a panel bar — and says so if it
    cannot find one, rather than silently testing whatever was first.
  */
  const painted = await page.evaluate(() => {
    const filled = [...document.querySelectorAll<HTMLElement>('.cg-btn--neutral')].find(
      (el) => el.closest('.cg-panel-header') === null,
    );
    return filled === undefined ? null : getComputedStyle(filled).backgroundColor;
  });
  expect(painted, 'no neutral button outside a bar — the sentinel has no subject').not.toBeNull();
  expect(painted, 'a control with no background = the tokens never arrived').not.toBe(
    'rgba(0, 0, 0, 0)',
  );

  /*
    …and the QUIET ones are quiet ON PURPOSE, which is the other half of the same reading: a
    transparent bulk verb must be transparent because a rule says so, not because a var failed
    to resolve. Its BORDER is the tell — an unresolved `--r-border` would leave no edge either.
  */
  const bulk = page.locator('.cg-panel-header [data-verb-tone]').first();
  await expect(bulk).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const edge = await bulk.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(edge, 'a quiet control with no edge = the tokens never arrived').not.toBe(
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
  /*
    ⚠ `SETTINGS-POLISH-04` §7 — the value moved to the reference's
    `dialog::backdrop{background:rgba(4,7,11,.76)}`, and the BLUR is read here too. This test's
    subject is that the token RESOLVED; a scrim with the right colour and no blur would be the
    same defect half-applied, because at 0.76 the ground alone reads as flat black.
  */
  const scrim = await dialog.evaluate((el) => {
    const s = el.parentElement;
    return s === null
      ? null
      : { bg: getComputedStyle(s).backgroundColor, blur: getComputedStyle(s).backdropFilter };
  });
  expect(scrim?.bg).toBe('rgba(4, 7, 11, 0.76)');
  expect(scrim?.blur).toBe('blur(5px)');
});
