import { buildPositionedVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴🔴 `INSPECTOR-DELTA` §1 — **A LOCKED POSITION FIELD MUST REFUSE THE DRAG, NOT ONLY THE
 * KEYBOARD.**
 *
 * The owner's report: on a row that is ON AIR the POSITION section says `locked while on air`
 * and the X/Y boxes render disabled — and dragging one still moves its value.
 *
 * **A field that LOOKS locked and accepts a drag is worse than one that never claimed to be
 * locked**, because the operator trusts the word and moves a graphic that is transmitting.
 * `R-011`'s recorded decision is that the lock refuses EVERYTHING.
 *
 * ── WHY THIS IS AN E2E, AND WHY IT USES RAW MOUSE COORDINATES ────────────────────────────
 *
 * The scrub gesture is `pointerdown` on the input followed by `pointermove` on the WINDOW
 * (`scrubGesture.ts` — window listeners, no React state, so the drag survives the pointer
 * leaving a small box). jsdom would report zeros for every box here and drives no real
 * pointer, so there is nothing to measure there (golden rule 12c).
 *
 * ⚠ And it must NOT go through `locator.hover()` / `locator.dragTo()`. Playwright's
 * actionability checks refuse a disabled element before dispatching anything, so those would
 * fail with "element is not enabled" — which looks like a passing guard and proves nothing
 * about what a real pointer does. `page.mouse` at the box's own coordinates is the operator's
 * actual gesture, with no actionability gate in front of it.
 *
 * ── THE POSITIVE CONTROL IS NOT OPTIONAL ─────────────────────────────────────────────────
 *
 * "the value did not move" is a NEGATIVE observation, and it is TRUE and WORTHLESS of a drag
 * that never happened — a wrong coordinate, a box of zero size, a gesture the harness cannot
 * deliver. So the SAME gesture, by the same helper, is driven against the SAME field while the
 * row is OFF AIR, and it must MOVE the value. Only then does the silence above mean refusal.
 */

/** The scrub gesture as a pointer actually performs it — no actionability gate. */
async function dragBy(
  page: import('@playwright/test').Page,
  field: import('@playwright/test').Locator,
  dx: number,
): Promise<void> {
  const box = await field.boundingBox();
  expect(box, 'the field is laid out — a null box would make the drag a no-op').not.toBeNull();
  const b = box!;
  expect(b.width, 'the field has a real width to grab').toBeGreaterThan(0);
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width / 2, y);
  await page.mouse.down();
  // Several moves, past the 3 px deadzone: one jump can be coalesced, and the gesture
  // commits per move.
  for (const step of [10, 25, 40, dx]) {
    await page.mouse.move(b.x + b.width / 2 + step, y);
  }
  await page.mouse.up();
}

test('🔴 the on-air lock refuses a DRAG on the position fields, not only the keyboard', async ({
  app,
}) => {
  const page = app.page;
  const templateId = 'tpl-e2e-lockdrag';
  await app.importVcg('lockdrag.vcg', await buildPositionedVcg(templateId));
  await app.selectStackRow(templateId);

  const picker = app.inspector;
  const x = picker.getByLabel('Position offset X');
  const y = picker.getByLabel('Position offset Y');

  /*
    ── THE POSITIVE CONTROL, FIRST, WHILE THE ROW IS OFF AIR ────────────────────────────────
    The gesture must be able to move this value, or every assertion below is vacuous.
  */
  const before = await x.inputValue();
  await dragBy(page, x, 60);
  const afterUnlocked = await x.inputValue();
  expect(
    afterUnlocked,
    'the drag gesture must MOVE an unlocked field, or the refusal below proves nothing',
  ).not.toBe(before);

  // Count what reaches the bridge from here on. A locked field must send nothing at all.
  await page.evaluate(() => {
    const w = window as unknown as {
      __setPositionCalls: unknown[];
      cg: { stack: { setPosition: (req: unknown) => Promise<{ ok: boolean }> } };
    };
    w.__setPositionCalls = [];
    const orig = w.cg.stack.setPosition.bind(w.cg.stack);
    w.cg.stack.setPosition = (req: unknown) => {
      w.__setPositionCalls.push(req);
      return orig(req);
    };
  });

  // ── TAKE IT ON AIR → the section locks ───────────────────────────────────────────────
  const row = app.stackRow(templateId).last();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });
  await expect(picker.getByText('locked while on air')).toBeVisible();
  await expect(x).toBeDisabled();
  await expect(y).toBeDisabled();

  // ── THE CLAIM ────────────────────────────────────────────────────────────────────────
  const lockedX = await x.inputValue();
  const lockedY = await y.inputValue();

  await dragBy(page, x, 80);
  expect(
    await x.inputValue(),
    'a locked X field must not move under a drag — the row is ON AIR',
  ).toBe(lockedX);

  await dragBy(page, y, -80);
  expect(
    await y.inputValue(),
    'a locked Y field must not move under a drag — the row is ON AIR',
  ).toBe(lockedY);

  // …and the ARROW KEYS, the gesture's twin, which shares the same guard.
  await x.focus({ timeout: 1000 }).catch(() => undefined); // a disabled input may refuse focus
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  expect(await x.inputValue(), 'a locked field must not step under the arrow keys').toBe(lockedX);

  // NOTHING REACHED THE BRIDGE.
  expect(
    await page.evaluate(
      () => (window as unknown as { __setPositionCalls: unknown[] }).__setPositionCalls,
    ),
    'a locked section must send no set-position at all',
  ).toEqual([]);
});
