import type { Locator } from '@playwright/test';
import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-127 — the open project is renamed in place on the TopToolbar name: double-click it, or
 * File → "Rename Project…" (both drive the SAME inline edit). Enter/blur commits, Escape
 * cancels; the commit marks the doc dirty (SAVE enables, the tab title gets its `*` marker)
 * and — with a composition active — renames the PROJECT, not the composition.
 */

const name = (app: DesignerApp): Locator => app.page.getByTestId('project-name');
const nameInput = (app: DesignerApp): Locator => app.page.getByTestId('project-name-input');
const saveBtn = (app: DesignerApp): Locator => app.page.getByRole('button', { name: 'SAVE' });

/** How many characters of the input are selected. */
const selectedLength = (input: Locator): Promise<number> =>
  input.evaluate((el) => {
    const i = el as HTMLInputElement;
    return (i.selectionEnd ?? 0) - (i.selectionStart ?? 0);
  });

test('double-click the project name → edit, type, Enter → renamed, dirty, tab title follows', async ({
  app,
}) => {
  await app.newProject('Before');
  await expect(app.page).toHaveTitle('Before'); // clean: no `*` marker
  await expect(saveBtn(app)).toBeDisabled();

  await name(app).dblclick();

  // The name is now a focused input holding the current name, its text selected.
  const input = nameInput(app);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Before');
  await expect.poll(() => selectedLength(input)).toBe('Before'.length);

  // Typing replaces the selected name; Enter commits.
  await app.page.keyboard.type('After');
  await app.page.keyboard.press('Enter');

  await expect(nameInput(app)).toHaveCount(0);
  await expect(name(app)).toHaveText('After');
  // The rename is a real scene edit: dirty ⇒ SAVE enabled + the tab's unsaved marker.
  await expect(saveBtn(app)).toBeEnabled();
  await expect(app.page).toHaveTitle('* After');

  // One undo entry — a single undo restores the previous name.
  await app.undo();
  await expect(name(app)).toHaveText('Before');
});

test('Escape cancels the rename — the previous name is kept', async ({ app }) => {
  await app.newProject('Keep');

  await name(app).dblclick();
  await app.page.keyboard.type('Discarded');
  await app.page.keyboard.press('Escape');

  await expect(nameInput(app)).toHaveCount(0);
  await expect(name(app)).toHaveText('Keep');
  await expect(app.page).toHaveTitle('Keep'); // still clean — nothing was written
});

test('File → "Rename Project…" drives the same inline edit, and renames the PROJECT while a composition is active', async ({
  app,
}) => {
  await app.newProject('Proj');
  await app.newComposition('MyComp');
  await app.openComposition('MyComp'); // MyComp is now the ACTIVE document

  await app.page.getByRole('button', { name: 'File' }).click();
  await app.page.getByRole('menuitem', { name: 'Rename Project' }).click();

  const input = nameInput(app);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Proj');
  await expect.poll(() => selectedLength(input)).toBe('Proj'.length); // same affordance: text selected

  await app.page.keyboard.type('Renamed Project');
  await app.page.keyboard.press('Enter');

  await expect(name(app)).toHaveText('Renamed Project');
  await expect(app.page).toHaveTitle('* Renamed Project');

  // The ACTIVE COMPOSITION is untouched — the rename targeted the scene root, not the
  // active doc (`updateScene`'s `docKeys` would have renamed the composition instead).
  await app.showCompositions();
  await expect(app.page.locator('.cg-comp-row', { hasText: 'MyComp' })).toHaveCount(1);
  await expect(app.page.locator('.cg-comp-row', { hasText: 'Renamed Project' })).toHaveCount(0);
});
