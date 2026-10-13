import { test, expect } from './fixtures/designer.js';
import type { Dialog, Page } from '@playwright/test';

/**
 * 🔴 `D-162` — **CG DESIGNER NEVER LOSES UNSAVED WORK SILENTLY**, in a real browser.
 *
 * Two doors, one predicate (`hasUnsavedChanges`):
 *
 *   - **the browser's leave prompt** — the tab closed with `runBeforeUnload`, so `beforeunload` runs
 *     exactly as a person closing the tab runs it. With unsaved changes the browser asks (the
 *     fixture's dialog listener answers "stay"); without, the tab closes and nothing asks. Both
 *     cases click first, so a missing prompt cannot be the browser's user-activation rule.
 *   - **CG Designer's window close** — the shell faked through `__TAURI_INTERNALS__` (as
 *     `text-digits.spec.ts` fakes `keyboard_language`), and its ask sent the way `close_window.rs`
 *     sends it: one `cg:close-requested` event on the window. This is the RENDER check of the
 *     dialog (golden rule 12); the installed app is driven by the desktop smoke.
 */

/** Every dialog the page raises, by type. The fixture's own listener answers each one. */
function recordDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (d: Dialog) => {
    seen.push(d.type());
  });
  return seen;
}

test.describe('D-162 — the browser leave prompt', () => {
  test('with unsaved changes, closing the tab asks first — and the tab stays', async ({
    app,
    page,
  }) => {
    await app.newProject('LeaveWithChanges');
    await app.addRectangle();
    await expect(page).toHaveTitle('* LeaveWithChanges');
    const seen = recordDialogs(page);

    await page.close({ runBeforeUnload: true });
    await expect.poll(() => seen).toContain('beforeunload');
    // The fixture answered "stay": the tab is still there.
    expect(page.isClosed()).toBe(false);
  });

  test('CONTROL — with no unsaved changes, the tab closes and nothing asks', async ({
    app,
    page,
  }) => {
    await app.newProject('LeaveClean');
    await expect(page).toHaveTitle('LeaveClean');
    const seen = recordDialogs(page);

    const closed = page.waitForEvent('close');
    await page.close({ runBeforeUnload: true });
    await closed;
    expect(seen).toEqual([]);
  });
});

test.describe('D-162 — the window close (the shell faked)', () => {
  test.beforeEach(async ({ app, page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __said: string[]; __TAURI_INTERNALS__: unknown };
      w.__said = [];
      w.__TAURI_INTERNALS__ = {
        invoke: (command: string) => {
          w.__said.push(command);
          return Promise.resolve(command === 'keyboard_language' ? 'unknown' : null);
        },
      };
    });
    await app.goto();
  });

  const said = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  const shellAsksToClose = (page: Page): Promise<void> =>
    page.evaluate(() => {
      window.dispatchEvent(new Event('cg:close-requested'));
    });

  test('the page holds the close as soon as it is up', async ({ page }) => {
    await expect.poll(() => said(page)).toContain('close_guard');
  });

  test('with no unsaved changes, the window closes at once', async ({ app, page }) => {
    await app.newProject('WindowClean');
    await shellAsksToClose(page);
    await expect.poll(() => said(page)).toContain('close_window_now');
    await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toHaveCount(0);
  });

  test("with unsaved changes: ONE dialog; Enter keeps the work; Don't save closes", async ({
    app,
    page,
  }) => {
    await app.newProject('WindowEdited');
    await app.addRectangle();
    await expect(page).toHaveTitle('* WindowEdited');

    await shellAsksToClose(page);
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Unsaved changes' })).toBeVisible();
    await expect(dialog).toContainText('WindowEdited');
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: "Don't save", exact: true })).toBeVisible();
    await expect(cancel).toBeFocused();

    // A second close while it asks: still one dialog.
    await shellAsksToClose(page);
    await expect(page.getByRole('dialog')).toHaveCount(1);

    // A stray Enter presses the focused button — Cancel — and the work stays.
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect(await said(page)).not.toContain('close_window_now');
    await expect(page).toHaveTitle('* WindowEdited');

    // Escape keeps the window too.
    await shellAsksToClose(page);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await said(page)).not.toContain('close_window_now');

    // Closed again: Don't save closes the window.
    await shellAsksToClose(page);
    await dialog.getByRole('button', { name: "Don't save", exact: true }).click();
    await expect.poll(() => said(page)).toContain('close_window_now');
  });

  test('Save saves, then closes the window', async ({ app, page }) => {
    await app.newProject('WindowSaved');
    await app.addRectangle();
    await shellAsksToClose(page);
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => said(page)).toContain('close_window_now');
    // Saved (the E2E storage tier): the work was kept before the window went.
    await expect(page).toHaveTitle('WindowSaved');
  });
});
