import { test, expect } from './fixtures/designer.js';

/**
 * D-088 (+ folded D-089) — desktop document model, the parts observable in the
 * MemoryWorkspace E2E mode (native pickers are neutralized; Save falls back to the OPFS/
 * memory writer). The native handle Save/Open + permission paths are unit-tested and in
 * the design.md manual checklist.
 *
 * Covers: tab-title asterisk, the SAVE control enabled/disabled + the unsaved amber
 * border-top, the SaveBeforeSwitch guard on Home, and the duplicate-modal regression
 * (Home CLOSES the project so the landing page does not re-prompt).
 */

const AMBER = 'rgb(255, 221, 64)'; // #ffdd40 (unsaved border-top)
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test.describe('Desktop-style Save (D-088 + D-089)', () => {
  test('title asterisk + SAVE enabled/disabled + amber border reflect dirty', async ({
    app,
    page,
  }) => {
    await app.newProject('SaveTest');
    const save = page.getByRole('button', { name: 'SAVE', exact: true });

    // Freshly created project is clean.
    await expect(page).toHaveTitle('SaveTest');
    await expect(save).toBeDisabled();
    await expect(save).toHaveCSS('border-top-color', TRANSPARENT);

    // Edit the document → dirty.
    await app.addRectangle();
    await expect(page).toHaveTitle('* SaveTest');
    await expect(save).toBeEnabled();
    await expect(save).toHaveCSS('border-top-color', AMBER);

    // Save (OPFS/memory fallback in E2E) → clean again.
    await save.click();
    await expect(page).toHaveTitle('SaveTest');
    await expect(save).toBeDisabled();
    await expect(save).toHaveCSS('border-top-color', TRANSPARENT);
  });

  test('SaveBeforeSwitch guards Home when dirty; Home closes the project (no duplicate modal)', async ({
    app,
    page,
  }) => {
    await app.newProject('GuardTest');
    await app.addRectangle(); // dirty
    await expect(page).toHaveTitle('* GuardTest');

    const guard = page.getByRole('dialog', { name: 'Save before switch' });

    // Home while dirty → the guard runs first.
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(guard).toBeVisible();

    // Discard → proceed: Home CLOSES the project, landing the operator on the picker.
    await guard.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

    // Regression: the project is closed, so starting a New project does NOT re-prompt the
    // unsaved-changes guard (the old bug left the project open and re-triggered it).
    await page.getByRole('button', { name: 'New project' }).click();
    await expect(guard).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
  });

  // D-093 — Remove from Recent. (MemoryKv resets on reload in E2E, so reload-persistence
  // is covered by the ProjectStore unit test; here we verify the list mutation + the rest
  // remaining.)
  test('remove a Recent entry — it goes, the rest remain (non-destructive list action)', async ({
    app,
    page,
  }) => {
    const save = page.getByRole('button', { name: 'SAVE', exact: true });
    const home = page.getByRole('button', { name: 'Home', exact: true });
    const newProjectBtn = page.getByRole('button', { name: 'New project' });

    // Seed two Recent entries: create → edit → Save (records it) → Home (clean ⇒ no guard).
    for (const name of ['Alpha', 'Beta']) {
      await app.newProject(name);
      await app.addRectangle();
      await save.click();
      await expect(save).toBeDisabled(); // saved ⇒ clean
      await home.click();
      await expect(newProjectBtn).toBeVisible(); // back on the landing/picker
    }

    const removeButtons = page.getByRole('button', { name: /Remove .+ from recent/ });
    await expect(removeButtons).toHaveCount(2);

    // Remove Alpha → it's gone, Beta remains. (The file is never touched.)
    await page.getByRole('button', { name: 'Remove Alpha from recent' }).click();
    await expect(removeButtons).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Remove Beta from recent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Alpha from recent' })).toHaveCount(0);
  });
});
