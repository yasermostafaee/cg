import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * R-021 — the fixed-bank panel, driven against the offline MockRuntime with
 * the CG_E2E_FIXED_BANK seed (channel 1, layers 70–73: html / ffmpeg / empty /
 * unknown — the bridge-side truth, real OSC tap + sweep + the exact-slot load,
 * is integration-tested in tools/caspar-bridge).
 *
 * Stage 2b: rows render with aliases and layer numbers; unknown occupancy
 * reads as unknown and never as empty; the observed-html row's CLEAR is
 * confirm-gated and mirrored in the context menu; non-html and unknown offer
 * NO verb until stage 4's 4.3 (per D1).
 *
 * Stage 3 (task 5.3, the E2E D7 deferred to here): the observed-EMPTY row's
 * one-action chain — pick a `.vcg` → it appears in the shared library → an
 * item bound to THAT row's exact layer.
 */

test('idle-quiet without a bank; a seeded bank renders permanent rows with aliases and honest occupancy', async ({
  app,
}) => {
  const page = app.page;

  // Idle-quiet first: the default boot declares no bank — the panel does not exist.
  await expect(app.fixedPanel).toHaveCount(0);

  // Re-boot with the seeded bank (init scripts apply on the next navigation).
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
  });
  await page.reload();

  await expect(app.fixedPanel).toBeVisible();
  await expect(app.fixedPanel.locator('[data-layer]')).toHaveCount(4);

  // Aliases AND layer numbers, both visible.
  await expect(app.fixedRow(70)).toContainText('CLOCK');
  await expect(app.fixedRow(70)).toContainText('layer 70');
  await expect(app.fixedRow(71)).toContainText('LOWER THIRD');
  await expect(app.fixedRow(73)).toContainText('layer 73');

  // Honest occupancy: unknown is explicit and NEVER reads as empty (B-094)…
  await expect(app.fixedRow(73)).toContainText('no signal — occupancy unknown');
  await expect(app.fixedRow(73)).not.toContainText('empty');
  // …while the genuinely-empty slot says so, and producers name their kind.
  await expect(app.fixedRow(72)).toContainText('empty');
  await expect(app.fixedRow(70)).toContainText('occupied — html producer');
  await expect(app.fixedRow(71)).toContainText('occupied — ffmpeg producer');

  // The verb split: html → CLEAR, empty → the stage-3 chain, and NOTHING for
  // non-html / unknown (D1 — until task 4.3).
  await expect(app.fixedRow(70).getByRole('button', { name: 'CLEAR' })).toBeVisible();
  await expect(app.fixedRow(71).getByRole('button')).toHaveCount(0);
  await expect(app.fixedRow(72).getByRole('button', { name: 'IMPORT + LOAD' })).toBeVisible();
  await expect(app.fixedRow(72).getByRole('button', { name: 'LOAD…' })).toBeVisible();
  await expect(app.fixedRow(73).getByRole('button')).toHaveCount(0);
});

test('the html row’s Clear is confirm-gated and mirrored in the context menu; cancel does nothing', async ({
  app,
}) => {
  const page = app.page;
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
  });
  await page.reload();
  await expect(app.fixedPanel).toBeVisible();

  const confirmClear = page.getByRole('dialog', { name: 'Clear layer 1-70?' });

  // The context menu MIRRORS the button (same declaration, same confirm gate).
  await app.fixedRow(70).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'CLOCK actions' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'CLEAR' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  // Cancel did nothing: still occupied, verb still offered.
  await expect(app.fixedRow(70)).toContainText('occupied — html producer');

  // A verb-less row opens NO menu — the affordance is absent, not disabled.
  await app.fixedRow(71).click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);

  // The button path: confirm-gated; cancel first, then confirm.
  await app.fixedRow(70).getByRole('button', { name: 'CLEAR' }).click();
  await expect(confirmClear).toBeVisible();
  await confirmClear.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmClear).toHaveCount(0);
  await expect(app.fixedRow(70)).toContainText('occupied — html producer');

  await app.fixedRow(70).getByRole('button', { name: 'CLEAR' }).click();
  await confirmClear.getByRole('button', { name: 'Clear layer', exact: true }).click();

  // The mock's stand-in for the next sweep: the slot settles to observed-empty,
  // the ROW SURVIVES (it is permanent — that is the whole point), and CLEAR
  // disappears with the producer. What the now-empty row offers instead is
  // stage 3's chain — the operator can put something back on the layer they
  // just cleared, which is the whole shape of the feature.
  await expect(app.fixedRow(70)).toContainText('empty');
  await expect(app.fixedRow(70).getByRole('button', { name: 'CLEAR' })).toHaveCount(0);
  await expect(app.fixedRow(70).getByRole('button', { name: 'IMPORT + LOAD' })).toBeVisible();
  // The ffmpeg neighbour is untouched.
  await expect(app.fixedRow(71)).toContainText('occupied — ffmpeg producer');
});

test('R-021 stage 3 — import+load lands on the EXACT slot, and the template stays in the library', async ({
  app,
}) => {
  const page = app.page;
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
  });
  await page.reload();
  await expect(app.fixedPanel).toBeVisible();

  // The chain starts on the OBSERVED-EMPTY row — layer 72 — because that is the
  // one case where the load's adopt-CLEAR has nothing to destroy.
  const emptyRow = app.fixedRow(72);
  await expect(emptyRow).toContainText('empty');
  const librarySizeBefore = await app.loadButtons().count();

  // ONE operator action: press it, hand it a .vcg, and the whole chain runs.
  const chooser = page.waitForEvent('filechooser');
  await emptyRow.getByRole('button', { name: 'IMPORT + LOAD' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'clock.vcg',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await buildValidVcg('tpl-fixed-e2e')),
  });

  // 1. The template went into the SHARED library — and STAYS there for reuse.
  await expect(app.templateRow('tpl-fixed-e2e')).toBeVisible();
  await expect(app.loadButtons()).toHaveCount(librarySizeBefore + 1);

  // 2. The created item is bound to THIS row's layer — the one assertion this
  //    whole task exists for. The row names it; no other row does.
  await expect(emptyRow).toContainText('bound: lower-third');
  for (const layer of [70, 71, 73]) {
    await expect(app.fixedRow(layer)).not.toContainText('bound:');
  }

  // 3. …and it is an ORDINARY stack item, on the stack, addressable as usual.
  await expect(app.stackRow('tpl-fixed-e2e')).toHaveCount(1);

  // 4. A bound row offers no chain — rebinding is Remove-then-load (d1), never
  //    one compound action.
  await expect(emptyRow.getByRole('button')).toHaveCount(0);
});

test('R-021 stage 3 — Load-from-library binds the same exact slot, without a second import', async ({
  app,
}) => {
  const page = app.page;
  await page.addInitScript(() => {
    (window as unknown as { CG_E2E_FIXED_BANK: boolean }).CG_E2E_FIXED_BANK = true;
  });
  await page.reload();
  await expect(app.fixedPanel).toBeVisible();

  // Put a template in the library the ordinary way (the Library's own import).
  await app.importVcg('lower-third.vcg', await buildValidVcg('tpl-lib-e2e'));
  await expect(app.templateRow('tpl-lib-e2e')).toBeVisible();
  const librarySize = await app.loadButtons().count();

  await app.fixedRow(72).getByRole('button', { name: 'LOAD…' }).click();
  const picker = page.getByRole('dialog', { name: 'Load onto layer 1-72' });
  await expect(picker).toBeVisible();
  await picker
    .getByRole('button', { name: /^Load .* onto this layer$/ })
    .first()
    .click();

  await expect(app.fixedRow(72)).toContainText('bound:');
  // Nothing was imported — the library is exactly as it was.
  await expect(app.loadButtons()).toHaveCount(librarySize);
});
