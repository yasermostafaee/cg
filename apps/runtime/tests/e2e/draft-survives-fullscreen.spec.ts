import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * Unapplied Inspector drafts must survive a panel FULLSCREEN round-trip.
 *
 * The bug: `pruneDrafts` ran from an effect inside `LayersPanel`, which `App`
 * unmounts on a monitor fullscreen (`!monitorFocused`) AND on an Inspector
 * fullscreen (`showWorkspace`). On remount it ran against the bootstrap stack
 * snapshot — `[]`, because nothing had arrived yet — read every item as gone, and
 * deleted every staged edit. Silent, and no undo.
 *
 * WHY THE EXISTING SPEC MISSED IT, which is the lesson worth keeping:
 * `stage-inspector-edits.spec.ts` asserts a draft survives switching SELECTION.
 * Selection changes never unmount anything, so it tested the path that could not
 * fail — the same shape as the density bug, which passed because it only ever ran
 * at the widest density.
 *
 * BOTH paths are covered below because they are different conditions in `App`:
 * fixing one would not have fixed the other.
 */

const DIRTY = 'draft text that was never applied';

test('a draft survives a MONITOR fullscreen round-trip', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const templateId = 'tpl-draft-fs';
  await app.importVcg('draft.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  await field.fill(DIRTY);
  await field.blur();

  // PGM fullscreen unmounts the whole workspace below the strip, LayersPanel included.
  await page.getByRole('button', { name: 'Show PROGRAM (PGM) fullscreen' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeHidden();
  await page.getByRole('button', { name: 'Exit fullscreen PROGRAM (PGM)' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();

  // No re-select: the selection lives in `App`, which never unmounted, so the
  // Inspector is still open on the same row. Re-selecting would TOGGLE it closed.
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue(DIRTY);
});

test('a draft survives an INSPECTOR fullscreen round-trip', async ({ app }) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  const templateId = 'tpl-draft-fs';
  await app.importVcg('draft.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  await field.fill(DIRTY);
  await field.blur();

  // A DIFFERENT condition in `App` (`showWorkspace`), which is why it is a
  // separate test: this one replaces the workspace rather than collapsing it.
  await page.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeHidden();
  await page.getByRole('button', { name: 'Exit fullscreen INSPECTOR' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();

  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue(DIRTY);
});
