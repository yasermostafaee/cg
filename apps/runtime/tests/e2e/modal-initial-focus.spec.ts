import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `B-230` — **WHERE FOCUS LANDS IN A DIALOG, SETTLED IN A REAL BROWSER.**
 *
 * `usePrompt` rendered its input with `autoFocus` and the field did not have focus. The
 * survey's diagnosis was "the primitive's focus-on-open defeats it", measured in jsdom —
 * which CANNOT settle it: React applies `autoFocus` during the commit and the primitive
 * focuses in an effect, and jsdom's scheduling does not model that ordering faithfully
 * enough to tell a lost race from a passive no-op. So the question came here.
 *
 * ── WHAT THE BROWSER SHOWED — MEASURED, not reasoned about ──────────────────
 *
 * Against the pre-fix build (`fface751~1`), driving the real lock-PIN dialog:
 *
 * | step                          | `document.activeElement` |
 * | ----------------------------- | ------------------------ |
 * | dialog opens                  | `BUTTON` — the ✕         |
 * | focus placed on the field BY HAND | `INPUT.cg-field`     |
 * | after ONE keystroke           | `BUTTON` — the ✕ again   |
 * | after TWO keystrokes          | `BUTTON` — the ✕         |
 *
 * So it is **not** a race at mount, which is what the jsdom-based diagnosis assumed. The
 * primitive's effect depended on `onClose`, which every caller passes as an INLINE ARROW —
 * a new identity on every render — so the effect tore down and set up again on EVERY COMMIT,
 * and its setup moves focus. `autoFocus` never had a chance, and tuning the attribute to win
 * the open-time race would have left the real defect untouched.
 *
 * 🔴 **AND THE SYMPTOM THE OPERATOR ACTUALLY GETS, which nobody had predicted: the PIN comes
 * out BACKWARDS.** Focus leaving and returning resets the caret of a controlled input to
 * position 0, so each character is inserted before the last. The probe typed `1` then `2`
 * and the field held **`21`** — an operator typing `1234` at the lock screen gets `4321`,
 * and his correct PIN is refused. That is measured, and it is why the second assertion below
 * checks the VALUE and not only the focus.
 *
 * The fix is structural — the trap arms ONCE (`useFocusTrap`, deps `[enabled]`) and the
 * dialog NOMINATES where focus lands (`data-modal-autofocus`), so there is exactly one
 * thing moving focus and no race to win. The dead `autoFocus` attribute is gone: an
 * attribute that reads as if it works is the same defect class as a correct comment above
 * incorrect code.
 *
 * ── THE SECOND ASSERTION IS THE ONE THAT WOULD HAVE CAUGHT IT ───────────────
 *
 * Landing focus correctly on open is easy to get right and easy to assert. KEEPING it
 * through a keystroke is what was broken, and a spec that only checked the first frame
 * would have passed against the bug.
 */

test('the PIN dialog focuses its field on open, and KEEPS it while the operator types', async ({
  app,
}) => {
  await app.goto();

  await app.page.getByRole('button', { name: /Lock/ }).click();
  const dialog = app.page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // §7 — the FIRST of the two PIN fields; this spec is about where focus lands and stays.
  const field = dialog.getByLabel(/^Lock PIN \(/);
  await expect(field).toBeVisible();

  // ── 1. focus LANDS on the field, not on the close affordance ──────────────
  await expect(field).toBeFocused();

  /*
    ── 2. focus SURVIVES typing, which is the assertion that goes red on the bug ──

    `pressSequentially` types one character at a time through real key events, so each one
    is its own commit. Under the defect the first character landed in the field, the effect
    re-ran, focus moved to the ✕, and every character after it was typed at a button — so
    the field would hold "1" and the operator would be pressing Escape without knowing it.
  */
  await field.pressSequentially('1234', { delay: 20 });
  await expect(field).toBeFocused();
  /*
    🔴 THE VALUE, IN ORDER, and this is the assertion with the sharpest teeth. Under the
    defect focus left the field after each character and came back with the caret reset to
    position 0, so the digits landed in REVERSE: an operator typing `1234` got `4321` and his
    correct PIN was refused. `toBeFocused` alone would not have caught that — `pressSequentially`
    re-focuses the locator per key, so focus reads correct at the end while the value is wrong.
  */
  await expect(field).toHaveValue('1234');

  // …and the dialog is still open: none of those keystrokes reached the ✕.
  await expect(dialog).toBeVisible();

  /*
    ── 3. THE NEGATIVE CONTROL: this check can fail ──────────────────────────

    `toBeFocused` on a page where nothing else is focusable would be a weak claim. Moving
    focus by hand and asserting the check NOTICES proves it has teeth — without this, an
    assertion that silently always passed would look exactly like the two above.
  */
  await dialog.getByRole('button', { name: 'Close' }).focus();
  await expect(field).not.toBeFocused();
});

/**
 * The dialog's Tab wrap, in a real focus engine.
 *
 * The jsdom spec asserts the MECHANISM (the handler prevents default and moves focus); only
 * a browser can assert the OUTCOME — that Tab from the last control cannot reach anything
 * behind the scrim. Same trap module as the lock screen's, so this covers both callers'
 * shared half.
 */
test('Tab cannot leave an open dialog', async ({ app }) => {
  await app.goto();
  await app.page.getByRole('button', { name: /Lock/ }).click();
  const dialog = app.page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Twenty presses is comfortably more than the dialog's control count, so a leak shows up
  // whatever order the browser walks them in.
  for (let i = 0; i < 20; i++) {
    await app.page.keyboard.press('Tab');
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, `focus escaped the dialog after ${String(i + 1)} Tab presses`).toBe(true);
  }
});
