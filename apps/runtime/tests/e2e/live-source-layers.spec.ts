import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 **`B-145` acceptance 1, DISPLAY half (`multibox-layout-switch` `tasks.md` 2.8) —
 * the seated live layers are VISIBLE, and distinguishable from the station's.**
 *
 * Acceptance 1 reads *"those layers appear in the layer list and are controllable"*.
 * The control half held from the day persistence landed — the ledger is keyed by
 * `itemId` and every teardown/repoint door reads it by that key — but nothing
 * DISPLAYED the seated layers as layers, so a guest's face could be composited on air
 * with no surface naming the layer it was on. `B-145` went back to `[~]` for that.
 *
 * This spec drives the surface that closes it, against the offline MockRuntime's
 * e2e-armed ledger seed. The bridge-side truth — the projection, the push, the boot
 * adoption and the vanished-producer drop — is integration-tested in
 * `tools/caspar-bridge/tests/live-layers-wire.test.ts`; what can only be proven HERE
 * is that an operator can actually reach and read it.
 */

test('the bridge-seated live layers appear on their own tab, distinguishable from the station layers, and open the row that owns them', async ({
  app,
}) => {
  // ── The tab exists, and it is a THIRD surface — not more rows in either of the two
  //    that were already there. The three declared layer classes each make a different
  //    claim about who owns a layer; folding these into STATION LAYERS would have every
  //    row arrive carrying the opposite one, under a clear gated on a producer kind a
  //    live plate can never have.
  await expect(app.liveSourcesTab).toBeVisible();
  await expect(app.playoutTab).toBeVisible();

  await app.liveSourcesTab.click();

  // ── 4.1 — the seated layers APPEAR. This is the whole defect, inverted: before this
  //    surface both of these were lit with nothing anywhere naming them.
  const onScreen = app.liveSourceRow('1-10');
  const held = app.liveSourceRow('1-11');
  await expect(onScreen).toBeVisible();
  await expect(held).toBeVisible();

  // The row says WHAT is on the layer — the symbolic plate and the producer actually
  // sent — not what a since-edited mapping now claims it should be.
  await expect(onScreen).toContainText('guest-1');
  await expect(onScreen).toContainText('route://1-1');

  // ── §12.4 — a HELD plate reads as held, never as on screen. A list showing a held
  //    plate as visible would tell the operator a guest is on air who is not.
  await expect(onScreen).toContainText('On screen');
  await expect(held).toContainText('Held');
  await expect(held).not.toContainText('On screen');

  // ── THE GATE. Both layers have a row on the stack, so NEITHER offers a destructive
  //    control here. The verbs for a seated plate belong to its row, and `layers.clear`
  //    refuses a live-source coordinate by name after explicitly rejecting an exemption
  //    — offering one here would re-open that refusal from a second surface.
  await expect(onScreen.getByRole('button', { name: /^Release/ })).toHaveCount(0);
  await expect(held.getByRole('button', { name: /^Release/ })).toHaveCount(0);
  await expect(onScreen).toHaveAttribute('data-live-layer-stranded', 'false');

  // ── …and instead it NAMES the owner and takes the operator to it. That is the display
  //    half's real job: make the control that already existed reachable.
  // The owner is named with the TEMPLATE label the operator already reads in the row’s
  // own template column — the starter pack’s Persian-first label, joined through the same
  // index the table uses, rather than a raw id.
  await expect(onScreen).toContainText('Seated for');
  await expect(onScreen).toContainText('News Composite');
  await onScreen.getByRole('button', { name: /^Open the row that owns/ }).click();

  // OPEN ROW means open the row: the list the row lives on is what comes back, with the
  // item selected, so the verbs are in front of the operator rather than one more click
  // away on a tab they have to remember to change.
  await expect(app.liveSourcesTab).toHaveAttribute('aria-selected', 'false');
  await expect(app.page.getByRole('tab', { name: /^LAYERS/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
