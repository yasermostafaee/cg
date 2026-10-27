import { expect, test } from './fixtures/designer.js';

test.describe('R-102 — Designer file delimiters', () => {
  test('a custom delimiter is managed from Edit and offered by list fields', async ({ app }) => {
    await app.newProject('Custom delimiters');

    await app.page.getByRole('button', { name: 'Edit', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'Manage delimiters…' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Manage delimiters' });
    await dialog.getByRole('button', { name: 'New delimiter', exact: true }).click();
    const form = dialog.getByRole('region', { name: 'Add delimiter' });
    await form.getByRole('textbox', { name: 'Delimiter name' }).fill('double colon');
    await form.getByRole('textbox', { name: 'Delimiter split value' }).fill('::');
    await form.getByRole('button', { name: 'Add delimiter', exact: true }).click();
    await expect(dialog.locator('[data-delimiter-id^="custom-"]')).toContainText('double colon');
    await dialog.getByRole('button', { name: 'Done' }).click();

    await app.addTicker();
    await app.setDataKey('headlines');
    await app.page.getByRole('checkbox', { name: 'Allow file source' }).check();
    const chooser = app.page.waitForEvent('filechooser');
    await app.page.getByRole('button', { name: 'Browse shared file…' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'custom.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('one::two', 'utf8'),
    });
    const fileDialog = app.page.getByRole('dialog', { name: 'File content and fields' });
    const delimiter = fileDialog.getByRole('combobox', { name: 'File delimiter' });
    await expect(delimiter.getByRole('option', { name: 'double colon' })).toHaveAttribute(
      'value',
      '::',
    );
    await fileDialog.getByRole('button', { name: 'Manage delimiters…' }).click();
    const manageDialog = app.page.getByRole('dialog', { name: 'Manage delimiters' });
    await expect(manageDialog).toBeVisible();
    await manageDialog.getByRole('button', { name: 'Done' }).click();
  });

  test('the selected file is shown as the interpreted field preview', async ({ app }) => {
    await app.newProject('File preview');
    await app.addTicker();
    const tickerId = (await app.timelineRowIds())[0]!;
    await app.setDataKey('headlines');
    await app.page.getByRole('checkbox', { name: 'Allow file source' }).check();

    const chooser = app.page.waitForEvent('filechooser');
    await app.page.getByRole('button', { name: 'Browse shared file…' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'headlines.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('one|two', 'utf8'),
    });

    const fileDialog = app.page.getByRole('dialog', { name: 'File content and fields' });
    await fileDialog.getByRole('combobox', { name: 'File delimiter' }).selectOption('|');
    await expect(fileDialog.getByRole('textbox', { name: 'Current file content' })).toHaveValue(
      'one|two',
    );
    await expect(fileDialog.getByRole('button', { name: 'Reload selected file' })).toBeVisible();
    const preview = fileDialog.getByLabel('Field preview');
    await expect(preview).toContainText('one');
    await expect(preview).toContainText('two');
    await fileDialog.getByRole('button', { name: 'Done' }).click();

    // Dynamic / Data is the one file-preview surface; the duplicate Items section stays hidden.
    await expect(app.page.getByText('Items', { exact: true })).toHaveCount(0);
    await expect(app.page.getByLabel('Current file items')).toHaveCount(0);

    // Selection changes used to discard the file bytes and leave only its name.
    await app.deselect();
    await app.selectElementById(tickerId);
    await app.page.getByRole('button', { name: 'View content and fields…' }).click();
    const reopenedFileDialog = app.page.getByRole('dialog', { name: 'File content and fields' });
    await expect(
      reopenedFileDialog.getByRole('textbox', { name: 'Current file content' }),
    ).toHaveValue('one|two');
    await expect(
      reopenedFileDialog.getByText(/headlines\.txt/, { exact: false }).first(),
    ).toBeVisible();
    await reopenedFileDialog.getByRole('button', { name: 'Done' }).click();
    await expect(app.page.getByText('Items', { exact: true })).toHaveCount(0);

    // The separate Preview modal must seed from the same selected-file value too.
    await app.openPreviewModal();
    await expect(app.previewDialog.getByRole('textbox', { name: /^headlines item / })).toHaveCount(
      2,
    );
    await expect(app.tickerItemInput('headlines', 1, app.previewDialog)).toHaveValue('one');
    await expect(app.tickerItemInput('headlines', 2, app.previewDialog)).toHaveValue('two');
  });

  test('a locked fixed file needs no authored Data key', async ({ app }) => {
    await app.newProject('Fixed file without key');
    await app.addTicker();
    await app.page.getByRole('checkbox', { name: 'Use fixed file' }).check();
    await expect(app.page.getByText('Items', { exact: true })).toHaveCount(0);

    const chooser = app.page.waitForEvent('filechooser');
    await app.page.getByRole('button', { name: 'Browse shared file…' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'fixed-headlines.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('first|second', 'utf8'),
    });

    await expect(app.dataKeyInput).toHaveCount(0);
    await expect(
      app.page.getByText('File-only, locked source · no Data key required'),
    ).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Toggle Dynamic / Data' })).toHaveCount(0);
    await expect(app.page.getByText('Bindings', { exact: true })).toHaveCount(0);
    await expect(app.page.getByText(/__fixed_file__/)).toHaveCount(0);
    await expect(
      app.page.getByText(/fixed-headlines\.txt/, { exact: false }).first(),
    ).toBeVisible();
    const fileDialog = app.page.getByRole('dialog', { name: 'File content and fields' });
    await expect(fileDialog.getByRole('option', { name: 'CG Control default' })).toHaveCount(0);
    await expect(fileDialog.getByLabel('File delimiter')).toHaveValue('\\n');
    await fileDialog.getByRole('combobox', { name: 'File delimiter' }).selectOption('|');
    await expect(fileDialog.getByLabel('Field preview').getByRole('listitem')).toHaveCount(2);
    await fileDialog.getByRole('button', { name: 'Done' }).click();
    await expect(app.page.getByText('Items', { exact: true })).toHaveCount(0);

    await expect(app.page.getByText(/configured as CG Bridge/)).toHaveCount(0);
    await expect(app.page.getByText(/Saved for CG Bridge/)).toHaveCount(0);
    await expect(app.page.getByText(/Delimiter and parsed fields/)).toHaveCount(0);
    await app.page.getByRole('button', { name: 'About Fixed file source' }).click();
    const infoDialog = app.page.getByRole('dialog', { name: 'Fixed file source' });
    await expect(infoDialog).toContainText('CG Control');
    await expect(infoDialog).not.toContainText('CG Bridge');
    await infoDialog.getByRole('button', { name: 'Close' }).click();

    await app.page.getByRole('tab', { name: 'Variables' }).click();
    await expect(app.page.getByText('No variables.', { exact: true })).toBeVisible();

    await app.openPreviewModal();
    await expect(app.previewDialog.getByLabel(/read-only items$/)).toHaveCount(1);
    await expect(app.previewDialog.getByRole('button', { name: /Add item/i })).toHaveCount(0);
  });
});
