import { test, expect } from './fixtures/runtime.js';

/**
 * R-021 stage 2b — the fixed-bank panel, driven against the offline
 * MockRuntime with the CG_E2E_FIXED_BANK seed (channel 1, layers 70–73:
 * html / ffmpeg / empty / unknown — the bridge-side truth, real OSC tap +
 * sweep, is integration-tested in tools/caspar-bridge).
 *
 * D7 scope: rows render with aliases and layer numbers; unknown occupancy
 * reads as unknown and never as empty; only the observed-html row offers a
 * verb (CLEAR — the non-html and unknown cases offer NONE until stage 4's
 * 4.3, per D1); the Clear is confirm-gated and mirrored in the context menu.
 * "Import+load lands on the exact slot" is stage 3's E2E, beside task 5.3.
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

  // The D1 verb split: ONLY the observed-html row offers a control at all.
  await expect(app.fixedRow(70).getByRole('button', { name: 'CLEAR' })).toBeVisible();
  await expect(app.fixedRow(71).getByRole('button')).toHaveCount(0);
  await expect(app.fixedRow(72).getByRole('button')).toHaveCount(0);
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
  // the ROW SURVIVES (it is permanent — that is the whole point), and the verb
  // disappears with the producer.
  await expect(app.fixedRow(70)).toContainText('empty');
  await expect(app.fixedRow(70).getByRole('button')).toHaveCount(0);
  // The ffmpeg neighbour is untouched.
  await expect(app.fixedRow(71)).toContainText('occupied — ffmpeg producer');
});
