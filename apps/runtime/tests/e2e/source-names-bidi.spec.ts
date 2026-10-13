import type { Locator, Page } from '@playwright/test';
import { E2E_PLAYOUT, chooseSource, expect, test, textRunX } from './fixtures/runtime.js';

/**
 * 🔴 `B-303` (`CONSOLE-POLISH-01` §4) — **A PERSIAN NAME READS IN ITS OWN ORDER, WHEREVER IT IS DRAWN.**
 *
 * The owner's screenshot (2026-09-30): the plate's default «NDI کانالِ ۱ (APASAI)» read `Default (NDI ۱
 * کانال (APASAI))`. Two defects: the choice was ONE string, so the name was laid out inside the English
 * words; and a name that starts with a Latin word is laid out left to right even when isolated, because
 * `dir=auto` takes the first strong letter. The Playout shows its names right to left.
 *
 * Measured in a real engine because ORDER is layout (golden rule 12c): `textRunX` walks the text nodes
 * and reads where the glyphs of `NDI` and `APASAI` actually land. Laid out right to left, the name's
 * FIRST word is RIGHTMOST — `NDI` right of `APASAI` — and the English around it (`Default (`) stays
 * left of the whole name. Left to right, the old way, `NDI` is leftmost and this fails.
 */

const NDI_NAME = 'NDI کانالِ ۱ (APASAI)';
const TPL = 'tpl-e2e-bidi';
/** A template name of the same shape: Persian, starting with a Latin word. */
const TPL_NAME = 'HD زیرنویس (LIVE)';

async function registerTemplate(page: Page): Promise<void> {
  await page.evaluate(
    async ({ templateId, name }) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> };
        };
      };
      const left = { x: 0, y: 0, width: 960, height: 540 };
      await w.cg.templates.import({
        template: {
          templateId,
          name,
          // The FILE name outranks the manifest's in what an operator reads (`templateName.ts`).
          sourceFileName: `${name}.vcg`,
          templateType: 'lower-third',
          fields: [],
          liveSources: {
            resolution: { width: 1920, height: 1080 },
            defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
            sources: [{ elementId: 'el-1', sourceId: 'l-1', rect: left, dynamic: false }],
            looks: [
              { id: 'look-1', name: 'look-1', entered: { mode: 'cut' }, rects: { 'l-1': left } },
            ],
            defaultLookId: 'look-1',
          },
        },
        html: '<!doctype html><html><body>bidi</body></html>',
      });
    },
    { templateId: TPL, name: TPL_NAME },
  );
}

/** The owner's order: the name's first word rightmost, its last leftmost. */
async function readsRightToLeft(target: Locator, first: string, last: string): Promise<void> {
  const [a, b] = [await textRunX(target, first), await textRunX(target, last)];
  expect(
    a.left,
    `"${first}" is not RIGHT of "${last}" — the name was laid out left to right`,
  ).toBeGreaterThanOrEqual(b.right);
}

test.describe('the owner’s scene: D10 empty, the default naming an input it no longer lists', () => {
  test.use({
    playoutSources: {
      ...E2E_PLAYOUT,
      inputs: { epoch: 'e2e-bidi', inputs: [] },
      departed: [
        { id: 'ndi-apasai', name: NDI_NAME, producer: { kind: 'ndi', source: 'MTA (APASAI)' } },
      ],
    },
  });

  test('🔴 the Look inputs value and its choice read right to left, apart from `Default (`, and wear `Unavailable`', async ({
    app,
  }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate((templateId) => {
      localStorage.setItem(
        'cg-runtime:source-assignments',
        JSON.stringify({
          assignments: [{ templateId, plateId: 'l-1', sourceId: 'in-ndi-apasai' }],
        }),
      );
    }, TPL);
    await page.reload();
    await registerTemplate(page);
    const layer = await app.loadTemplate(TPL);
    await app.selectLayerRow(layer);

    // 1 · the closed field's value.
    const field = app.inspector.locator('[data-look-binding="look-1:l-1"]');
    const value = field.locator('[data-source-label="choice"]');
    await expect(value).toContainText('NDI');
    await readsRightToLeft(value, 'NDI', 'APASAI');
    const words = await textRunX(value, 'Default (');
    const ndi = await textRunX(value, 'NDI');
    const apasai = await textRunX(value, 'APASAI');
    expect(words.right, 'the English words are not left of the whole name').toBeLessThanOrEqual(
      Math.min(ndi.left, apasai.left) + 0.5,
    );
    // The Playout no longer lists it: the existing mark, with its reason on hover.
    await expect(value.locator('.cg-source-tag--unavailable')).toHaveText('Unavailable');
    await expect(value.locator('.cg-source-tag--unavailable')).toHaveAttribute(
      'title',
      "Not in the Playout's input list.",
    );

    // 2 · the same choice, inside the open picker.
    await field.click();
    const panel = page.getByRole('dialog', { name: 'Choose a source' });
    await expect(panel).toBeVisible();
    const choice = panel.locator('[data-picker-choice=""]');
    await readsRightToLeft(choice, 'NDI', 'APASAI');
    await page.keyboard.press('Escape');
  });
});

test.describe('the same name, listed by the Playout', () => {
  test.use({
    playoutSources: {
      ...E2E_PLAYOUT,
      inputs: {
        epoch: 'e2e-bidi-listed',
        inputs: [
          { id: 'ndi-apasai', name: NDI_NAME, producer: { kind: 'ndi', source: 'MTA (APASAI)' } },
          {
            id: 'studio-1',
            name: 'Studio 1',
            producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
          },
        ],
      },
    },
  });

  test('a picker row, and the field once it is bound, read right to left — CONTROL: `Studio 1` stays left to right', async ({
    app,
  }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await registerTemplate(page);
    const layer = await app.loadTemplate(TPL);
    await app.selectLayerRow(layer);
    const field = app.inspector.locator('[data-look-binding="look-1:l-1"]');

    // 3 · the picker's row.
    await field.click();
    const panel = page.getByRole('dialog', { name: 'Choose a source' });
    const row = panel.locator('[data-picker-input="in-ndi-apasai"] .cg-picker-row__name');
    await readsRightToLeft(row, 'NDI', 'APASAI');
    // CONTROL — a Latin name is not touched: left to right.
    const studio = panel.locator('[data-picker-input="in-studio-1"] .cg-picker-row__name');
    await expect(studio).toHaveAttribute('dir', 'ltr');
    await page.keyboard.press('Escape');

    // 4 · bound, the field names it through `SourceLabel`.
    await chooseSource(page, field, { input: NDI_NAME });
    await readsRightToLeft(field.locator('.cg-source-label__name'), 'NDI', 'APASAI');
  });
});

test('the Inspector and the Layers row read a mixed TEMPLATE name right to left', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await registerTemplate(page);
  const layer = await app.loadTemplate(TPL);
  await app.selectLayerRow(layer);

  // 5 · the Inspector's template line.
  const inInspector = app.inspector.locator('[data-inspector-template] bdi');
  await expect(inInspector).toBeVisible();
  await readsRightToLeft(inInspector, 'HD', 'LIVE');

  // 6 · the row's TEMPLATE cell, in the Layers list.
  const inRow = page
    .getByRole('region', { name: 'Layers' })
    .locator('bdi', { hasText: 'زیرنویس' })
    .first();
  await expect(inRow).toBeVisible();
  await readsRightToLeft(inRow, 'HD', 'LIVE');
});
