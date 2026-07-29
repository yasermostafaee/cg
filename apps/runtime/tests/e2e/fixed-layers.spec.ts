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

  // Aliases AND layer numbers, both visible.
  await expect(app.layerRow(70)).toContainText('CLOCK');
  await expect(app.layerRow(70)).toContainText('layer 70');
  await expect(app.layerRow(71)).toContainText('LOWER THIRD');
  await expect(app.layerRow(73)).toContainText('layer 73');

  // Honest occupancy: unknown is explicit and NEVER reads as empty (B-094)…
  await expect(app.layerRow(73)).toContainText('no signal — occupancy unknown');
  await expect(app.layerRow(73)).not.toContainText('empty');
  // …while the genuinely-empty slot says so, and producers name their kind.
  await expect(app.layerRow(72)).toContainText('empty');
  await expect(app.layerRow(70)).toContainText('occupied — html producer');
  await expect(app.layerRow(71)).toContainText('occupied — ffmpeg producer');
});

test('the load gate is fail-closed: only an observably EMPTY row accepts a load', async ({
  app,
}) => {
  // The empty row is the one case where the load's adopt-CLEAR has nothing to
  // destroy — so it is the only one LOAD is offered on.
  await expect(app.layerRow(72).getByRole('button', { name: 'LOAD' })).toBeEnabled();

  // A foreign producer: someone's live video. Refused.
  await expect(app.layerRow(71).getByRole('button', { name: 'LOAD' })).toBeDisabled();

  // Unknown is NOT empty — silence is evidence of nothing, and this gate's
  // failure mode is a graphic leaving air (B-093/B-094, fail closed).
  await expect(app.layerRow(73).getByRole('button', { name: 'LOAD' })).toBeDisabled();

  // The shape is identical on every row — the buttons are present, just
  // disabled. This is the assertion that pins "the verb set never changes".
  for (const layer of [70, 71, 72, 73]) {
    const row = app.layerRow(layer);
    for (const verb of ['PLAY', 'NEXT', 'STOP', 'CLEAR']) {
      await expect(row.getByRole('button', { name: verb })).toBeVisible();
    }
  }
  // …and an UNBOUND row can drive none of them: there is no item to act on.
  for (const layer of [71, 72, 73]) {
    for (const verb of ['PLAY', 'NEXT', 'STOP', 'CLEAR']) {
      await expect(app.layerRow(layer).getByRole('button', { name: verb })).toBeDisabled();
    }
  }
});

test('CLEAR is confirm-gated and mirrored in the context menu; cancel does nothing', async ({
  app,
}) => {
  const page = app.page;
  const row = app.layerRow(70);

  // CLEAR destroys a LIVE producer, so it is offered only once the item is on
  // air — a loaded-but-not-taken item has nothing on the output to clear.
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeDisabled();
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
  // Cancel did nothing: still occupied, verb still offered.
  await expect(row).toContainText('occupied — html producer');
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeEnabled();

  // The button path: cancel first, then confirm.
  await row.getByRole('button', { name: 'CLEAR' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  await expect(row).toContainText('occupied — html producer');

  await row.getByRole('button', { name: 'CLEAR' }).click();
  await confirmClear.getByRole('button', { name: 'Clear layer', exact: true }).click();

  // The mock's stand-in for the next sweep: the slot settles to observed-empty
  // and the ROW SURVIVES — it is permanent, which is the whole point. C-012:
  // CLEAR kills the producer but leaves the TEMPLATE on the row, so the
  // operator can play it again without re-importing.
  await expect(row).toContainText('empty');
  await expect(row.getByRole('button', { name: 'CLEAR' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'PLAY' })).toBeEnabled();
  // The ffmpeg neighbour is untouched.
  await expect(app.layerRow(71)).toContainText('occupied — ffmpeg producer');
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
