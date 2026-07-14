import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * B-044 — the pending-intent completion contract, as the operator sees it:
 * `UPDATING` (and `TAKING`) are TRANSIENT badges that settle back to the
 * underlying on-air state within a bounded time — never a permanent spinner.
 * Runs against the browser MockRuntime, whose lifecycle mirrors the bridge
 * Reconciler's settle-on-ack contract.
 */

test('the stack badge settles back to ON AIR after an update — UPDATING is transient', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-badge';
  await app.importVcg('badge.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // The seeded demo stack has its own rows — scope every badge assertion to THIS template's
  // row. R-004: the row no longer prints its templateId, so it is addressed by the stable
  // data anchor it carries instead.
  const row = app.stackRow(templateId).last();

  // Play → the badge settles ON AIR (a transient TAKING beat is allowed).
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible();

  // Stage an edit and APPLY via Update (R-003 — blur no longer commits) →
  // transient UPDATING must settle back to ON AIR within the bound and REST there.
  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  await field.fill('مجری جدید');
  await app.applyEdits();
  // Past the mock's settle beat (160ms) with margin:
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });
  await app.page.waitForTimeout(400);
  await expect(row.getByText('UPDATING')).toHaveCount(0);
  await expect(row.getByText('ON AIR')).toBeVisible();

  // The committed value survived the round-trip.
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue('مجری جدید');
});
