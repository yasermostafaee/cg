import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `REPAIR-03` A2 — THE LAYER ROW'S HOVER IS VISIBLE, AND IT IS NOT EITHER TREE'S VALUE.
 *
 * The audit filed the row hover as a delta to adopt. Measured, it is a DEFECT IN BOTH TREES:
 * this console's hover was `--r-surface-raised`, **1.02:1** against the row and DARKER than
 * it, and the reference's `#1F2937` is **1.04:1**. On the one table whose entire interaction
 * is "click a row to select it", neither is an affordance. So the value is `#283443` —
 * `--r-row-hover-bg`, from neither tree, at **1.20:1** — and the AA ceiling on the row's own
 * muted ink is what fixes it there rather than higher (see the token for the arithmetic).
 *
 * ── ASSERTED AS PROPERTIES, NOT AS THE VALUE ─────────────────────────────────────────
 *
 * The owner may retune the hover; what must not come back is an invisible one. So this file
 * asserts the three RELATIONSHIPS — hover differs from rest, hover differs from selected, and
 * the ink on a hovered row stays legible — and computes the ratios here rather than pinning a
 * hex. A test that pinned `#283443` would have to be re-edited by the next person to change
 * it, which is how a property test decays into a value test.
 *
 * ⚠ PLAYWRIGHT, NOT JSDOM: a `:hover` state needs a real pointer, and jsdom has none — a jsdom
 * copy of this file would read the REST colour twice and pass against any hover at all,
 * including the invisible one it exists to forbid (golden rule 12c).
 *
 * ⚠ HOVER vs SELECTED IS 1.04:1 IN FILL, AND THAT IS REPORTED RATHER THAN TUNED. The selection
 * wash sits at 1.25:1 over the row — almost exactly where the AA ceiling puts the hover — so
 * the two cannot be separated by fill without either dropping `--r-text-muted` below AA or
 * moving the selection. What separates them is the selection's 2 px accent FRAME, and that is
 * what this file asserts for the pair.
 */

/** WCAG relative luminance contrast between two opaque `rgb(...)` strings. */
function contrast(a: string, b: string): number {
  const parse = (s: string): number[] => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (m === null) throw new Error(`not a colour: ${s}`);
    return (m[1] ?? '')
      .split(',')
      .slice(0, 3)
      .map((n) => Number(n.trim()));
  };
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: number[]): number =>
    0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0);
  const [hi, lo] = [lum(parse(a)), lum(parse(b))].sort((x, y) => y - x);
  return Math.round((((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)) * 100) / 100;
}

test('§A2 — the row hover is visible against the row, and legible under it', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });

  const row = app.layers.locator('[data-layer][data-item-id]').first();
  await expect(row).toBeVisible();

  const fill = (): Promise<string> => row.evaluate((el) => getComputedStyle(el).backgroundColor);

  /*
   * ⚠ `.cg-row` TRANSITIONS its background, so both reads must be of the SETTLED colour —
   * `layer-table-geometry.spec.ts` polls for the same reason. Read immediately after
   * `hover()`, this measured **1.14:1** on a fill that settles at 1.20: a mid-transition
   * sample, which would have made the floor look like the value's problem rather than the
   * instrument's. Polling on the RATIO rather than sleeping keeps the wait bounded by the
   * thing being asserted.
   */
  await page.mouse.move(5, 5); // park the pointer off every row, so REST is really rest
  await expect.poll(fill).toBe(await fill());
  const rest = await fill();

  await row.hover();
  await expect
    .poll(async () => contrast(await fill(), rest), {
      message: 'the hover fill settles',
    })
    .toBeGreaterThan(1.1);
  const hover = await fill();

  const step = contrast(hover, rest);
  expect(
    step,
    `the hover must be a step the eye lands on: measured ${String(step)}:1 against the row ` +
      `(this console shipped 1.02:1 and the reference draws 1.04:1 — both invisible)`,
  ).toBeGreaterThanOrEqual(1.15);

  // …and the row's own text stays legible ON the hover fill. The binding ink is the muted one
  // (the row number, the REMOVE label); neither is WCAG "large text", so the floor is AA 4.5.
  const muted = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--r-text-muted').trim(),
  );
  const mutedRgb = await page.evaluate((hex) => {
    const d = document.createElement('div');
    d.style.color = hex;
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  }, muted);
  const ink = contrast(mutedRgb, hover);
  expect(
    ink,
    `--r-text-muted on the hovered row: ${String(ink)}:1 (AA floor 4.5)`,
  ).toBeGreaterThanOrEqual(4.5);
});

test('§A2 — a hovered row is still told apart from the SELECTED one', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });

  const rows = app.layers.locator('[data-layer][data-item-id]');
  const first = rows.nth(0);
  const second = rows.nth(1);
  await expect(second).toBeVisible();

  // Select the FIRST row, then hover the SECOND: the two states are on screen together, which
  // is the only arrangement in which confusing them costs anything.
  await first.locator('[data-row-body]').click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await second.hover();

  /*
    The separation is carried by the selection's FRAME, not by its fill — see the file header.
    Asserted as the mechanism: the selected row has an inset accent ring and the hovered one
    does not.
  */
  const selectedShadow = await first.evaluate((el) => getComputedStyle(el).boxShadow);
  const hoveredShadow = await second.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(selectedShadow, 'the selected row carries an inset ring').toContain('inset');
  expect(hoveredShadow === selectedShadow, 'a hovered row must not wear the selection ring').toBe(
    false,
  );
});
