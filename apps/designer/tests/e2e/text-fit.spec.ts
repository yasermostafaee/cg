import type { Frame, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `TEXT-FIT-01` (`B-147`) — a long Persian name SHRINKS TO FIT its box, measured where layout is
 * real (golden rule 12c): in the Designer's preview, and in the exported single-file page booted on
 * its own — the same runtime, so the same size. And it re-fits when the value changes.
 */

const NAME = 'سید محمدعلی رضایی‌نژاد خراسانی';
const SHORT = 'سارا';

/** The fit text's computed size and whether its laid-out run fits its box. */
async function fitState(
  target: Frame | Page,
): Promise<{ px: number; fits: boolean; width: number; box: number; text: string } | null> {
  return target.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-cg-fit="shrink"]');
    if (el === null) return null;
    return {
      px: Number.parseFloat(getComputedStyle(el).fontSize),
      fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
      width: el.scrollWidth,
      box: el.clientWidth,
      text: el.textContent ?? '',
    };
  });
}

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page
    .getByRole('dialog', { name: 'Composition preview' })
    .locator('iframe')
    .elementHandle();
  const frame = await handle?.contentFrame();
  if (frame === null || frame === undefined) throw new Error('no preview frame');
  return frame;
}

/** A TogglePair button in the Inspector row labelled `row`. */
const toggle = (page: Page, row: string, option: string) =>
  page.locator(
    `xpath=//span[normalize-space(text())="${row}"]/following-sibling::div//button[normalize-space(text())="${option}"]`,
  );

test('🔴 TEXT-FIT-01 — a long Persian name shrinks to fit, re-fits on a new value, and the exported page fits it the same', async ({
  app,
}) => {
  test.setTimeout(90_000);
  await app.newProject('Fit');
  await app.addTextElement({ x: 120, y: 100 });
  await toggle(app.page, 'Text Wrap', 'No').click();
  await toggle(app.page, 'Shrink to Fit', 'Yes').click();
  await expect(toggle(app.page, 'Shrink to Fit', 'Yes')).toHaveAttribute('aria-pressed', 'true');
  await app.setDataKey('guest');

  await app.openPreviewModal();
  const frame = await previewFrame(app.page);

  // The long name: smaller than the authored 48 px, and the laid-out run fits the box.
  await app.setPreviewField('guest', NAME);
  await app.updatePreviewField('guest');
  await expect.poll(async () => (await fitState(frame))?.text, { timeout: 10_000 }).toBe(NAME);
  await expect.poll(async () => (await fitState(frame))?.fits, { timeout: 10_000 }).toBe(true);
  const fitted = await fitState(frame);
  if (fitted === null) throw new Error('no fit text in the preview');
  expect(fitted.px).toBeLessThan(48);
  expect(fitted.px).toBeGreaterThanOrEqual(24); // never below half its size
  test.info().annotations.push({
    type: 'preview fit',
    description: `${String(fitted.px)} px; run ${String(fitted.width)} in a ${String(fitted.box)} px box`,
  });

  // A short value re-fits back to the authored size.
  await app.setPreviewField('guest', SHORT);
  await app.updatePreviewField('guest');
  await expect.poll(async () => (await fitState(frame))?.px, { timeout: 10_000 }).toBe(48);

  // The exported page, booted on its own, fits the same name to the same size.
  await app.page.keyboard.press('Escape');
  const { html } = await app.exportHtml();
  const exported = await app.page.context().newPage();
  await exported.setContent(html);
  await exported.evaluate((name) => {
    (window as unknown as { update: (json: string) => void }).update(
      JSON.stringify({ guest: name }),
    );
  }, NAME);
  await expect.poll(async () => (await fitState(exported))?.text, { timeout: 10_000 }).toBe(NAME);
  await expect.poll(async () => (await fitState(exported))?.fits, { timeout: 10_000 }).toBe(true);
  const onPage = await fitState(exported);
  expect(onPage?.px).toBeCloseTo(fitted.px, 0);
  await exported.close();
});
