import type { Page } from '@playwright/test';
import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * The right-click menu, in a real browser — because this is geometry-sensitive UI that a
 * jsdom test cannot speak to: the menu is portalled, positioned in viewport coordinates and
 * clamped to the window, and its items have to be genuinely clickable where they land.
 *
 * The unit tests own the GATING invariant (a menu item is disabled exactly when its button
 * is, across every status × link). These own the parts only a browser can answer:
 *   - the browser's own menu does not appear over the operator surface…
 *   - …but text entry keeps it, so Persian copy stays editable with cut/copy/paste;
 *   - a menu action really reaches the bridge (the same effect the button has);
 *   - the menu opens on-screen even at the viewport edge, and dismisses.
 */

/** Was the app's suppressor the thing that stopped the native menu here? */
async function nativeMenuSuppressed(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`no element for ${sel}`);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, selector);
}

test('right-click on a stack row opens the row actions, and one of them reaches air', async ({
  app,
}) => {
  const templateId = 'tpl-ctx-stack';
  await app.importVcg('ctx.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);

  const row = app.stackRow(templateId).last();
  await row.click({ button: 'right' });

  const menu = app.page.getByRole('menu');
  await expect(menu).toBeVisible();
  for (const label of ['PLAY', 'UPDATE', 'CLEAR', 'REMOVE']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }

  // A freshly loaded item: PLAY is live, UPDATE/CLEAR are not (nothing is on air yet) —
  // the same gating the buttons show.
  await expect(menu.getByRole('menuitem', { name: 'UPDATE', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // The action goes through the bridge exactly as the button does.
  await menu.getByRole('menuitem', { name: 'PLAY', exact: true }).click();
  await expect(menu).toHaveCount(0); // closes on action
  await expect(row.getByText('ON AIR')).toBeVisible({ timeout: 3000 });
});

test('right-click on a library row loads the template onto the stack', async ({ app }) => {
  const templateId = 'tpl-ctx-lib';
  await app.importVcg('ctx-lib.vcg', await buildValidVcg(templateId));

  await app.templateRow(templateId).click({ button: 'right' });
  const menu = app.page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Load', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Remove', exact: true })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Load', exact: true }).click();
  await expect(app.stackRow(templateId).last()).toBeVisible({ timeout: 3000 });
});

test('the menu dismisses on Escape and on an outside click', async ({ app }) => {
  const templateId = 'tpl-ctx-dismiss';
  await app.importVcg('ctx-dismiss.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);
  const row = app.stackRow(templateId).last();

  await row.click({ button: 'right' });
  await expect(app.page.getByRole('menu')).toBeVisible();
  await app.page.keyboard.press('Escape');
  await expect(app.page.getByRole('menu')).toHaveCount(0);

  await row.click({ button: 'right' });
  await expect(app.page.getByRole('menu')).toBeVisible();
  // Click far away from the menu — the backdrop takes it and closes.
  await app.page.mouse.click(5, 5);
  await expect(app.page.getByRole('menu')).toHaveCount(0);
});

test('the menu opens fully on-screen even when right-clicked at the viewport edge', async ({
  app,
}) => {
  const templateId = 'tpl-ctx-clamp';
  await app.importVcg('ctx-clamp.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);

  // Right-click at the row's bottom-right corner — the worst case for spill.
  const row = app.stackRow(templateId).last();
  const box = await row.boundingBox();
  if (box === null) throw new Error('row has no box');
  await app.page.mouse.click(box.x + box.width - 2, box.y + box.height - 2, { button: 'right' });

  const menu = app.page.getByRole('menu');
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  const viewport = app.page.viewportSize();
  if (menuBox === null || viewport === null) throw new Error('no geometry');

  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
});

test('the browser menu is suppressed on the operator surface but KEPT in text entry', async ({
  app,
}) => {
  const templateId = 'tpl-ctx-native';
  await app.importVcg('ctx-native.vcg', await buildValidVcg(templateId));
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // The operator surface: right-click is the app's, never the browser's — its entries
  // (Reload, Back) are at best noise and at worst a way to leave a running show.
  expect(await nativeMenuSuppressed(app.page, 'main')).toBe(true);

  // Text entry is EXEMPT: the Inspector is where Persian copy is typed, and cut/copy/paste
  // plus the BiDi/spelling services are real editing affordances.
  const input = app.page.locator('input[type="text"], textarea').first();
  await expect(input).toBeVisible();
  expect(await nativeMenuSuppressed(app.page, 'input[type="text"], textarea')).toBe(false);
});
