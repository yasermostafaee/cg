import type { Page } from '@playwright/test';
import { buildValidVcg, test, expect, type RuntimeApp } from './fixtures/runtime.js';

/**
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — **EACH CHANNEL HAS ITS OWN TEMPLATE LIST.**
 *
 * What the owner will see, driven through the operator's own controls on a two-channel station:
 *
 *   - each channel's template picker shows its own list;
 *   - a channel declared later starts with an empty list;
 *   - importing on CH 2 does not add the template to CH 1;
 *   - re-importing on CH 2 moves CH 2 alone to the new version;
 *   - removing on CH 2 leaves CH 1 as it was.
 *
 * Every "CH 1 is unchanged" claim is read from CH 1's own picker, beside the positive control
 * that the act landed on CH 2.
 */

const strip = (page: Page) => page.getByRole('tablist', { name: 'Channels' });

async function declareSecondChannel(page: Page): Promise<void> {
  const ok = await page.evaluate(async () => {
    const cg = (window as unknown as { cg: typeof window.cg }).cg;
    const [first] = await cg.fixedLayers.banks();
    if (first === undefined) return false;
    const res = await cg.fixedLayers.setBanks({ banks: [first, { ...first, channel: 2 }] });
    return res.ok;
  });
  expect(ok, 'the second channel was declared').toBe(true);
}

async function showChannel(page: Page, channel: 1 | 2): Promise<void> {
  const tab = strip(page).getByRole('tab', { name: new RegExp(`^CHANNEL ${String(channel)}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** The ids the open picker lists, in order. */
async function listed(app: RuntimeApp): Promise<string[]> {
  return app.templatePicker
    .locator('[data-template-list] [data-template-id]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-template-id') ?? ''));
}

/** Import a package through the OPEN picker's own door — the OS chooser. */
async function importInPicker(app: RuntimeApp, name: string, templateId: string): Promise<void> {
  const chooser = app.page.waitForEvent('filechooser');
  await app.templatePicker.getByRole('button', { name: 'Import a .vcg' }).first().click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await buildValidVcg(templateId)),
  });
  await expect(app.templateRow(templateId)).toHaveAttribute('data-template-selected', 'true');
}

/** The name a row in the open picker shows for `templateId`. */
const rowName = (app: RuntimeApp, templateId: string) =>
  app.templateRow(templateId).locator('.cg-tpl-name');

test('🔴 each channel shows its own list: CH 2, declared later, starts empty — and an import on CH 2 adds to CH 2 only', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await declareSecondChannel(page);

  // CH 1 lists the station's library.
  await app.openTemplatePicker();
  const ch1 = await listed(app);
  expect(ch1.length, 'CH 1 lists the library').toBeGreaterThan(0);
  await app.closeTemplatePicker();

  // CH 2 was declared after the library was copied: it starts with an EMPTY list.
  await showChannel(page, 2);
  await app.openTemplatePicker();
  await expect(app.templatePicker.locator('[data-template-empty]')).toContainText(
    'Nothing on CH 2 yet',
  );
  await importInPicker(app, 'ch2-only.vcg', 'tpl-ch2-only');
  expect(await listed(app), 'the import landed on CH 2').toEqual(['tpl-ch2-only']);
  await app.closeTemplatePicker();

  // CH 1's list is exactly what it was.
  await showChannel(page, 1);
  await app.openTemplatePicker();
  await expect(app.templateRow('tpl-ch2-only')).toHaveCount(0);
  expect(await listed(app)).toEqual(ch1);
  await app.closeTemplatePicker();
});

test('🔴 a re-import on CH 2 moves CH 2 alone; a removal on CH 2 leaves CH 1 as it was', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1400, height: 900 });
  await declareSecondChannel(page);

  // The same package imported on both channels — each through its own picker.
  await app.openTemplatePicker();
  await importInPicker(app, 'shared-one.vcg', 'tpl-shared');
  await expect(rowName(app, 'tpl-shared')).toHaveText('shared one');
  await app.closeTemplatePicker();
  await showChannel(page, 2);
  await app.openTemplatePicker();
  await importInPicker(app, 'shared-one.vcg', 'tpl-shared');

  // RE-IMPORT on CH 2 — the same template, a new version (named from its new file).
  await importInPicker(app, 'shared-two.vcg', 'tpl-shared');
  await expect(rowName(app, 'tpl-shared'), 'CH 2 moved to the new version').toHaveText(
    'shared two',
  );
  await app.closeTemplatePicker();
  await showChannel(page, 1);
  await app.openTemplatePicker();
  await expect(rowName(app, 'tpl-shared'), 'CH 1 kept its version').toHaveText('shared one');
  await app.closeTemplatePicker();

  // REMOVE on CH 2 — through the row's icon, named for its channel, and its confirm.
  await showChannel(page, 2);
  await app.openTemplatePicker();
  await app.templatePicker
    .getByRole('button', { name: 'Remove shared two from CH 2', exact: true })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Remove “shared two” from CH 2?' });
  await confirm.getByRole('button', { name: 'Remove from CH 2', exact: true }).click();
  await expect(app.templateRow('tpl-shared'), 'the removal landed on CH 2').toHaveCount(0);
  await app.closeTemplatePicker();

  // CH 1 still lists it, at its own version.
  await showChannel(page, 1);
  await app.openTemplatePicker();
  await expect(rowName(app, 'tpl-shared')).toHaveText('shared one');
  await expect(
    app.templatePicker.getByRole('button', { name: 'Remove shared one from CH 1', exact: true }),
  ).toBeVisible();
  await app.closeTemplatePicker();
});
