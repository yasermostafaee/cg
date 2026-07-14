import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-007 guard — every stack action button must actually DISPATCH its bridge
 * intent on click. The restyle (AsyncButton) severed the click path; this asserts
 * PLAY / UPDATE / OUT / REMOVE each cause their effect. (The dev-only StrictMode
 * variant that caused the slice regression is reproduced by
 * `asyncButtonStrictMode.test.ts`; this e2e — a production build — guards against
 * other severing modes: a dropped onClick, an overlay swallowing the click, a
 * stuck-disabled state.)
 */

test('PLAY / UPDATE / OUT / REMOVE each dispatch their action on click', async ({ app }) => {
  const templateId = 'tpl-r007-dispatch';
  await app.importVcg('dispatch.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // R-004 — the row no longer prints its templateId; it carries it as a stable data anchor.
  const row = app.stackRow(templateId).last();

  // PLAY → take dispatched → the badge settles ON AIR.
  await row.getByRole('button', { name: 'PLAY' }).click();
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  // UPDATE → one stack.update dispatched (nothing staged still sends — B-048).
  // Wait for it to settle back to ON AIR so its mock settle-timer can't race the
  // OUT below (the mock shares one per-item settle slot).
  await app.installUpdateSpy();
  await row.getByRole('button', { name: 'UPDATE' }).click();
  await expect.poll(() => app.updateCount()).toBe(1);
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });

  // OUT → out dispatched → the item leaves air (settles IDLE).
  await row.getByRole('button', { name: 'CLEAR', exact: true }).click();
  await expect(row.getByText('IDLE')).toBeVisible({ timeout: 3000 });

  // REMOVE → remove dispatched → the row is gone from the stack.
  await row.getByRole('button', { name: 'REMOVE' }).click();
  await expect(app.stack.getByText(templateId, { exact: false })).toHaveCount(0);
});
