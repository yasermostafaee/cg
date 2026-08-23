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

/**
 * `add-multibox-audio` — **AUDIO IS VISIBLE AND REACHABLE WITHOUT OPENING ANYTHING.**
 *
 * The defect: `StackItemState.plateVolumes` was on the wire and the only surface that read it
 * was a MODAL reachable from one row's action menu. So the console's answer to *"is this guest
 * audible?"* was **open a dialog and look** — for every row, one at a time — for the one
 * property of a graphic an operator cannot see by looking at a monitor.
 *
 * This drives the four verbs against the offline mock's e2e-armed ledger seed: `1-10` on
 * screen and `1-11` HELD, both belonging to the seeded news row. The bridge-side truth — the
 * wire footprint, the golden-rule-10 gate, the held-plate rule and retention — is
 * integration-tested in `tools/caspar-bridge/tests/live-plate-audio-verbs.integration.test.ts`;
 * what can only be proven HERE is that an operator can reach and read it.
 */
test('every seated plate carries its own audio strip, and ON / OFF / SOLO / PANIC are one press each', async ({
  app,
}) => {
  await app.liveSourcesTab.click();
  const onScreen = app.liveSourceRow('1-10');
  const held = app.liveSourceRow('1-11');

  // ── The strip is THERE, on every seated plate, with no dialog opened.
  const stripOf = (row: typeof onScreen, plate: string) =>
    row.locator(`[data-plate-audio="${plate}"]`);
  await expect(stripOf(onScreen, 'guest-1')).toBeVisible();
  await expect(stripOf(held, 'guest-2')).toBeVisible();

  // Every plate starts SILENT — the rule, visible rather than implied.
  await expect(stripOf(onScreen, 'guest-1')).toContainText('SILENT');
  await expect(stripOf(onScreen, 'guest-1')).toContainText('0%');

  // ── 🔴 NOTHING HERE IS A METER. There is no per-input level to draw until the plant walk
  //    answers W7/W8 — CasparCG's programme channel reports ONE peak pair for the whole
  //    channel — so a bar would claim "sound is present" from data that only says "we asked
  //    for it". That is the same mistake the PLACEHOLDER rule exists to prevent, one sense over.
  await expect(app.layers.locator('meter')).toHaveCount(0);
  await expect(app.layers.locator('progress')).toHaveCount(0);
  await expect(app.layers.getByRole('progressbar')).toHaveCount(0);

  // ── ON is ONE press, and it is FULL volume.
  await stripOf(onScreen, 'guest-1')
    .getByRole('button', { name: /^Full volume for guest-1/ })
    .click();
  await expect(stripOf(onScreen, 'guest-1')).toContainText('100%');
  await expect(stripOf(onScreen, 'guest-1')).toContainText('AUDIBLE');

  // …and the control says so on itself, so an operator does not discover it under pressure.
  await expect(
    stripOf(onScreen, 'guest-1').getByRole('button', { name: /not the previous level/ }),
  ).toBeVisible();

  // ── 🔴 A HELD PLATE READS ARMED-NOT-AUDIBLE, AND ITS CONTROLS STAY LIVE.
  //    Grey reads as disabled; arming a held plate's audio BEFORE switching to the look that
  //    shows it is the affordance the whole mute rule exists to preserve.
  const heldOn = stripOf(held, 'guest-2').getByRole('button', { name: /^Full volume for guest-2/ });
  await expect(heldOn).toBeEnabled();
  await heldOn.click();
  await expect(stripOf(held, 'guest-2')).toContainText('ARMED');
  await expect(stripOf(held, 'guest-2')).toContainText('HIDDEN BY THIS LOOK');
  // …and it is NOT claimed to be audible, because the look is what decides that.
  await expect(stripOf(held, 'guest-2')).not.toContainText('AUDIBLE');

  // ── SOLO raises one and silences its siblings, in one press and with no restore offered.
  await stripOf(onScreen, 'guest-1')
    .getByRole('button', { name: /^Solo guest-1/ })
    .click();
  await expect(stripOf(onScreen, 'guest-1')).toContainText('100%');
  await expect(stripOf(held, 'guest-2')).toContainText('0%');
  /*
    ⚠ Asserted on the buttons' VISIBLE TEXT, not on their accessible names — and the first
    version of this line was wrong in a way worth recording. `getByRole('button', {name:
    /restore/i})` matched the SOLO buttons themselves, whose accessible name ends *"with no
    restore"*: the control that promises there is no un-solo is the one a search for an un-solo
    finds. The claim is about what the strip OFFERS, so read the labels.
  */
  const stripLabels = await app.layers.locator('[data-plate-audio] button').allTextContents();
  expect(stripLabels.some((l) => /un-?solo|restore|undo/i.test(l))).toBe(false);

  // 🔴 THE ROW'S OWN READ-ONLY SUMMARY, outside the six-column verb block — `VERB_COUNT`
  // stays 6, so every sticky header word still sits above its own glyph.
  //
  // Read HERE, before the panic, and on a row that has not been PLAYed: the summary counts
  // SEATED plates, not on-air ones, and reading it after the panic would only ever see zeros.
  //
  // 🔴 `B-164` — `1/1`, NOT `1/2`, AND THIS SPEC IS WHERE THE DEFECT WAS WRITTEN DOWN.
  //
  // `guest-2` is HELD — the assertions twenty lines up prove it, and prove the console refuses
  // to call it AUDIBLE on the strip. The chip nonetheless counted it in the denominator,
  // because it counted SEATS while the strip beside it counted what the look SHOWS. Two
  // definitions of "has sound" on one screen, and this line is the one that encoded the wrong
  // one as expected behaviour.
  //
  // The denominator is now the plates the ACTIVE LOOK SHOWS: `guest-1` alone. `guest-2` was
  // silenced by the SOLO above, so it is held-and-NOT-armed and contributes no `· N armed`
  // clause either — the armed-and-waiting case is covered in the unit suite, where a held
  // plate can be left raised.
  await app.page.getByRole('tab', { name: /^LAYERS/ }).click();
  const newsRow = app.layers.locator('[data-item-id="item-irib-news"]');
  await expect(newsRow.locator('[data-audio-summary]')).toHaveText('audio 1/1');
  await expect(newsRow.locator('[data-verb-block] button')).toHaveCount(6);

  /*
    ── 🔴 PANIC REACHES A ROW THAT HOLDS SEATS WITHOUT READING ON AIR ────────────────────

    THIS ASSERTION WAS INVERTED, and the inversion is the whole point. It used to press PANIC
    on this `loaded` row and expect the refusal *"no row is on air"* — PANIC was scoped in the
    BROWSER from `isOnAir`, so a row holding seated, potentially AUDIBLE plates while not
    reading on air was never silenced. That is `B-122`'s shape one verb along: an emergency
    control gated on exactly the values that may be wrong in the emergency.

    `stack.silence-all-live-plates` now takes NO ARGUMENTS and the BRIDGE scopes it from its
    own ledger, so the seated-off-air row IS reached. The old expectation encoded the defect,
    which is why it is replaced rather than relaxed: this version FAILS if a status filter is
    ever reintroduced on the caller's side, which the old one could not detect.

    B-122's rule is untouched and still covered — a no-op is never a success. That arm is
    "Nothing was sent — the bridge holds no live plates", asserted in the unit suite where an
    empty ledger can actually be arranged.
  */
  await app.liveSourcesTab.click();
  const panic = app.layers.getByRole('button', { name: /^Silence all boxes/ });
  await expect(panic).toBeEnabled();
  await panic.click();
  await expect(app.success).toContainText('Silenced 2 plate(s)');
  await expect(stripOf(onScreen, 'guest-1')).toContainText('0%');
  await expect(stripOf(held, 'guest-2')).toContainText('0%');

  // …and the row's own summary follows the plates it counts. `B-164` — the denominator stays
  // the SHOWN plate; PANIC silences, it does not change which look is up.
  await app.page.getByRole('tab', { name: /^LAYERS/ }).click();
  await expect(newsRow.locator('[data-audio-summary]')).toHaveText('audio 0/1');

  // ── ON AIR, the same one press still works. Not a duplicate of the above: it is the case
  //    the OLD rule allowed, kept so removing the status filter cannot have broken it.
  await newsRow.getByRole('button', { name: 'PLAY' }).click();
  await app.liveSourcesTab.click();
  await stripOf(onScreen, 'guest-1')
    .getByRole('button', { name: /^Full volume for guest-1/ })
    .click();
  await expect(stripOf(onScreen, 'guest-1')).toContainText('100%');
  await app.layers.getByRole('button', { name: /^Silence all boxes/ }).click();
  await expect(app.success).toContainText('Silenced 2 plate(s)');
  await expect(stripOf(onScreen, 'guest-1')).toContainText('0%');
  await expect(stripOf(held, 'guest-2')).toContainText('0%');
});
