import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `FIELD-DIGITS-01` — **THE FIELD, NOT THE KEYBOARD, DECIDES A VALUE'S DIGITS.** A Windows
 * keyboard types Latin digits on the numpad whatever its layout, so the author says, per field,
 * which digits its value is written in; a field made through a Data key starts on Persian.
 *
 * The Designer's canvas and preview ARE the page (`@cg/template-runtime` in an iframe), so the
 * preview draws what air draws. The on-air half is measured on the EXPORTED single-file page —
 * the page CasparCG loads — driven through the `update()` / `play()` globals CasparCG calls.
 */

/** The faces the engine DREW a node's text with — CDP, not CSS: `family×glyphs`. */
async function drawnFaces(client: CDPSession, selector: string): Promise<string[]> {
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `no node for ${selector} — nothing below is measured`).toBeGreaterThan(0);
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => `${f.familyName}×${String(f.glyphCount)}`);
}

/** Open an exported page the way CasparCG does, ready for `update()`. */
async function onAir(page: Page, html: string): Promise<Page> {
  const air = await page.context().newPage();
  await air.setContent(html);
  await air.waitForFunction(
    () => typeof (window as unknown as { update?: unknown }).update === 'function',
  );
  return air;
}

/** Hand the page a field set the way CasparCG does, and play. */
async function send(air: Page, values: Record<string, unknown>): Promise<void> {
  await air.evaluate((json) => {
    const w = window as unknown as { update: (s: string) => void; play: () => void };
    w.update(json);
    w.play();
  }, JSON.stringify(values));
}

test('a new field reads persian, a number keeps it, and the preview follows the choice', async ({
  app,
}) => {
  await app.newProject('DigitsSetting');
  await app.addTextElement({ x: 300, y: 200 });
  await app.setDataKey('clock');
  const textId = (await app.timelineRowIds())[0]!;
  const digits = app.inspector.getByRole('combobox', { name: 'digits', exact: true });
  await expect(digits).toHaveValue('persian');

  // The preview follows the choice — Latin first, which is the control.
  const previewed = async (): Promise<void> => {
    await app.openPreviewModal();
    await app.play();
    await app.setPreviewField('clock', '12:30');
    await app.updatePreviewField('clock');
  };
  await digits.selectOption('latin');
  await previewed();
  await expect(app.previewElement(textId)).toHaveText('12:30');
  await app.previewDialog.getByRole('button', { name: 'Close' }).click();

  await digits.selectOption('persian');
  await previewed();
  await expect(app.previewElement(textId)).toHaveText('۱۲:۳۰');
  await app.previewDialog.getByRole('button', { name: 'Close' }).click();

  // A number keeps the choice, and offers no `as-typed`.
  await app.inspector.getByRole('combobox', { name: 'Field type' }).selectOption('number');
  await expect(digits).toHaveValue('persian');
  await expect(digits.locator('option')).toHaveText(['persian', 'latin', 'arabic-indic']);
});

test('the exported page draws a Persian number in one face; the same template without the setting renders as before', async ({
  app,
}) => {
  const { page } = app;
  await app.newProject('DigitsOnAir2');
  await app.addTextElement({ x: 240, y: 140 });
  await app.setDataKey('score');
  const scoreId = (await app.timelineRowIds())[0]!;
  await app.inspector.getByRole('combobox', { name: 'Field type' }).selectOption('number');
  await app.addTextElement({ x: 240, y: 220 });
  await app.setDataKey('clock');
  const clockId = (await app.timelineRowIds()).find((id) => id !== scoreId)!;
  const { html } = await app.exportHtml();

  const air = await onAir(page, html);
  const client = await air.context().newCDPSession(air);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const score = `[data-cg-element-id="${scoreId}"]`;
  const clock = `[data-cg-element-id="${clockId}"]`;

  // A NUMBER goes on air as a number and is drawn in its field's digits, with `٫` and no grouping.
  await send(air, { score: 12.5, clock: '12:30' });
  await expect(air.locator(score)).toHaveText('۱۲٫۵');
  await expect(air.locator(clock)).toHaveText('۱۲:۳۰');
  await send(air, { score: 1234567890 });
  await expect(air.locator(score)).toHaveText('۱۲۳۴۵۶۷۸۹۰');
  await air.evaluate(async () => {
    await document.fonts.ready;
  });
  // PERSIAN-DIGITS-01's measure: all ten digits of the number from ONE face.
  expect(await drawnFaces(client, score)).toEqual(['Vazirmatn×10']);
  await air.close();

  // An OLD template: the same scene with the key it never had. Proven live by the count — both
  // fields carried the setting, and both lose it.
  const keys = html.match(/,"digits":"persian"/g) ?? [];
  expect(keys, 'the export carries each field’s setting').toHaveLength(2);
  const old = await onAir(page, html.replace(/,"digits":"persian"/g, ''));
  await send(old, { score: 12.5, clock: '12:30' });
  await expect(old.locator(score)).toHaveText('12.5');
  await expect(old.locator(clock)).toHaveText('12:30');
  await send(old, { clock: '۱۲:۳۰' });
  await expect(old.locator(clock)).toHaveText('۱۲:۳۰');
  await old.close();
});
