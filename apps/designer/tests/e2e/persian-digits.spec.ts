import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `PERSIAN-DIGITS-01` — **A TEMPLATE VALUE TAKES DIGITS EXACTLY AS THE KEYBOARD TYPES THEM**, in
 * the Designer and on the page CasparCG loads.
 *
 * Measured before this change, in this browser: a number field's default typed as `۱۲` left the
 * box empty and stored `0`; `۱۲٫۵` in the preview form previewed `0`; the `Time (HH:MM)` preset
 * refused `۲۱:۳۰`. Text fields were already verbatim, and are pinned here so they stay so.
 *
 * Typing is `keyboard.type` — each character through `insertText`, as a keyboard layout delivers
 * it — never `fill`, which writes a value no keyboard could.
 *
 * The on-air half is measured on the EXPORTED single-file page — the same page the Runtime serves
 * to CasparCG — driven through the `update()` / `play()` globals CasparCG itself calls.
 */

async function typeInto(page: Page, target: ReturnType<Page['locator']>, text: string) {
  await target.click();
  await target.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

/** The faces the engine DREW a node's text with — CDP, not CSS: `family×glyphs`. */
async function drawnFaces(client: CDPSession, selector: string): Promise<string[]> {
  const { root } = await client.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  expect(nodeId, `no node for ${selector} — nothing below is measured`).toBeGreaterThan(0);
  const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
  return fonts.map((f) => `${f.familyName}×${String(f.glyphCount)}`);
}

/** A node's characters in the order they sit on screen, left to right (spaces dropped). */
function visualOrder(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const chars: { ch: string; x: number }[] = [];
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      const s = t.textContent ?? '';
      for (let i = 0; i < s.length; i += 1) {
        const r = document.createRange();
        r.setStart(t, i);
        r.setEnd(t, i + 1);
        chars.push({ ch: s[i] ?? '', x: r.getBoundingClientRect().left });
      }
    }
    return chars
      .filter((c) => c.ch.trim() !== '')
      .sort((a, b) => a.x - b.x)
      .map((c) => c.ch)
      .join('');
  }, selector);
}

test('a number field keeps Persian digits in its default and in the preview; an impossible entry is refused in one line', async ({
  app,
}) => {
  const { page } = app;
  await app.newProject('DigitsNumber');
  await app.addTextElement({ x: 300, y: 200 });
  await app.setDataKey('score');
  const textId = (await app.timelineRowIds())[0]!;
  await app.inspector.getByRole('combobox', { name: 'Field type' }).selectOption('number');

  // The DEFAULT: the author's digits stay in the box; the number it means is stored.
  const value = app.inspector.getByRole('textbox', { name: 'Value', exact: true });
  await typeInto(page, value, '۱۲');
  await expect(value).toHaveValue('۱۲');
  await value.press('Enter');
  await expect(value).toHaveValue('۱۲');
  // Stored as the NUMBER 12 (measured before: `0`). A number field reaches a template as a JSON
  // number, which renders through `String(n)` — `design.md` records that as the owner's decision.
  await expect(
    page.frameLocator('iframe[title="cgpreview"]').locator(`[data-cg-element-id="${textId}"]`),
  ).toHaveText('12');

  // The PREVIEW form's number field.
  await app.openPreviewModal();
  await app.play();
  const field = app.previewDialog.getByLabel('score', { exact: true });
  await typeInto(page, field, '۱۲٫۵');
  await expect(field).toHaveValue('۱۲٫۵');
  await app.updatePreviewField('score');
  await expect(app.previewElement(textId)).toHaveText('12.5');

  // The control: an impossible entry is refused in ONE line and changes nothing on the stage.
  await typeInto(page, field, '۱۲a');
  await expect(
    app.previewDialog.getByRole('alert').filter({ hasText: 'Not a number' }),
  ).toHaveCount(1);
  await expect(field).toHaveValue('۱۲a');
  await expect(app.previewElement(textId)).toHaveText('12.5');
});

test('the Time (HH:MM) preset accepts a time typed in Persian or Arabic-Indic digits', async ({
  app,
}) => {
  const { page } = app;
  await app.newProject('DigitsTime');
  await app.addTextElement();
  await app.setDataKey('azan');
  await app.inspector.getByRole('combobox', { name: 'Pattern', exact: true }).selectOption('time');
  await app.openPreviewModal();
  const field = app.previewDialog.getByLabel('azan', { exact: true });
  const mismatch = app.previewDialog.getByRole('alert').filter({ hasText: "Doesn't match" });

  for (const time of ['۲۱:۳۰', '٢١:٣٠', '21:30']) {
    await typeInto(page, field, time);
    await expect(field).toHaveValue(time);
    await expect(mismatch, time).toHaveCount(0);
  }
  // The control: not a time, in any digit set, is still refused.
  await typeInto(page, field, '۲۱:۷۰');
  await expect(mismatch).toHaveCount(1);
});

test('on the on-air page a text value keeps its digits, draws them in ONE face, and reads in order', async ({
  app,
}) => {
  const { page } = app;
  await app.newProject('DigitsOnAir');
  await app.addTextElement({ x: 300, y: 200 });
  await app.setDataKey('headline');
  const textId = (await app.timelineRowIds())[0]!;
  const { html } = await app.exportHtml();

  const air = await page.context().newPage();
  await air.setContent(html);
  await air.waitForFunction(
    () => typeof (window as unknown as { update?: unknown }).update === 'function',
  );
  const client = await air.context().newCDPSession(air);
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  const sel = `[data-cg-element-id="${textId}"]`;
  const show = async (value: string): Promise<void> => {
    await air.evaluate(
      (json) => {
        const w = window as unknown as { update: (s: string) => void; play: () => void };
        w.update(json);
        w.play();
      },
      JSON.stringify({ headline: value }),
    );
    await expect(air.locator(sel)).toHaveText(value);
    await air.evaluate(async () => {
      await document.fonts.ready;
    });
  };

  // §1 A — verbatim, in all three sets.
  for (const v of ['۱۲۳', '١٢٣', '123']) await show(v);

  // §1 C — the element's face (the default `Inter`) has no Persian digits, so ALL TEN are drawn
  // by ONE face, and it is the Vazirmatn every element's stack names second and the export inlines.
  await show('۱۲۳۴۵۶۷۸۹۰');
  expect(await drawnFaces(client, sel)).toEqual(['Vazirmatn×10']);
  await show('١٢٣٤٥٦٧٨٩٠');
  expect(await drawnFaces(client, sel)).toEqual(['Vazirmatn×10']);
  // The control: Latin digits are drawn with glyphs too, in the same run of the page.
  await show('1234567890');
  const latin = await drawnFaces(client, sel);
  expect(
    latin.reduce((n, f) => n + Number(f.split('×')[1]), 0),
    `Latin digits drawn: ${latin.join(', ')}`,
  ).toBe(10);

  // §1 D — a number inside Persian text: left to right on screen, the digits in order with the
  // colon in place, and the word to their right.
  await show('ساعت ۱۲:۳۰');
  expect(await visualOrder(air, sel)).toBe('۱۲:۳۰تعاس');
  // The control: a Latin-only value reads left to right unchanged.
  await show('Studio 12:30');
  expect(await visualOrder(air, sel)).toBe('Studio12:30');
  await air.close();
});
