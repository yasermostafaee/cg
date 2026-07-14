import { test, expect } from './fixtures/designer.js';

/**
 * D-059 — the dynamic text field's `pattern` is authored through a named-preset
 * dropdown (Email, Phone, Digits only, …) that writes a vetted ANCHORED regex,
 * with "Custom (advanced)" revealing the raw regex box (today's UI). UI-only over
 * the existing `pattern`: the regex a preset writes is the same string the preview
 * form validates against, so a preset is enforced end-to-end.
 */

const EMAIL_RE = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$';

test('a preset writes its vetted regex; Custom (advanced) exposes the raw box', async ({ app }) => {
  await app.newProject('FieldPresets');
  await app.addTextElement();
  await app.setDataKey('headline'); // dynamic field → the field meta editor appears

  const preset = app.inspector.getByRole('combobox', { name: 'Pattern', exact: true });
  const rawRegex = app.inspector.getByRole('textbox', { name: 'Custom pattern regex' });

  // No pattern yet → "None", and no raw regex box in sight.
  await expect(preset).toHaveValue('none');
  await expect(rawRegex).toHaveCount(0);

  // Pick a named shape: the regex box stays hidden and an example is surfaced.
  await preset.selectOption('email');
  await expect(preset).toHaveValue('email');
  await expect(rawRegex).toHaveCount(0);
  await expect(app.inspector.getByText('news@channel.tv')).toBeVisible();

  // The escape hatch: Custom reveals the raw box, pre-filled with the anchored
  // regex the preset wrote — so it stays editable and auditable.
  await preset.selectOption('custom');
  await expect(rawRegex).toHaveValue(EMAIL_RE);

  // A hand-written regex loads back as Custom (existing patterns are non-breaking).
  await rawRegex.fill('^[A-Z]{3}-[0-9]{4}$');
  await rawRegex.press('Enter');
  const textId = (await app.timelineRowIds())[0]!;
  await app.deselect();
  await app.page.locator(`.cg-tl-row[data-element-id="${textId}"]`).click();
  await expect(preset).toHaveValue('custom');
  await expect(rawRegex).toHaveValue('^[A-Z]{3}-[0-9]{4}$');

  // …and picking a preset again replaces it with the vetted regex.
  await preset.selectOption('digits');
  await expect(preset).toHaveValue('digits');
  await expect(rawRegex).toHaveCount(0);
});

test('the regex a preset writes is what the preview form enforces', async ({ app }) => {
  await app.newProject('PresetEnforced');
  await app.addTextElement();
  await app.setDataKey('email');
  await app.inspector.getByRole('combobox', { name: 'Pattern', exact: true }).selectOption('email');

  await app.openPreviewModal();
  // The FIELD-level mismatch message (the form also raises a summary banner —
  // "N fields need attention" — which is not what this test is pinning).
  const mismatch = app.previewDialog
    .getByRole('alert')
    .filter({ hasText: `Doesn't match ${EMAIL_RE}` });

  // A value of the right shape passes the preset's regex …
  await app.setPreviewField('email', 'news@channel.tv');
  await expect(mismatch).toHaveCount(0);

  // … and one of the wrong shape is rejected, against the exact regex the preset wrote.
  await app.setPreviewField('email', 'not-an-email');
  await expect(mismatch).toBeVisible();
});
