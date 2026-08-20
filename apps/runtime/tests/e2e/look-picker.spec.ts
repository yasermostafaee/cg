import { test, expect } from './fixtures/runtime.js';

/**
 * ⭐ **§14.5 / `tasks.md` 7.1–7.2 (LOOKS Stage E) — THE FEATURE THE CLIENT ASKED FOR.**
 *
 * An operator changes a running row's look on air, from the row, in one action. This spec
 * walks exactly the check the owner is given in the handoff, so the thing that is
 * demonstrated and the thing that is tested are the same walk.
 *
 * The wire — that a switch moves producers and tells the page — is proven in
 * `tools/caspar-bridge/tests/look-picker-operator.integration.test.ts`. What only this can
 * prove is that the control is REACHABLE and READS correctly on the operator's surface.
 */

test('the look picker is on the row, shows what is live, and switches in one action', async ({
  app,
}) => {
  const row = app.fixedRow(89);
  await expect(row).toBeVisible();

  // ── 1. THE PICKER IS THERE, always, on a row whose template authors looks ──────
  const picker = row.locator('[data-look-picker]');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('LOOK');

  // ── …and it IS the readout: exactly one segment marked, the authored default ───
  const seg = (id: string) => row.locator(`[data-look-id="${id}"]`);
  await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
  await expect(seg('right')).toHaveAttribute('aria-pressed', 'false');
  await expect(seg('all')).toHaveAttribute('aria-pressed', 'false');

  // ── 2. ONE ACTION SWITCHES, and the readout follows the bridge ─────────────────
  await seg('right').click();
  await expect(seg('right')).toHaveAttribute('aria-pressed', 'true');
  await expect(seg('left')).toHaveAttribute('aria-pressed', 'false');

  // ── 4. SWITCHING BACK restores the first look with no other operator action ────
  await seg('left').click();
  await expect(seg('left')).toHaveAttribute('aria-pressed', 'true');
});

test('the picker sits OUTSIDE the verb block and leaves the six-verb grid alone', async ({
  app,
}) => {
  /*
    §2b / `tasks.md` 7.2 — the invariant with a recorded on-air failure behind it. The
    SHAPE RULE governs the verb block; the picker is not in it. What must not move is the
    COLUMN model: `VERB_COUNT = 6` drives the header's word row and the row's button row
    from ONE `gridTemplateColumns` call, and the last time a control was added without
    updating it, every header word from NEXT rightward sat above the wrong glyph.
  */
  const row = app.fixedRow(89);
  const picker = row.locator('[data-look-picker]');

  // The picker spans every column, so it adds none.
  await expect(picker).toHaveCSS('grid-column-start', '1');
  await expect(picker).toHaveCSS('grid-column-end', '-1');

  // …and the row still carries its full verb block. A picker that had become a COLUMN
  // would have pushed one of these out of the grid.
  const verbs = row.getByRole('button').filter({ hasNotText: /^[123]$/ });
  expect(await verbs.count()).toBeGreaterThanOrEqual(6);
});

test('a row whose template authors NO looks has no picker at all', async ({ app }) => {
  /*
    The absent-vs-empty rule, on the surface. Row 70 carries a starter template with no
    look group, so it must show no picker — and it must NOT be refused anything either.
    A picker on every row would be the shape rule misapplied to a control it does not
    govern; no picker here is the whole point of the distinction.
  */
  const row = app.fixedRow(70);
  await expect(row).toBeVisible();
  await expect(row.locator('[data-look-picker]')).toHaveCount(0);
});
