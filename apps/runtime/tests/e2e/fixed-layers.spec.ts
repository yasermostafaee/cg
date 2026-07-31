import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * R-021 → R-028 part B — the declared-layer rows, driven against the offline
 * MockRuntime's CG_E2E_FIXED_BANK seed (channel 1, layers 70–87; 70–73 are the
 * four display cases html / ffmpeg / empty / unknown). The bridge-side truth —
 * real OSC tap + sweep + the exact-slot load — is integration-tested in
 * tools/caspar-bridge.
 *
 * WHAT CHANGED, AND WHY THE ASSERTIONS MOVED. R-028 part B deliberately
 * replaced the surface these scenarios were written against, so the spec had to
 * follow it:
 *
 *  - The Library and Stack panels are DELETED and merged into this one list, so
 *    "is it in the library?" is now read from the picker dialog and "is it on
 *    the stack?" is read from the row itself.
 *  - `IMPORT + LOAD` and `LOAD…` collapsed into ONE `LOAD` (import and load are
 *    a single operator action now), which flips to `REMOVE` once the row is
 *    filled. The already-imported path moved to the row's context menu.
 *  - **The verb set never changes shape.** R-021 stage 2b rendered NO buttons on
 *    a row that could not act; part B renders the SAME buttons on every row and
 *    disables the ones that cannot act. Controls that appear and vanish move
 *    under the operator's hand, which is the one thing a playout surface may not
 *    do. So the old `getByRole('button')).toHaveCount(0)` assertions are now
 *    `toBeDisabled()` — the coverage is the same claim (this row cannot act),
 *    stated against the surface that shipped.
 */

test('no declared bank means no rows at all', async ({ app }) => {
  // The bank is armed for every spec (the rows ARE the operator surface), so
  // idle-quiet is asserted by explicitly disarming it and re-booting.
  await app.page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = false;
  });
  await app.page.reload();
  await expect(app.layers).toBeVisible();
  await expect(app.layers.locator('[data-layer]')).toHaveCount(0);
});

test('a seeded bank renders permanent rows with aliases and honest occupancy', async ({ app }) => {
  await expect(app.layers.locator('[data-layer]')).toHaveCount(18);

  // The ALIAS is the row's primary label.
  await expect(app.layerRow(70)).toContainText('CLOCK');
  await expect(app.layerRow(71)).toContainText('LOWER THIRD');

  /*
    The REAL CasparCG layer number is no longer a COLUMN — the owner took it off the
    row. What keeps that safe is asserted here: the row carries it in its own tooltip
    and accessible name, so it is one hover or one keyboard focus away at every
    density. It must not become reachable ONLY from the Inspector, which on a narrow
    screen is an overlay behind a hamburger — i.e. hidden exactly while somebody is
    troubleshooting, and the layer number is the vocabulary shared with the playout
    side (the reservation is 60–69, not "rows 1–4").
  */
  for (const layer of [70, 73]) {
    const { title, ariaLabel } = await app.layerNumberReachableOn(layer);
    expect(title).toContain(`CasparCG layer 1-${String(layer)}`);
    expect(ariaLabel).toContain(`CasparCG layer 1-${String(layer)}`);
  }

  // Honest occupancy: unknown is explicit and NEVER reads as empty (B-094).
  //
  // Read from the STATE cell, not the Description column: the column is the first
  // one the table drops as the panel narrows, so a visible-text assertion on it
  // would only hold at the widest density and would say nothing about what the
  // operator can see at 1280px. The state's LABEL is always visible and its
  // tooltip always carries CasparCG's report verbatim, so both are checked.
  // REVERSED: AN UNBOUND ROW READS `EMPTY`, WHATEVER THE WIRE SAYS.
  //
  // We have never put anything on those layers, so there is nothing to ask
  // CasparCG about, and a question mark carrying no information is noise rather
  // than caution — four of eight rows read UNKNOWN while the one row that
  // warranted attention was lost among them.
  //
  // B-094 is NOT weakened: its rule is that `unknown` must never read as `empty`
  // for a layer we have reason to ask about. It forbids forgetting something we
  // knew, not saying "nothing here" when we genuinely have nothing. The word goes
  // on doing its work for a BOUND row that cannot be confirmed — asserted below.
  for (const layer of [71, 72, 73]) {
    await expect(app.layerState(layer)).toHaveText('EMPTY');
  }
});

test('LOAD is offered on every unbound row — it touches no layer', async ({ app }) => {
  // REVERSED: LOAD is offered on EVERY unbound row, whatever the wire says.
  //
  // The gate existed because the load chain adopt-CLEARed the layer before its
  // CG ADD, so a row carrying an unclaimed graphic had to refuse. LOAD emits
  // ZERO AMCP now — it binds a template to OUR list and touches no layer — so
  // there is nothing to destroy and nothing to fail closed about. PLAY is the
  // only path to a layer and is where that care lives.
  //
  // This is also the owner's report: with CasparCG unreachable every row reads
  // 'unknown', so the old gate dimmed LOAD exactly when the rundown is built.
  for (const layer of [71, 72, 73]) {
    await expect(app.layerRow(layer).getByRole('button', { name: 'LOAD' })).toBeEnabled();
  }

  // The shape is identical on every row — the buttons are present, just
  // disabled. This is the assertion that pins "the verb set never changes".
  for (const layer of [70, 71, 72, 73]) {
    const row = app.layerRow(layer);
    for (const verb of ['PLAY', 'NEXT', 'STOP', 'CLEAR']) {
      await expect(row.getByRole('button', { name: verb })).toBeVisible();
    }
  }
  // …and an UNBOUND row can drive none of the ITEM-scoped verbs: there is no item to
  // act on.
  for (const layer of [71, 72, 73]) {
    for (const verb of ['PLAY', 'NEXT', 'STOP']) {
      await expect(app.layerRow(layer).getByRole('button', { name: verb })).toBeDisabled();
    }
  }

  // CLEAR IS THE EXCEPTION, and this assertion was flipped deliberately — it is the
  // requirement, not a relaxation.
  //
  // It used to be disabled here for a sound reason: `stack.out` is ITEM-scoped, so with
  // nothing bound an enabled CLEAR would have been a no-op that REPORTED SUCCESS —
  // worse than a disabled control, because it looks like it worked. The answer was
  // never to enable the button; it was the missing capability, which now exists. An
  // unbound row routes to the BANK-SCOPED layer clear, addressed to the LAYER and
  // permitted by STRUCTURE (in the declared bank AND not reserved) rather than by
  // observation — so it does something real, and it works precisely when occupancy
  // reads `unknown`, which is row 73 here.
  //
  // That is the whole point of the owner's rule that CLEAR is always available: a
  // graphic must be removable even when the console cannot say what is on the layer.
  for (const layer of [71, 72, 73]) {
    await expect(app.layerRow(layer).getByRole('button', { name: 'CLEAR' })).toBeEnabled();
  }
});

test('CLEAR is confirm-gated and mirrored in the context menu; cancel does nothing', async ({
  app,
}) => {
  const page = app.page;
  const row = app.layerRow(70);

  /*
    CLEAR is available on a BOUND row before it is ever taken, and stays available
    after — owner decision, and a deliberate departure from the fail-closed rule the
    other verbs follow.

    The asymmetry is the point: refusing LOAD when the state model is uncertain is
    safe, because nothing happens. Refusing CLEAR strands a graphic on air with
    nothing to remove it. The status is exactly what might be WRONG in that
    situation, so it may not be what withholds the remedy.

    (It stays disabled on a genuinely UNBOUND row — asserted in the load-gate test
    above — because with no item there is nothing for `stack.out` to address, and a
    button that no-ops while reporting success is worse than a disabled one.)
  */
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeEnabled();
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeEnabled();

  const confirmClear = page.getByRole('dialog', { name: /^Clear / });

  // The context menu MIRRORS the button (same declaration, same confirm gate).
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /actions$/ });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'CLEAR' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  // Cancel did nothing: still occupied, verb still offered. Read through the state
  // cell's tooltip — see the occupancy note in the seeded-bank spec above.
  await expect(app.layerState(70)).toHaveAttribute('title', /occupied — html producer/);
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeEnabled();

  // The button path: cancel first, then confirm.
  await row.getByRole('button', { name: 'CLEAR' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  await expect(app.layerState(70)).toHaveAttribute('title', /occupied — html producer/);

  await row.getByRole('button', { name: 'CLEAR' }).click();
  await confirmClear.getByRole('button', { name: 'Clear layer', exact: true }).click();

  // The mock's stand-in for the next sweep: the slot settles to observed-empty
  // and the ROW SURVIVES — it is permanent, which is the whole point. C-012:
  // CLEAR kills the producer but leaves the TEMPLATE on the row, so the
  // operator can play it again without re-importing.
  await expect(app.layerState(70)).toHaveAttribute('title', /reports: empty/);
  await expect(row.getByRole('button', { name: 'PLAY' })).toBeEnabled();
  // CLEAR stays ENABLED after a successful clear, because the item is still BOUND to
  // the row — the producer is gone but the template is not. Pressing it again is a
  // harmless re-send, and that is the trade the escape hatch makes deliberately: the
  // alternative is trusting the state model to decide when the remedy is allowed,
  // which is the trust that strands a graphic when the model is wrong.
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeEnabled();
  // The unbound ffmpeg neighbour is untouched — and reads EMPTY, because no
  // template of ours is bound to it (see the occupancy test above).
  await expect(app.layerState(71)).toHaveText('EMPTY');
});

test('import+load lands on the EXACT row, and the template stays in the library', async ({
  app,
}) => {
  const before = await app.templateCount();

  // ONE operator action on the row they chose: press LOAD, hand it a `.vcg`,
  // and the whole chain runs — import, register, bind to THIS layer.
  await app.importVcg('clock.vcg', await buildValidVcg('tpl-fixed-e2e'), 74);

  // 1. The created item is bound to THIS row's layer — the one assertion this
  //    whole task exists for. The row names it; no other row does.
  await expect(app.layerRow(74)).toContainText('clock');

  // 2. The template went into the SHARED library — and STAYS there for reuse.
  await expect.poll(() => app.templateCount()).toBe(before + 1);
  await expect(app.layers.locator('[data-template-id="tpl-fixed-e2e"]')).toHaveCount(1);

  // 3. A filled row offers REMOVE, not LOAD: rebinding is Remove-then-load,
  //    never one compound action that hides a destructive step.
  await expect(app.layerRow(74).getByRole('button', { name: 'REMOVE' })).toBeVisible();
  await expect(app.layerRow(74).getByRole('button', { name: 'LOAD' })).toHaveCount(0);
});

test('Load-from-library binds the same exact row, without a second import', async ({ app }) => {
  await app.importVcg('lower-third.vcg', await buildValidVcg('tpl-lib-e2e'), 74);
  await expect(app.layerRow(74)).toContainText('lower third');
  const librarySize = await app.templateCount();

  await app.loadTemplate('tpl-lib-e2e', 75);

  // The row is headed by the FILE the operator imported, humanised — never the
  // raw id and never the scene's internal name.
  await expect(app.layerRow(75)).toContainText('lower third');
  // Nothing was imported — the library is exactly as it was.
  await expect.poll(() => app.templateCount()).toBe(librarySize);
});
