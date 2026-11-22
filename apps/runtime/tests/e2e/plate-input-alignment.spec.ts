import type { Locator, Page } from '@playwright/test';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  type ControlLiveLayout,
  type DynamicField,
} from '@cg/shared-schema';
import { E2E_PLAYOUT, chooseSource, expect, test } from './fixtures/runtime.js';

const TEMPLATE_ID = 'tpl-plate-input-columns';
const LONG_PLATE_NAME = 'مهمان برنامه گفت‌وگوی ویژه از استودیوی مرکزی شبکه';
const LONG_INPUT_NAME = 'دوربین مهمان برنامه زنده از استودیوی مرکزی شبکه';
const MEDIA_NAME = 'کلیپ معرفی';
const PLATE_IDS = ['frame-short', 'frame-persian', 'frame-media'] as const;

test.use({
  playoutSources: {
    ...E2E_PLAYOUT,
    inputs: {
      ...E2E_PLAYOUT.inputs,
      inputs: E2E_PLAYOUT.inputs.inputs.map((input) =>
        typeof input === 'object' && input !== null && 'id' in input && input.id === 'studio-2'
          ? { ...input, name: LONG_INPUT_NAME }
          : input,
      ),
    },
  },
});

async function registerTemplate(page: Page, fields: readonly DynamicField[] = []): Promise<void> {
  const layout: ControlLiveLayout = {
    id: TEMPLATE_ID,
    name: 'Plate input columns',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    frames: [
      { id: PLATE_IDS[0], title: 'Cam' },
      { id: PLATE_IDS[1], title: LONG_PLATE_NAME },
      { id: PLATE_IDS[2], title: 'Media preview' },
    ],
    presets: [
      {
        id: 'all',
        name: 'All plates',
        frameIds: [...PLATE_IDS],
        arrangement: 'side-by-side',
        horizontalGap: 0,
        verticalGap: 0,
        reverse: false,
        hiddenTitles: [],
        hiddenFocusTitles: [],
      },
    ],
    defaultPresetId: 'all',
    background: { kind: 'none' },
    effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  };
  await page.evaluate(
    async ({ authoring, fields }) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (request: { template: unknown; html: string }) => Promise<unknown> };
        };
      };
      const sources = authoring.frames.map(({ id }, index) => ({
        elementId: `element-${id}`,
        sourceId: id,
        rect: { x: index * 640, y: 360, width: 640, height: 360 },
        dynamic: false,
      }));
      await w.cg.templates.import({
        template: {
          templateId: authoring.id,
          name: authoring.name,
          sourceFileName: `${authoring.name}.vcg`,
          templateType: 'lower-third',
          fields,
          controlLiveLayout: authoring,
          liveSources: {
            resolution: authoring.resolution,
            defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
            sources,
            defaultLookId: 'all',
            looks: [
              {
                id: 'all',
                name: 'All plates',
                rects: Object.fromEntries(sources.map(({ sourceId, rect }) => [sourceId, rect])),
              },
            ],
          },
        },
        html: '<!doctype html><html><body>Plate input alignment fixture</body></html>',
      });
    },
    { authoring: layout, fields },
  );
}

async function fullValueOnHover(page: Page, field: Locator, value: string): Promise<void> {
  const tooltip = page.getByRole('tooltip');
  await page.mouse.move(1, 1);
  await expect(tooltip).toBeHidden();
  await field.hover({ position: { x: 5, y: 5 } });
  await page.clock.runFor(500);
  await expect(tooltip).toHaveText(value);
  await expect(tooltip).toBeVisible();
  const tipBox = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(tipBox).not.toBeNull();
  expect(tipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(viewport!.width);
  await page.mouse.move(1, 1);
  await expect(tooltip).toBeHidden();
}

async function noValueTooltipOnHover(page: Page, field: Locator): Promise<void> {
  await page.mouse.move(1, 1);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await field.hover({ position: { x: 5, y: 5 } });
  // Advance the real tooltip timer: an immediate negative assertion misses a delayed bubble.
  await page.clock.runFor(500);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.mouse.move(1, 1);
}

async function expectTextClipped(text: Locator): Promise<void> {
  expect(
    await text.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeGreaterThan(1);
}

/** Measure painted boxes, rather than testing that the same class is attached to every row. */
async function measureColumns(group: Locator) {
  await expect(group.locator('.cg-form-row')).toHaveCount(3);
  const rows = await group.locator('.cg-form-row').evaluateAll((elements) =>
    elements.map((element) => {
      const box = (target: Element | null) => {
        if (target === null) return null;
        const rect = target.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      };
      return {
        row: box(element)!,
        label: box(element.querySelector('.cg-form-row__label'))!,
        control: box(element.querySelector('.cg-form-row__control'))!,
        action: box(element.querySelector('[data-media-playback]')),
        overflow: element.scrollWidth - element.clientWidth,
      };
    }),
  );
  const first = rows[0]!;
  for (const [index, { row, label, control, overflow }] of rows.entries()) {
    expect(label.width, `row ${index + 1} has a visible label column`).toBeGreaterThan(0);
    expect(control.width, `row ${index + 1} has a usable source field`).toBeGreaterThan(80);
    expect(Math.abs(label.left - first.label.left), 'label left edges align').toBeLessThan(1);
    expect(Math.abs(label.right - first.label.right), 'label right edges align').toBeLessThan(1);
    expect(
      Math.abs(control.left - first.control.left),
      'source field left edges align',
    ).toBeLessThan(1);
    expect(
      Math.abs(control.right - first.control.right),
      'source field right edges align',
    ).toBeLessThan(1);
    expect(label.right, 'label does not overlap source field').toBeLessThanOrEqual(control.left);
    expect(control.right, 'source field remains inside its row').toBeLessThanOrEqual(row.right + 1);
    expect(overflow, 'row does not introduce a horizontal scrollbar').toBeLessThanOrEqual(1);
  }
  expect(rows[0]!.action).toBeNull();
  expect(rows[1]!.action).toBeNull();
  const media = rows[2]!;
  expect(media.action, 'the video retains its playback settings action').not.toBeNull();
  expect(media.action!.width).toBeGreaterThan(20);
  expect(media.action!.left, 'action has its own column after the field').toBeGreaterThanOrEqual(
    media.control.right,
  );
  expect(media.action!.right).toBeLessThanOrEqual(media.row.right + 1);
  return rows;
}

for (const width of [1600, 1024]) {
  test(`Source defaults and Plate inputs keep shared columns with mixed names and media at ${String(width)}px`, async ({
    app,
  }, testInfo) => {
    const page = app.page;
    await page.setViewportSize({ width, height: 960 });
    await registerTemplate(page);
    const layer = await app.loadTemplate(TEMPLATE_ID);
    await app.selectLayerRow(layer);

    await app.inspector.locator('[data-open-template-defaults]').click();
    const defaults = page.getByRole('dialog', { name: 'Source defaults' });
    await expect(defaults).toBeVisible();
    await chooseSource(page, defaults.locator(`[data-defaults-select="${PLATE_IDS[0]}"]`), {
      input: 'Studio 1',
    });
    await chooseSource(page, defaults.locator(`[data-defaults-select="${PLATE_IDS[1]}"]`), {
      input: LONG_INPUT_NAME,
    });
    await chooseSource(page, defaults.locator(`[data-defaults-select="${PLATE_IDS[2]}"]`), {
      media: MEDIA_NAME,
      search: MEDIA_NAME,
    });
    // The station catalog publishes a discovered media entry once its binding is saved.
    await defaults.locator('[data-defaults-save]').click();
    await expect(defaults).toHaveCount(0);
    await app.inspector.locator('[data-open-template-defaults]').click();
    await expect(defaults).toBeVisible();
    await expect(
      defaults.getByRole('button', { name: `Playback: ${MEDIA_NAME}`, exact: true }),
    ).toBeVisible();
    await page.clock.install();
    const defaultGroup = defaults.locator('.cg-form-rows');
    await expect(defaultGroup.locator('.cg-form-row__label').nth(1)).toHaveText(LONG_PLATE_NAME);
    const longDefault = defaults.locator(`[data-defaults-select="${PLATE_IDS[1]}"]`);
    await expectTextClipped(longDefault.locator('.cg-source-label__name'));
    await fullValueOnHover(page, longDefault, LONG_INPUT_NAME);
    await expect(longDefault).toHaveAttribute('aria-expanded', 'false');
    await noValueTooltipOnHover(page, defaults.locator(`[data-defaults-select="${PLATE_IDS[0]}"]`));
    const defaultMeasurements = await measureColumns(defaultGroup);
    await defaults.screenshot({ path: testInfo.outputPath('source-defaults.png') });
    await defaults.getByRole('button', { name: `Playback: ${MEDIA_NAME}`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Playback', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await defaults.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(defaults).toHaveCount(0);

    const inspectorGroup = app.inspector.locator('[data-look-row="all"]');
    await expect(inspectorGroup.locator(`[data-look-binding="all:${PLATE_IDS[1]}"]`)).toContainText(
      LONG_INPUT_NAME,
    );
    await expect(inspectorGroup.locator('.cg-form-row__label').nth(1)).toHaveText(LONG_PLATE_NAME);
    const longInherited = inspectorGroup.locator(`[data-look-binding="all:${PLATE_IDS[1]}"]`);
    await expectTextClipped(longInherited.locator('.cg-choice-label__words'));
    await fullValueOnHover(page, longInherited, `Default (${LONG_INPUT_NAME})`);
    await expect(longInherited).toHaveAttribute('aria-expanded', 'false');
    await noValueTooltipOnHover(
      page,
      inspectorGroup.locator(`[data-look-binding="all:${PLATE_IDS[0]}"]`),
    );
    const inspectorMeasurements = await measureColumns(inspectorGroup);
    await app.inspector.screenshot({ path: testInfo.outputPath('inspector-plate-inputs.png') });
    await inspectorGroup
      .getByRole('button', { name: `Playback: ${MEDIA_NAME}`, exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Playback', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await testInfo.attach('source-field-columns.json', {
      body: JSON.stringify(
        { width, defaults: defaultMeasurements, inspector: inspectorMeasurements },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });
}

test('ordinary text and select fields reveal only clipped complete values on hover', async ({
  app,
}) => {
  const page = app.page;
  await page.setViewportSize({ width: 1024, height: 960 });
  const longValue = `${LONG_INPUT_NAME} — ${LONG_PLATE_NAME}`;
  await registerTemplate(page, [
    {
      id: 'hover-text',
      label: 'Programme heading',
      type: 'text',
      required: false,
      default: longValue,
    },
    {
      id: 'hover-select',
      label: 'Display mode',
      type: 'select',
      required: false,
      default: 'long',
      options: [
        { value: 'long', label: longValue },
        { value: 'short', label: 'On' },
      ],
    },
  ]);
  const layer = await app.loadTemplate(TEMPLATE_ID);
  await app.selectLayerRow(layer);
  const text = app.inspector.getByRole('textbox', { name: 'hover-text', exact: true });
  const select = app.inspector.getByRole('combobox', { name: 'hover-select', exact: true });
  await expect(text).toHaveValue(longValue);
  await expect(select).toHaveValue('long');
  // Native selects do not expose their text's scrollWidth; measure the selected label's ink.
  for (const control of [text, select]) {
    expect(
      await control.evaluate((element, value) => {
        const style = getComputedStyle(element);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = style.font;
        return context.measureText(value).width > element.clientWidth;
      }, longValue),
    ).toBe(true);
  }
  await page.clock.install();
  await fullValueOnHover(page, text, longValue);
  await fullValueOnHover(page, select, longValue);
  await text.fill('OK');
  await select.selectOption('short');
  await noValueTooltipOnHover(page, text);
  await noValueTooltipOnHover(page, select);
});
