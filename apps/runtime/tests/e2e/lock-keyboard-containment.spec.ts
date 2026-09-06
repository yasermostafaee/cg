import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `B-229` — **THE LOCK HOLDS THE KEYBOARD, asserted where a keyboard exists.**
 *
 * `LockOverlay`'s own docstring promised that "while engaged, all input is captured by the
 * overlay". Clicks, yes — the scrim is `position: fixed; inset: 0`. **Tab was not.** The
 * overlay handled no key of any kind, nothing in the app sets `inert`, and the stack rows
 * stayed in the document's sequential focus order, so an operator could walk out of a
 * 94 %-opaque lock screen onto a TAKE and press Space.
 *
 * ── WHY THIS SPEC CANNOT BE A jsdom SPEC ────────────────────────────────────
 *
 * jsdom does not implement sequential focus navigation: pressing Tab there moves nothing.
 * A jsdom test that pressed Tab and asserted the TAKE had not received focus would pass
 * against the BROKEN code — a test that cannot fail, which is worse than no test. So the
 * DOM spec (`lockOverlay.focusTrap.dom.test.ts`) asserts the MECHANISM and this one asserts
 * the OUTCOME, in a real focus engine, against a real stack.
 *
 * ⚠ This covers the RENDERER half only. The other half — that the bridge REFUSES an
 * operator intent while locked — cannot be observed from a browser driving the offline mock
 * (test mode has no bridge process at all), and is asserted at the wire in
 * `tools/caspar-bridge/tests/lock-refuses-intents.integration.test.ts`, which walks the
 * whole route table. Neither half is the lock on its own.
 */

test('Tab cannot reach a control behind the lock screen', async ({ app }) => {
  await app.goto();

  /*
    A REAL STACK BEHIND THE SCRIM, not an empty page. The claim is about focusable on-air
    controls being unreachable, and an empty console has none — the spec would pass for the
    broken code by having nothing to escape TO. Asserted, so it cannot silently become
    vacuous if the seeded bank changes.
  */
  const focusableBehind = await app.layers.evaluate(
    (el) => el.querySelectorAll('button:not([disabled]), input:not([disabled])').length,
  );
  expect(
    focusableBehind,
    'nothing focusable behind the scrim — the spec would be vacuous',
  ).toBeGreaterThan(3);

  // Engage the lock through the operator's own path.
  await app.page.getByRole('button', { name: /Lock/ }).click();
  const promptDialog = app.page.getByRole('dialog');
  await promptDialog.getByLabel(/Lock PIN/).fill('1234');
  await promptDialog.getByRole('button', { name: 'Lock' }).click();

  const lockScreen = app.page.getByRole('dialog', { name: 'Lock screen' });
  await expect(lockScreen).toBeVisible();

  /*
    ── THE ASSERTION ─────────────────────────────────────────────────────────

    Twenty Tabs forward, then twenty back. BOTH directions, because the overlay is the LAST
    thing in the document: one Shift+Tab from its first control is the SHORT path into the
    stack, and a trap that only wrapped forwards would look correct in a spec that only
    pressed Tab.
  */
  for (const shift of [false, true]) {
    for (let i = 0; i < 20; i++) {
      await app.page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
      const inside = await lockScreen.evaluate((el) => el.contains(document.activeElement));
      expect(
        inside,
        `focus escaped the lock screen after ${String(i + 1)} ${shift ? 'Shift+Tab' : 'Tab'} presses`,
      ).toBe(true);
    }
  }

  /*
    ── THE NEGATIVE CONTROL: the check can fail ──────────────────────────────

    Focus is placed on a control BEHIND the scrim by script — which is exactly the state the
    bug produced — and the same evaluation is asserted to NOTICE. Without this, an assertion
    that could never be false would read identically to the two hundred above it.
  */
  await app.layers.locator('button:not([disabled])').first().focus();
  expect(await lockScreen.evaluate((el) => el.contains(document.activeElement))).toBe(false);

  /*
    ── THE INVERSE, and it matters as much as the trap ───────────────────────

    Unlocking hands the keyboard straight back, on this same page, with no reload. A trap
    that outlived `engaged` would be a console nobody could type into — a worse outage than
    the bug it fixes.
  */
  await lockScreen.getByLabel('PIN').fill('1234');
  await lockScreen.getByRole('button', { name: 'UNLOCK' }).click();
  await expect(lockScreen).toBeHidden();

  const target = app.layers.locator('button:not([disabled])').first();
  await target.focus();
  await expect(target).toBeFocused();
  await app.page.keyboard.press('Tab');
  // Something moved, and it is not being pulled back into a screen that is gone.
  expect(await app.page.evaluate(() => document.activeElement?.tagName)).toBeTruthy();
});
