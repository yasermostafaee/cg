import { buildLoopingVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 **`TIMING-WIRE-22 · DELTA B4` — THE TIMING SECTION, MEASURED IN A REAL ENGINE.**
 *
 * Every claim here is a BOX or a COMPUTED STYLE, and jsdom has neither (golden rule 12c):
 * `getBoundingClientRect()` is all zeros there, so a dom spec asserting a width compares zeros
 * and passes against a surface of any shape, including the one the owner photographed.
 *
 * ── WHAT THE OWNER SAW, 2026-09-15 ──────────────────────────────────────────
 *
 * Three notes, and each is a claim only a browser can answer:
 *
 *  1. «اینپوتها نیاز نیست اینقدر کشیده باشن چون فقط مقادیر عددی کوتاه میگیرن» — the boxes are
 *     stretched, and take only short numbers. A WIDTH.
 *  2. «برای گپ هم باید نشون داده بشه که مقدار بر اساس ثانیه هست مثل اینپوتهای دیزاینر» — the gap
 *     must say it is in seconds, the way the Designer's `speed [120] px/s` does. A rendered
 *     unit, INSIDE the field's border and beside the number.
 *  3. «Sent 5 more متنش باید مشخص‌تر باشه مخصوصاً عددش» — the count must read. An INK and a
 *     WEIGHT against the caption around it.
 *
 * ⚠ The unit's PRESENCE is already pinned in jsdom. What is pinned HERE is what jsdom cannot
 * see: that the unit lands inside the field's box, that the box is short beside the panel it
 * sits in, and that the selected chip is painted differently from the unselected one.
 *
 * ⚠ **NOTE 3 IS PINNED IN JSDOM, NOT HERE, AND THE REASON IS NOT LAZINESS.** The sent line
 * renders only on a row that is ON AIR with an accepted send behind it, which this fixture does
 * not reach — the case written for it here SKIPPED on every run, and a case that never executes
 * is a claim wearing a test's clothes. Its ink is an INLINE style, which the jsdom cascade
 * genuinely resolves (golden rule 12c names computed-style reads as the one thing jsdom answers
 * honestly), so `timingSection.dom.test.ts` pins it where it actually runs. What remains
 * undischarged is only how that line looks against this panel's REAL background, and no test of
 * either kind was ever going to answer that.
 */

const WIDE = { width: 1280, height: 800 };
const TEMPLATE = 'tpl-e2e-loop';

test.describe('DELTA B4 — the Timing section as the owner sees it', () => {
  test.beforeEach(async ({ app, page }) => {
    await page.setViewportSize(WIDE);
    await app.importVcg('looping.vcg', await buildLoopingVcg(TEMPLATE));
    // `importVcg` seats the row; selecting it is what opens the Inspector on it.
    await app.selectStackRow(TEMPLATE);
  });

  test('🔴 the numeric boxes are SHORT — they take short numeric values', async ({ app }) => {
    const section = app.inspector.locator('.cg-inspector-section', { hasText: 'Timing' });
    await expect(section).toBeVisible();

    const panel = await app.inspector.boundingBox();
    expect(panel).not.toBeNull();

    const gap = await section.getByLabel('Gap between passes').boundingBox();
    expect(gap, 'the gap box did not render').not.toBeNull();

    /*
      The claim is RELATIVE, not a pixel: a box that takes `1.5` must not be as wide as the panel
      it sits in. Half the panel is a generous ceiling and still fails the shape the owner
      photographed, which ran the full content width.
    */
    expect(
      gap!.width,
      `the gap box is ${String(Math.round(gap!.width))}px inside a ${String(Math.round(panel!.width))}px panel`,
    ).toBeLessThan(panel!.width / 2);
  });

  test('🔴 the gap says SECONDS, inside the field, beside the number', async ({ app }) => {
    const section = app.inspector.locator('.cg-inspector-section', { hasText: 'Timing' });
    const field = section.locator('.cg-num-unit');
    const unit = field.locator('.cg-unit');
    await expect(unit).toHaveText('s');

    const fieldBox = await field.boundingBox();
    const unitBox = await unit.boundingBox();
    expect(fieldBox).not.toBeNull();
    expect(unitBox).not.toBeNull();

    // INSIDE the field's border — the Designer's shape, not a word floating after the control.
    expect(unitBox!.x, 'the unit escaped the field on the left').toBeGreaterThanOrEqual(
      fieldBox!.x,
    );
    expect(
      unitBox!.x + unitBox!.width,
      'the unit escaped the field on the right',
    ).toBeLessThanOrEqual(fieldBox!.x + fieldBox!.width + 1);

    // …and it must still be there once a value is typed. This is the whole reason it moved out
    // of the placeholder, and it is the half a placeholder-only check cannot see.
    await section.getByLabel('Gap between passes').fill('1.5');
    await expect(unit).toHaveText('s');
    await expect(unit).toBeVisible();
  });

  test('🔴 the unit is DIM and the value is not — one reads as the number, one as its unit', async ({
    app,
  }) => {
    const section = app.inspector.locator('.cg-inspector-section', { hasText: 'Timing' });
    const ink = (loc: ReturnType<typeof section.locator>): Promise<string> =>
      loc.evaluate((el) => getComputedStyle(el).color);

    const unitInk = await ink(section.locator('.cg-num-unit .cg-unit'));
    const valueInk = await ink(section.getByLabel('Gap between passes'));
    expect(unitInk, 'the unit is painted exactly like the value it qualifies').not.toBe(valueInk);
  });

  test('🔴 ONE focus ring, on the wrapper — owner: «بردر اینپوت داخلی رو حذف کن»', async ({
    app,
    page,
  }) => {
    /*
      The gap field is a WRAPPER carrying the field chrome with a bare input inside it, so there
      are two elements that can each draw a ring — and both did. Measured in Chromium before the
      fix, with the field focused:

        inner  input → border 0px none, outline none, box-shadow rgb(116 205 246) 0 0 0 2px
        wrapper span → border 1px solid rgb(116 205 246), box-shadow rgb(116 205 246) 0 0 0 2px

      The inner one came from `@cg/ui`'s shared `input:focus-visible` halo, which is a
      BOX-SHADOW on purpose — its own comment says it is a box-shadow precisely because
      components set `outline: none` inline, so the halo survives them. Zeroing `border` and
      `outline` on the inner input therefore suppressed the two properties that were never
      drawing it.

      ⚠ This is pinned in a BROWSER and not in jsdom, and not only for the usual reason. The
      claim is about which of TWO nested elements paints, and about a shared rule from another
      package resolving against a local one at equal specificity — a cascade question whose
      answer jsdom is entitled to get differently (golden rule 12c).
    */
    const section = app.inspector.locator('.cg-inspector-section', { hasText: 'Timing' });
    const field = section.locator('.cg-num-unit');
    const input = section.getByLabel('Gap between passes');

    await input.focus();

    // The INNER input draws nothing: no halo, no border, no outline.
    await expect(input, 'the inner input still draws its own ring').toHaveCSS('box-shadow', 'none');
    await expect(input).toHaveCSS('border-width', '0px');

    // …and the WRAPPER still shows focus, because it is the thing that looks like the field.
    // A field that stopped showing focus would be the accessibility regression this is one
    // edit away from, so the ring is asserted PRESENT, not merely "not doubled".
    const wrapperShadow = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(wrapperShadow, 'focus is no longer visible at all').not.toBe('none');

    // The unit sits INSIDE that one ring, which is what makes the field read as one control.
    await expect(field.locator('.cg-unit')).toBeVisible();

    // Blurring takes the ring away — otherwise "present" above would pass on a permanent ring.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await expect(field).toHaveCSS('box-shadow', 'none');
  });

  test('the two-state choice SHOWS which is selected — not only to a screen reader', async ({
    app,
    page,
  }) => {
    /*
      `aria-pressed` alone is a fact only a screen reader can read. The owner's complaint about
      the bare `∞` was that the console did not say which state the row was IN, and an invisible
      selection is the same defect with better semantics.

      🔴 **THE POINTER HAS TO BE MOVED OFF THE CHIP BEFORE THE COLOUR IS READ, and that is worth
      a note because getting it wrong produced a convincing fake defect.**

      A Playwright `click()` leaves the pointer ON the element, so the chip matches
      `[aria-pressed="true"]:hover`, which is a DIFFERENT declaration
      (`--r-look-btn-sel-line`, `rgb(75, 116, 139)`) from the resting selected one
      (`--r-look-btn-sel-bg`, `rgb(46, 78, 103)`) — deliberately, so an engaged chip lifts under
      the pointer rather than reading as switched off. On top of that the chip carries a colour
      TRANSITION, so a read taken immediately catches a value part-way between the two:
      `rgb(27, 37, 50)` → `rgb(55, 82, 101)` → `rgb(75, 115, 138)` → `rgb(75, 116, 139)`, all
      measured in one run.

      ⚠ The first cut of this spec read the colour with a one-shot
      `evaluate(() => getComputedStyle(el).backgroundColor)` and concluded the selected paint was
      stuck to the chip's POSITION — `el.matches(selector)` said the rule matched while the
      computed background was one no matching rule could produce. Read literally that is
      impossible, and it looked exactly like a product defect worth a bug number. It was a
      mid-transition value under the hover rule. The lesson is not "add a wait": it is that a
      colour assertion must (a) put the element in the state it is asserting about — resting, so
      the pointer goes elsewhere — and (b) use a RETRYING matcher, so a transition in flight is
      never mistaken for a rule that does not apply.
    */
    const group = app.inspector.locator('.cg-timing-choice');
    await expect(group).toBeVisible();
    const untilStop = group.getByRole('button', { name: 'Until stop' });
    const count = group.getByRole('button', { name: 'Count' });
    /** Take the pointer off the chips, so what is measured is the RESTING paint. */
    const rest = (): Promise<void> => page.mouse.move(2, 2);

    // The fixture authors `repeat: 3`, so `Count` is the state the row is already in.
    const SELECTED = 'rgb(46, 78, 103)';
    await rest();
    await expect(count).toHaveCSS('background-color', SELECTED);
    await expect(untilStop).not.toHaveCSS('background-color', SELECTED);

    // …and the paint FOLLOWS the selection, rather than being fixed to one of the two.
    await untilStop.click();
    await rest();
    await expect(untilStop).toHaveCSS('background-color', SELECTED);
    await expect(count).not.toHaveCSS('background-color', SELECTED);
  });
});
