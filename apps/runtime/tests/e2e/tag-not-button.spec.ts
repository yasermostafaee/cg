import { test, expect } from './fixtures/runtime.js';
import { TAG_CLASSES } from '../support/tagClasses.js';

/**
 * 🔴 `TAG-NOT-BUTTON-07` §6 — **THE GUARD'S REAL-ENGINE HALF: a tag must not LOOK pressable.**
 *
 * The jsdom guard (`tests/tagsAreNotButtons.dom.test.ts`) owns the questions jsdom can answer
 * honestly — element type, ARIA role, focusability, and whether a tag came through the `Tag`
 * primitive at all. It deliberately asserts nothing about appearance, because golden rule 12
 * says it must not: jsdom has no layout, and its cascade is not Chrome's, so a `cursor` or a
 * `:hover` read there is not evidence about what the operator sees.
 *
 * This file is the other half, and it exists because the defect that started this prompt was
 * never about the markup. Two rounds of style edits had already made these spans inert in
 * code; what the owner kept reporting was that they still READ as controls. So the claim
 * measured here is the one he was actually making:
 *
 *   1. the pointer does not promise an action — `cursor: default`, never `pointer`;
 *   2. nothing changes under the pointer — background, ink, border and transform are
 *      byte-identical at rest and on hover;
 *   3. the tag is not in the tab order, measured by actually pressing Tab into the dialog
 *      rather than by reading `tabIndex`.
 *
 * ⚠ AND THE COMPLEMENT, in the same file on purpose (§3 — the rule is a MATCH, not a ban).
 * A chip that DOES something stays a real button with a visible focus ring. A guard that only
 * forbade could be discharged by flattening every chip into text, which would quietly take a
 * working control away from every keyboard operator — so the ban and its limit are asserted
 * together, where neither can be relaxed without the other going red.
 */

/** Rest-vs-hover computed style, as one comparable string. */
const LOOK = `(el) => {
  const cs = getComputedStyle(el);
  return [cs.backgroundColor, cs.color, cs.borderTopColor, cs.transform, cs.textDecorationLine].join(' | ');
}`;

test('a Station setup tag cannot be pressed and does not look pressable', async ({ app, page }) => {
  await app.openStationSetupAt('Channel');

  // ⚠ SCOPED TO THE DIALOG. An unscoped `[data-cg-tag]` resolves to a console chip BEHIND the
  // modal — visible to the DOM, unreachable to the pointer — and every hover then times out
  // against the scrim rather than measuring anything.
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  const tag = setup.locator('[data-cg-tag]').first();
  await expect(tag).toBeVisible();

  // ── 1. THE POINTER DOES NOT PROMISE AN ACTION ────────────────────────────────────────
  const cursor = await tag.evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor, 'a tag that does nothing must not show a pointer cursor').toBe('default');

  // ── 2. NOTHING CHANGES UNDER THE POINTER ─────────────────────────────────────────────
  const rest = await tag.evaluate(LOOK);
  await tag.hover();
  const hovered = await tag.evaluate(LOOK);
  expect(hovered, 'a tag must carry no hover treatment').toBe(rest);

  // ── 3. IT IS NOT IN THE TAB ORDER ────────────────────────────────────────────────────
  // Pressed, not read: `tabIndex` is a property, the tab ORDER is a behaviour, and it is the
  // behaviour an operator meets. Twenty presses is well past the dialog's control count.
  const handle = await tag.elementHandle();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const onTag = await page.evaluate((el) => document.activeElement === el, handle);
    expect(onTag, 'a tag must never take keyboard focus').toBe(false);
  }
});

test('every visible tag on every Station setup tab is inert', async ({ app, page }) => {
  // The rail's own titles, verbatim from `sections.ts` — "Text file delimiters", not
  // "Text delimiters". A near-miss here selects nothing and the sweep silently covers one
  // tab fewer, which is the failure mode this whole prompt is about.
  const tabs = ['Channel', 'Servers', 'Live sources', 'Text file delimiters', 'Layers'];
  let seen = 0;

  for (const name of tabs) {
    if (name === 'Channel') await app.openStationSetupAt(name);
    else {
      await page
        .getByRole('dialog', { name: 'Station setup' })
        .getByRole('tablist', { name: 'Station setup sections' })
        .getByRole('tab', { name: new RegExp(`^${name}`) })
        .click();
    }

    const found = await page.evaluate((classes: readonly string[]) => {
      const bad: string[] = [];
      let count = 0;
      const say = (el: Element): string => `:: ${(el.textContent ?? '').trim().slice(0, 30)}`;

      for (const el of document.querySelectorAll('[data-cg-tag]')) {
        if (el.getBoundingClientRect().width === 0) continue; // a hidden pane measures 0x0
        count++;
        const cs = getComputedStyle(el);
        const why: string[] = [];
        if (el.tagName === 'BUTTON') why.push('is a <button>');
        if (el.getAttribute('role') === 'button') why.push('has role=button');
        if ((el as HTMLElement).tabIndex >= 0) why.push('is focusable');
        if (cs.cursor === 'pointer') why.push('shows a pointer cursor');
        if (why.length > 0) bad.push(`${why.join(' ')} ${say(el)}`);
      }

      /*
        🔴 AND THE COVERAGE CHECK, which is what stops this sweep going BLIND.

        Everything above looks only at elements that already carry the marker, so a tag
        rebuilt on `Button` simply LEAVES the set — the sweep gets smaller and stays green.
        That is not theory: the §6 planted red passed the marker-only version of this test and
        was caught here. So the second pass asks the question from the other side — anything
        WEARING a tag class must have come through the primitive.
      */
      for (const el of document.querySelectorAll('*')) {
        const cls = el.getAttribute('class');
        if (cls === null) continue;
        if (!cls.split(/\s+/).some((c) => classes.includes(c))) continue;
        if (el.getBoundingClientRect().width === 0) continue;
        if (!el.hasAttribute('data-cg-tag')) {
          bad.push(`wears a tag class but is not a Tag (<${el.tagName.toLowerCase()}>) ${say(el)}`);
        }
      }
      return { bad, count };
    }, TAG_CLASSES);

    expect(found.bad, `a tag on the ${name} tab looks pressable`).toEqual([]);
    seen += found.count;
  }

  // The positive control. Without it this whole test passes against a dialog that rendered no
  // tags at all — a renamed marker, a pane that failed to mount, a selector typo.
  expect(seen, 'no tag was measured on any tab — the sweep proves nothing').toBeGreaterThan(4);
});

/**
 * 🔴 THE POSITIVE CONTROL, and the reason it is not optional.
 *
 * The test above asserts `cursor: default` and "focus never lands here". Both are NEGATIVE
 * observations, and a negative observation is void until the instrument is shown to be able to
 * report the opposite — a `cursor` read that returned `default` for everything, or a Tab press
 * that moved focus nowhere at all, would pass that test against a completely broken surface.
 *
 * So the same two measurements are taken of a control that genuinely CAN be pressed, on the
 * same surface, in the same run. It must come back `pointer` and it must take focus. That is
 * also §3's other half stated as a test: a thing that DOES something stays a real button,
 * keyboard-reachable, with a visible focus state.
 *
 * The subject is a rail TAB rather than the local-address chip: the chips render only when the
 * bridge enumerates this machine's interfaces, so a spec built on them would SKIP on most
 * hosts — and a skipped control is no control at all.
 */
test('the same measurements report PRESSABLE for a real control', async ({ app, page }) => {
  await app.openStationSetupAt('Channel');

  const setup = page.getByRole('dialog', { name: 'Station setup' });
  const control = setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Servers/ });
  await expect(control).toBeVisible();

  // 1. The pointer DOES promise an action here.
  expect(
    await control.evaluate((el) => getComputedStyle(el).cursor),
    'the cursor probe must be able to report `pointer`, or its `default` above means nothing',
  ).toBe('pointer');

  // 2. Focus DOES land here — so "focus never lands on a tag" is a real finding.
  await control.focus();
  const handle = await control.elementHandle();
  expect(
    await page.evaluate((el) => document.activeElement === el, handle),
    'the focus probe must be able to report focus, or its silence above means nothing',
  ).toBe(true);

  /*
    3. …and KEYBOARD focus is VISIBLE.

    ⚠ MEASURED AFTER A REAL KEY, not after `.focus()`. Chrome grants `:focus-visible` on its
    own heuristics, and a scripted `.focus()` on a button does NOT qualify — the ring the app
    draws through `:focus-visible` (both `@cg/ui`'s halo and `.cg-btn`'s own) is simply absent
    at that point. Reading it there measures the heuristic, not the stylesheet, and would have
    failed against a perfectly correct control. So focus is moved with an actual `ArrowDown` on
    the rail, which is how an operator reaches the next tab.

    The comparison is against the SAME element unfocused rather than a hard-coded colour, so
    the app stays free to change what the ring looks like — `UI-ACCENT-12` is about to.
  */
  const before = await control.evaluate(
    (el) => `${getComputedStyle(el).boxShadow} | ${getComputedStyle(el).outlineStyle}`,
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  const after = await control.evaluate(
    (el) => `${getComputedStyle(el).boxShadow} | ${getComputedStyle(el).outlineStyle}`,
  );
  const paints = !after.startsWith('none |') || after !== before;
  expect(paints, 'a control that can be pressed must show WHERE focus is').toBe(true);
});
