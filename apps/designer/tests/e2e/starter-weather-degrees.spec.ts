import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

const examples = [
  {
    label: 'آب‌وهوای مراکز استان‌ها',
    composition: 'ردیف آب‌وهوای شهر',
    fields: [{ id: 'temp', label: 'دما', element: 'weather-temp', degree: 'weather-degree' }],
  },
  {
    label: 'پیش‌بینی چندروزهٔ هوا',
    composition: 'کارت پیش‌بینی روز',
    fields: [
      { id: 'high', label: 'بیشینه', element: 'forecast-high', degree: 'forecast-high-degree' },
      { id: 'low', label: 'کمینه', element: 'forecast-low', degree: 'forecast-low-degree' },
    ],
  },
  {
    label: 'آب‌وهوای شهرها — کارت‌های تصویری',
    composition: 'کارت آب‌وهوای شهر',
    fields: [{ id: 'temp', label: 'دما', element: 'weather-temp', degree: 'weather-degree' }],
  },
] as const;

const temperatures = [
  { entered: '7', displayed: '۷' },
  { entered: '23', displayed: '۲۳' },
  { entered: '-7', displayed: '-۷' },
] as const;

/** Measure the text runs, not their generously sized editable element boxes. */
async function expectAdjacentDegree(
  number: Locator,
  degreeId: string,
  displayed: string,
): Promise<void> {
  await expect(number).toBeVisible();
  await expect(number).toHaveText(displayed);
  const geometry = await number.evaluate(async (node, siblingId) => {
    const doc = node.ownerDocument;
    await doc.fonts.ready;
    const degree = doc.querySelector<HTMLElement>(`[data-cg-element-id="${siblingId}"]`);
    if (degree === null) throw new Error(`Missing degree element ${siblingId}`);
    const glyphBounds = (element: Element): DOMRect => {
      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) {
        if ((walker.currentNode.textContent ?? '').trim() !== '')
          textNodes.push(walker.currentNode as Text);
      }
      const first = textNodes[0];
      const last = textNodes.at(-1);
      if (first === undefined || last === undefined)
        throw new Error(`No painted text in ${element.getAttribute('data-cg-element-id')}`);
      const range = doc.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.length);
      return range.getBoundingClientRect();
    };
    const numberGlyph = glyphBounds(node);
    const degreeGlyph = glyphBounds(degree);
    const numberBox = node.getBoundingClientRect();
    const authoredWidth = Number.parseFloat(getComputedStyle(node).width);
    const scaleX = numberBox.width / authoredWidth;
    if (!Number.isFinite(scaleX) || scaleX <= 0 || numberGlyph.width <= 0 || degreeGlyph.width <= 0)
      throw new Error('Temperature and degree must both have visible, measurable glyphs');
    return {
      degreeText: degree.textContent,
      numberDirection: getComputedStyle(node).direction,
      // Normalise inside the iframe using the actual element scale; Canvas zoom and
      // Preview fit are not assumptions about CSS pixels or the authored card size.
      gap: (degreeGlyph.left - numberGlyph.right) / scaleX,
    };
  }, degreeId);
  expect(geometry.degreeText).toBe('°');
  expect(geometry.numberDirection).toBe('ltr');
  expect(geometry.gap, `${displayed} → ° must not overlap`).toBeGreaterThanOrEqual(0);
  expect(geometry.gap, `${displayed} → ° must stay beside the number`).toBeLessThanOrEqual(8);
}

for (const example of examples) {
  test(`${example.label}: degrees follow one-digit, two-digit and negative Persian temperatures on Canvas and Preview`, async ({
    app,
  }) => {
    await app.page.getByTestId('starter-card').filter({ hasText: example.label }).click();
    await app.expectStudio();
    // Open the normal editable row/card. No runtime injection, DOM text replacement,
    // placeholder binding or separate formatter is used to manufacture the samples.
    await app.openComposition(example.composition);
    for (const field of example.fields) {
      await app.selectElementById(field.element);
      await app.expandDynamicData();
      // A placeholder-only workaround would leave this ordinary Data key empty.
      await expect(app.dataKeyInput).toBeVisible();
      await expect(app.dataKeyInput).toHaveValue(field.id);
      await expect(app.inspector.getByRole('combobox', { name: 'Field type' })).toHaveValue(
        'number',
      );
      await expect(
        app.inspector.getByRole('combobox', { name: 'digits', exact: true }),
      ).toHaveValue('persian');
      const value = app.inspector.getByRole('textbox', { name: 'Value', exact: true });
      await expect(value).toHaveAttribute('inputmode', 'decimal');
      const number = app.canvasFrame.locator(`[data-cg-element-id="${field.element}"]`);
      for (const temperature of temperatures) {
        await value.fill(temperature.entered);
        await value.press('Enter');
        await expect(value).toHaveValue(temperature.displayed);
        await expectAdjacentDegree(number, field.degree, temperature.displayed);
      }
    }

    await app.openPreviewModal();
    await app.play();
    for (const field of example.fields) {
      const value = app.previewDialog.getByRole('textbox', { name: field.label, exact: true });
      await expect(value).toHaveAttribute('inputmode', 'decimal');
      for (const temperature of temperatures) {
        await app.setPreviewField(field.label, temperature.entered);
        await expect(value).toHaveValue(temperature.displayed);
        await app.updateAllPreviewFields();
        await expect(app.previewDialog.getByRole('alert')).toHaveCount(0);
        await expectAdjacentDegree(
          app.previewElement(field.element),
          field.degree,
          temperature.displayed,
        );
      }
    }
  });
}
