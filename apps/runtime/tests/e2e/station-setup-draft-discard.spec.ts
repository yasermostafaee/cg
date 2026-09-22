import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `MODAL-TRUTH-01 · DELTA A` — **THE REAL LIFECYCLE: OPEN → EDIT → CLOSE WITHOUT SAVING →
 * REOPEN, IN THE ORDER A PERSON PERFORMS IT.**
 *
 * ── WHY THIS SPEC EXISTS AT ALL, WHICH IS THE POINT OF IT ───────────────────
 *
 * Part A shipped with a dom spec that toggled the dialog's `open` prop on one mounted
 * instance. That is the mechanism `App` uses, and it was red before the fix — but it is a
 * MODEL of the operator's sequence, not the sequence. It could not see what the owner saw,
 * because it never pressed the ✕: the dismissal used to raise a question, and backing out of
 * that question (Escape, or its `Cancel`) left Station setup open with the edit still in it.
 * The operator reads that as "I closed it without saving and my edit survived". A green test
 * over a live defect is the failure this whole prompt is named for, so the assertion moves to
 * the surface, over the real path, in a real browser.
 *
 * ── WHAT IT ASSERTS, AS THE OWNER WILL CHECK IT ─────────────────────────────
 *
 *   1. the field shows the value IN FORCE after a close-without-save and a reopen;
 *   2. the same on a second pane;
 *   3. no confirmation dialog appears at any point.
 *
 * ⚠ (3) is asserted at EVERY dismissal below, not once. It is the half that regresses
 * silently: a confirm re-added for one pane would leave (1) and (2) green.
 */

/** Dismiss with the primitive's ✕, and refuse to let any second dialog stand in the way. */
async function closeWithoutSaving(page: Page): Promise<void> {
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await setup.getByRole('button', { name: /close/i }).first().click();
  // (3) — measured at the moment of dismissal, when a question would be on screen.
  await expect(
    page.getByRole('dialog'),
    'a confirmation dialog appeared on the way out',
  ).toHaveCount(0);
  await expect(setup).toHaveCount(0);
}

async function reopenAt(page: Page, tab: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await expect(setup).toBeVisible();
  await setup.getByRole('tab', { name: tab }).click();
  return setup;
}

test('`MODAL-TRUTH-01 · DELTA A` — closing without saving discards, on two panes, with no question asked', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1280, height: 900 });

  // ── PANE 1: SERVERS, the pane the defect was reported on ──────────────────
  let setup = await reopenAt(page, 'Servers');
  const host = setup.locator('input[aria-label="Primary host"]');
  const applied = await host.inputValue();
  /*
    POSITIVE CONTROL: the edit has to be a real CHANGE, or "it shows the applied value"
    afterwards is satisfied by a field nobody touched.
  */
  expect(applied, 'the stub has no applied host to discard back to').not.toBe('');
  const edit = applied === '10.9.9.9' ? '10.9.9.8' : '10.9.9.9';

  await host.fill(edit);
  await expect(host).toHaveValue(edit);
  /*
    POSITIVE CONTROL 2: the dialog agrees that it is holding a draft — `Revert` appears only
    when there is something to revert, off the same dirty read the rail's dot uses. Without
    this, a fill that silently failed would leave the assertions below passing on a field
    nobody edited.
  */
  await expect(
    setup.getByRole('button', { name: 'Revert' }),
    'the dialog is not reporting the draft this spec is about',
  ).toHaveCount(1);

  await closeWithoutSaving(page);
  setup = await reopenAt(page, 'Servers');
  await expect(
    setup.locator('input[aria-label="Primary host"]'),
    'the unapplied host survived a close',
  ).toHaveValue(applied);

  // ── PANE 2: LAYERS, a section whose draft lives in its own component ──────
  await setup.getByRole('tab', { name: 'Layers' }).click();
  const rowName = setup.locator('input[aria-label^="Name for layer "]').first();
  await expect(rowName).toBeVisible();
  const appliedName = await rowName.inputValue();

  await rowName.fill('DISCARD-ME');
  await expect(rowName).toHaveValue('DISCARD-ME');

  await closeWithoutSaving(page);
  setup = await reopenAt(page, 'Layers');
  await expect(
    setup.locator('input[aria-label^="Name for layer "]').first(),
    'the unapplied row name survived a close',
  ).toHaveValue(appliedName);

  /*
    ⚠ The complement — "an APPLIED value is NOT discarded" — is deliberately NOT driven here.
    Applying a non-loopback host raises the LAN-exposure question (`server-settings.spec.ts`
    owns that flow), and pulling it in would make this spec's `toHaveCount(0)` on dialogs
    about a confirm that has nothing to do with dismissal. It is covered structurally instead:
    the discard restores FROM `loaded` — what the bridge last stated — so the value it puts
    back IS the applied one, which is what the two assertions above read.
  */
});
