import { readFile } from 'node:fs/promises';
import { unpack } from '@cg/vcg-format';
import { test, expect } from './fixtures/designer.js';

/**
 * The critical end-to-end flow (P-005): create a composition → add a text element
 * with a data key → preview and edit the field value live → run the lifecycle
 * transport → export a single-file HTML. Composed entirely from the shared fixtures.
 */
test.describe('Designer critical flow', () => {
  test('compose → data key → live preview → transport → export HTML', async ({ app }) => {
    // Create a project (opens one composition) and add a text element.
    await app.newProject('Critical');
    await app.addTextElement({ x: 240, y: 140 });

    // Give it a data key → a field is created (seeded from the element's text).
    await app.setDataKey('headline');
    await expect(app.dataKeyInput).toHaveValue('headline');

    // D-087 — the preview opens loaded-but-unpainted (blank until Play). Play paints
    // the bound value. D-106 — a field edit is PENDING and does NOT touch the stage
    // until an explicit Update is applied.
    await app.openPreviewModal();
    await expect(app.previewFrame.getByText('New text')).toBeHidden();
    await app.play();
    await expect(app.previewFrame.getByText('New text')).toBeVisible();
    await app.setPreviewField('headline', 'Hello E2E');
    // `FIELD-DIGITS-01` — a field made through a Data key starts on Persian, so the page draws the
    // value's one digit in Persian and nothing else: `Hello E2E` goes on air as `Hello E۲E`.
    const drawn = 'Hello E۲E';
    await expect(app.previewFrame.getByText(drawn)).toBeHidden(); // pending, not applied
    await app.updateAllPreviewFields();
    await expect(app.previewFrame.getByText(drawn)).toBeVisible();

    // Stop runs the outro and settles the stage blank again.
    await app.stop();
    await expect(app.previewFrame.getByText(drawn)).toBeHidden();

    // Close the preview and export a single-file HTML (captured via the download).
    await app.previewDialog.getByRole('button', { name: 'Close' }).click();
    const { filename, html } = await app.exportHtml();
    expect(filename).toMatch(/\.html$/);
    expect(html).toContain('<!doctype html');
    // The exported HTML embeds the bound field as a GDD data key.
    expect(html.toLowerCase()).toContain('headline');
  });
});

test('Description explains its use in CG Control and survives VCG export', async ({ app }) => {
  await app.newProject('Described field');
  await app.addTextElement({ x: 240, y: 140 });
  await app.setDataKey('headline');

  await app.inspector.getByRole('button', { name: 'About Description' }).click();
  const help = app.page.getByRole('dialog', { name: 'Description' });
  await expect(
    help.getByText('It appears beside this field in CG Control.', { exact: false }),
  ).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();

  const description = app.inspector.getByRole('textbox', { name: 'Description', exact: true });
  const text = 'عنوان خبر را وارد کنید.';
  await description.fill(text);
  await description.press('Enter');
  await expect(description).toHaveValue(text);
  await expect(description).toHaveCSS('direction', 'rtl');

  const downloadReady = app.page.waitForEvent('download');
  await app.compositionActionBar.getByRole('button', { name: 'Export .vcg' }).click();
  const path = await (await downloadReady).path();
  if (path === null) throw new Error('VCG download has no file path');
  const { scene } = await unpack(await readFile(path));
  expect(scene.fields.find(({ id }) => id === 'headline')?.description).toBe(text);
});
