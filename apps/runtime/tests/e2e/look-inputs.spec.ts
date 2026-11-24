import type { Locator, Page } from '@playwright/test';
import {
  aggregateBoundCompositionFields,
  type Composition,
  type Element,
  type Scene,
} from '@cg/shared-schema';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { buildTemplateLiveSources, pack } from '@cg/vcg-format';
import { E2E_PLAYOUT, expect, test } from './fixtures/runtime.js';

/**
 * ⭐ **SESSION BO — the Inspector's PLATE INPUTS section, driven through the real UI.**
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Session BM-2 built this section and shipped no E2E for it, and said so. Three defects
 * followed that no unit suite could see, because each lived in a SEAM rather than in a
 * component: the mock shim dropping a field, retention dropping the map, and a badge asserting
 * a condition nothing tested. The panel is exercised in jsdom against a hand-built item and the
 * bridge at the AMCP wire — so the one thing never exercised was the operator's actual path.
 *
 * This drives that path: register a looks template, load it, select the row, and read what the
 * panel says. Maps the `#### Scenario`s of "a row composes its looks' inputs" and `B-156`'s
 * "the badge states the row's real state".
 *
 * ⚠ Against the offline MockRuntime, which shares the bridge's validators — so a refusal here
 * is the one a real station gives. What it cannot show is anything about the PLANT.
 */

const LOOKS_TPL = 'tpl-e2e-looks';
const FLAT_TPL = 'tpl-e2e-flat';
const LEGACY_LOOKS_TPL = 'tpl-e2e-legacy-looks';

const lookFixtureResolution = { width: 1920, height: 1080 };
const lookFixtureRange = { in: 0, out: 50 };
const lookFixtureElement = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const lookFixtureTransform = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  anchor: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
});

/** The chan-ghab pattern: two shared text fields, two independent fields per managed Look. */
function lookFieldScope(ids: readonly string[]): {
  fields: Scene['fields'];
  bindings: Scene['bindings'];
  elements: Element[];
} {
  return {
    fields: ids.map((id) => ({ id, label: id, type: 'text', required: false, default: id })),
    bindings: ids.map((id) => ({
      fieldId: id,
      target: { kind: 'text', elementId: `text-${id}`, placeholder: `{{${id}}}` },
    })),
    elements: ids.map((id, index) => ({
      ...lookFixtureElement,
      id: `text-${id}`,
      name: id,
      type: 'text',
      transform: lookFixtureTransform(80, 80 + index * 60, 320, 48),
      text: `{{${id}}}`,
      font: {
        family: 'sans-serif',
        weight: 400,
        style: 'normal',
        size: 32,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start',
      direction: 'ltr',
      fitMode: 'autosize',
      overflow: 'ellipsis',
    })),
  };
}

const lookFixtureLayer = (id: string, children: Element[]): Composition['layers'][number] => ({
  id,
  name: id,
  visible: true,
  locked: false,
  blendMode: 'normal',
  children,
});

function lookFieldScene(presetNotesOnly = false): Scene {
  const shared = lookFieldScope(presetNotesOnly ? [] : ['common-top', 'common-bottom']);
  const looks = [1, 2, 3].map((index) => ({
    id: `look-${String(index)}`,
    name: `Preset ${String(index)}`,
    instanceId: `instance-${String(index)}`,
    entered: { mode: 'cut' as const },
  }));
  const compositions: Composition[] = looks.map((look, index) => {
    const fieldIds = presetNotesOnly
      ? ['preset-note']
      : [`plate-1-${String(index + 1)}`, `plate-2-${String(index + 1)}`];
    const scope = lookFieldScope(presetNotesOnly && index === 2 ? [] : fieldIds);
    const plates: Element[] = [1, 2].map((plate) => ({
      ...lookFixtureElement,
      id: `${look.id}-plate-${String(plate)}`,
      name: `Plate ${String(plate)}`,
      type: 'video-placeholder',
      routeKey: `plate-${String(plate)}`,
      transform: lookFixtureTransform(80 + 880 * (plate - 1), 260, 800, 480),
    }));
    return {
      id: `comp-${look.id}`,
      name: look.name,
      resolution: lookFixtureResolution,
      frameRange: lookFixtureRange,
      editorBackdrop: 'transparent',
      layers: [lookFixtureLayer(`layer-${look.id}`, [...plates, ...scope.elements])],
      fields: scope.fields,
      bindings: scope.bindings,
    };
  });
  const instances: Element[] = looks.map((look) => ({
    ...lookFixtureElement,
    id: look.instanceId,
    name: look.name,
    type: 'composition',
    compositionId: `comp-${look.id}`,
    transform: lookFixtureTransform(
      0,
      0,
      lookFixtureResolution.width,
      lookFixtureResolution.height,
    ),
  }));
  const date = '2026-11-10T00:00:00Z';
  return {
    schemaVersion: 1,
    id: 'source-legacy-looks',
    name: 'Legacy Looks',
    templateType: 'lower-third',
    resolution: lookFixtureResolution,
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: lookFixtureRange,
    editorBackdrop: 'transparent',
    layers: [lookFixtureLayer('root', [...instances, ...shared.elements])],
    fields: shared.fields,
    bindings: shared.bindings,
    fonts: [],
    compositions,
    lookGroups: [{ id: 'looks', looks, defaultLookId: 'look-1' }],
    metadata: { createdAt: date, updatedAt: date },
  };
}

async function generatedLookPage(scene: Scene): Promise<string> {
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
  return html;
}

async function registerLegacyLookTemplate(page: Page): Promise<void> {
  const scene = lookFieldScene();
  const html = await generatedLookPage(scene);
  const fields = aggregateBoundCompositionFields(scene, scene);
  const liveSources = buildTemplateLiveSources(scene);
  const template = {
    templateId: LEGACY_LOOKS_TPL,
    name: scene.name,
    templateType: scene.templateType,
    fields: [...fields.fields],
    groups: [...fields.groups],
    liveSources: {
      ...liveSources,
      looks: liveSources.looks?.map(({ instanceId: _instanceId, ...look }) => look),
    },
  };
  await page.evaluate(
    async ({ template, html }) => {
      await window.cg.templates.import({ template, html });
      const reads: { templateId: string; channel: number | undefined }[] = [];
      Object.assign(window, { legacyLookPageReads: reads });
      const readPage = window.cg.templates.page;
      window.cg.templates.page = (templateId, channel) => {
        if (templateId !== template.templateId) return readPage(templateId, channel);
        reads.push({ templateId, channel });
        return Promise.resolve({ kind: 'page', html, source: 'bridge' });
      };
    },
    { template, html },
  );
}

/** A template with two looks over two plates — the shape the section exists for. */
async function registerLooksTemplate(app: { page: Page }): Promise<void> {
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    const left = { x: 0, y: 0, width: 960, height: 540 };
    const right = { x: 960, y: 0, width: 960, height: 540 };
    const guestGroup = (instanceId: string, name: string, label: string) => ({
      instanceId,
      name,
      label,
      compositionId: 'same-guest-card',
      aggregate: {
        fields: [{ id: 'guest', type: 'text', label: 'Guest', required: false, default: label }],
        groups: [],
      },
    });
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'debate',
        sourceFileName: 'debate.vcg',
        templateType: 'lower-third',
        fields: [
          {
            id: 'headline',
            type: 'text',
            label: 'Headline',
            required: false,
            default: 'Shared headline',
          },
        ],
        groups: [
          guestGroup('two-instance', 'two-card', 'Two box guest'),
          guestGroup('solo-instance', 'solo-card', 'Solo guest'),
          guestGroup('shared-instance', 'shared-card', 'Shared guest'),
        ],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [
            { elementId: 'el-1', sourceId: 'l-1', rect: left, dynamic: false },
            { elementId: 'el-2', sourceId: 'l-2', rect: right, dynamic: false },
          ],
          looks: [
            {
              id: 'two',
              name: '2-box',
              instanceId: 'two-instance',
              entered: { mode: 'cut' },
              rects: { 'l-1': left, 'l-2': right },
            },
            {
              id: 'solo',
              name: 'Solo',
              instanceId: 'solo-instance',
              entered: { mode: 'cut' },
              rects: { 'l-1': { x: 0, y: 0, width: 1920, height: 1080 } },
            },
            {
              id: 'three',
              name: '3-box',
              instanceId: 'three-instance',
              entered: { mode: 'cut' },
              rects: { 'l-1': left, 'l-2': right },
            },
            {
              id: 'four',
              name: '4-box',
              instanceId: 'four-instance',
              entered: { mode: 'cut' },
              rects: { 'l-1': left, 'l-2': right },
            },
          ],
          defaultLookId: 'two',
        },
      },
      html: '<!doctype html><html><body>debate</body></html>',
    });
  }, LOOKS_TPL);
}

/** …and one with NO looks, which must keep the flat editor it has always had. */
async function registerFlatTemplate(app: { page: Page }): Promise<void> {
  await app.page.evaluate(async (templateId) => {
    const w = window as unknown as {
      cg: { templates: { import: (req: { template: unknown; html: string }) => Promise<unknown> } };
    };
    await w.cg.templates.import({
      template: {
        templateId,
        name: 'flat',
        sourceFileName: 'flat.vcg',
        templateType: 'lower-third',
        fields: [],
        liveSources: {
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [
            {
              elementId: 'el-1',
              sourceId: 'guest-1',
              rect: { x: 0, y: 0, width: 640, height: 360 },
              dynamic: false,
            },
          ],
        },
      },
      html: '<!doctype html><html><body>flat</body></html>',
    });
  }, FLAT_TPL);
}

async function expectPresetStatusFits(preset: Locator, badge: Locator, priorHeight: number) {
  await expect(badge).toBeVisible();
  const geometry = await preset.evaluate((button) => {
    const caption = button.querySelector('.cg-look-preset__caption');
    const status = button.querySelector('[data-look-badge]');
    if (caption === null || status === null) throw new Error('Missing preset caption or status');
    const frame = button.getBoundingClientRect();
    const textBounds = (element: Node) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const fits = (text: DOMRect) =>
      text.left >= frame.left &&
      text.right <= frame.right &&
      text.top >= frame.top &&
      text.bottom <= frame.bottom;
    const peers = [...(button.parentElement?.querySelectorAll('[data-look-tab]') ?? [])];
    const row = peers.filter((peer) => Math.abs(peer.getBoundingClientRect().top - frame.top) < 1);
    return {
      height: frame.height,
      equalRowHeight: row.every(
        (peer) => Math.abs(peer.getBoundingClientRect().height - frame.height) < 1,
      ),
      textFits: fits(textBounds(caption)) && fits(textBounds(status)),
      onSeparateLines:
        caption.getBoundingClientRect().bottom <= status.getBoundingClientRect().top + 0.5,
    };
  });
  expect(geometry).toMatchObject({ equalRowHeight: true, textFits: true, onSeparateLines: true });
  expect(geometry.height).toBeGreaterThanOrEqual(Math.max(54, priorHeight - 0.5));
}

async function expectNestedSafeGuideBorders(
  settings: Locator,
  labels: { frameToggle: string; guideBorders: string; actionGuide: string },
  direction: 'ltr' | 'rtl',
) {
  const frame = settings.getByRole('checkbox', { name: labels.frameToggle, exact: true });
  const borders = settings.getByRole('group', { name: labels.guideBorders, exact: true });
  await expect(frame).toBeVisible();
  await expect(borders.getByRole('checkbox')).toHaveCount(4);
  const geometry = await borders.evaluate(
    (group, frameId) => {
      const frameInput = document.getElementById(frameId ?? '');
      const frameLabel = frameInput instanceof HTMLInputElement ? frameInput.labels?.item(0) : null;
      if (frameLabel == null) throw new Error('Missing Show frame label');
      const frameBox = frameLabel.getBoundingClientRect();
      const groupBox = group.getBoundingClientRect();
      const style = getComputedStyle(group);
      const rtl = style.direction === 'rtl';
      const start = (box: DOMRect) => (rtl ? -box.right : box.left);
      const children = [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      return {
        direction: style.direction,
        lineStyle: rtl ? style.borderRightStyle : style.borderLeftStyle,
        lineWidth: parseFloat(rtl ? style.borderRightWidth : style.borderLeftWidth),
        oppositeLineWidth: parseFloat(rtl ? style.borderLeftWidth : style.borderRightWidth),
        underFrame: groupBox.top >= frameBox.bottom - 0.5,
        lineIndent: start(groupBox) - start(frameBox),
        labelIndents: children.map((child) => {
          const label = child.labels?.item(0);
          if (label == null) throw new Error('Missing safe guide border label');
          return start(label.getBoundingClientRect()) - start(groupBox);
        }),
      };
    },
    await frame.getAttribute('id'),
  );
  expect(geometry).toMatchObject({
    direction,
    lineStyle: 'solid',
    oppositeLineWidth: 0,
    underFrame: true,
  });
  expect(geometry.lineWidth).toBeGreaterThan(0);
  expect(geometry.lineIndent).toBeGreaterThan(1);
  expect(geometry.labelIndents).toHaveLength(4);
  for (const indent of geometry.labelIndents) expect(indent).toBeGreaterThan(geometry.lineWidth);

  const label = borders.getByText(labels.actionGuide, { exact: true });
  const action = label.getByRole('checkbox');
  const frameChecked = await frame.isChecked();
  const actionChecked = await action.isChecked();
  await label.click();
  await expect(action).toBeChecked({ checked: !actionChecked });
  await expect(frame).toBeChecked({ checked: frameChecked });
  await label.click();
  await expect(action).toBeChecked({ checked: actionChecked });
}

test('highlights the selected preset and localizes its PVW state and Safe areas tooltip', async ({
  app,
}) => {
  const { page } = app;
  await registerLooksTemplate(app);
  const layer = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(layer);
  await app.showMonitors();

  const two = page.locator('[data-look-tab="two"]');
  const solo = page.locator('[data-look-tab="solo"]');
  const appearance = (preset: typeof two) =>
    preset.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.borderTopColor, style.boxShadow];
    });
  await expect(two).toHaveAttribute('aria-pressed', 'true');
  await expect(solo).toHaveAttribute('aria-pressed', 'false');
  const standardRadius = await two.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--r-radius-sm').trim(),
  );
  await expect(two).toHaveCSS('border-start-start-radius', standardRadius);
  await expect(solo).toHaveCSS('border-start-start-radius', standardRadius);
  await expect(two.locator('.lucide-check')).toBeVisible();
  await expect(solo.locator('.lucide-check')).toHaveCount(0);
  const active = await appearance(two);
  const idle = await appearance(solo);
  expect(active[0]).not.toBe(idle[0]);
  expect(active[1]).not.toBe(idle[1]);
  expect(active[2]).not.toBe(idle[2]);
  await expect(two.locator('[data-look-badge]')).toHaveCount(0);
  const readyHeight = (await two.boundingBox())!.height;

  await solo.click();
  await page.mouse.move(0, 0);
  await expect(solo).toHaveAttribute('aria-pressed', 'true');
  await expect(solo.locator('.lucide-check')).toBeVisible();
  await expect(two.locator('.lucide-check')).toHaveCount(0);
  await expect.poll(() => appearance(solo)).toEqual(active);
  await expect.poll(() => appearance(two)).toEqual(idle);
  await expect(solo.locator('[data-look-badge]')).toHaveCount(0);

  await two.click();
  await page.mouse.move(0, 0);
  await app.layerRow(layer).getByRole('button', { name: 'ON PVW', exact: true }).click();
  const badge = two.locator('[data-look-badge="rehearsing"]');
  const guides = page.locator('[data-monitor-safe-areas]');
  await expect(badge).toHaveText('SHOWING IN PVW');
  await expectPresetStatusFits(two, badge, readyHeight);
  await expect(guides).toHaveAttribute(
    'title',
    'Safe areas · Action 93% · Graphics 90% · Preview only',
  );
  await expect.poll(() => appearance(two)).toEqual(active);
  await page.getByRole('button', { name: 'Safe area settings', exact: true }).click();
  const englishGuides = page.getByRole('dialog', { name: 'Safe area settings', exact: true });
  await expectNestedSafeGuideBorders(
    englishGuides,
    { frameToggle: 'Show frame', guideBorders: 'Safe area borders', actionGuide: '93% Action' },
    'ltr',
  );
  await englishGuides
    .getByRole('button', { name: 'Close safe area settings', exact: true })
    .click();

  for (const language of [
    {
      code: 'fa',
      settings: 'Open Station setup',
      general: 'General',
      close: 'بستن',
      badge: 'در حال نمایش در PVW',
      inspector: 'ویژگی‌ها',
      disclosures: ['جزئیات لایه', 'موقعیت', 'زمان‌بندی'],
      defaultLabel: /^\u2068?پیشفرض/,
      guides: 'محدوده‌های امن · عمل ۹۳٪ · گرافیک ۹۰٪ · فقط در پیش‌نمایش',
      guideSettings: 'تنظیمات محدوده‌های امن',
      guideHelp: 'دربارهٔ محدوده‌های امن',
      closeGuideSettings: 'بستن تنظیمات محدودهٔ امن',
      help16x9: /برای تصویر تمام‌صفحه با نسبت ۱۶:۹.*EBU R95/,
      help4x3: /SMPTE ST 2046-1.*۵۷۶ و ۴۸۰ خطی/,
      frameToggle: 'نمایش محدوده',
      guideBorders: 'حاشیه‌های محدودهٔ امن',
      actionGuide: 'محدودهٔ عمل ۹۳٪',
    },
    {
      code: 'ar',
      settings: 'باز کردن تنظیمات ایستگاه',
      general: 'عمومی',
      close: 'إغلاق',
      badge: 'معروض في PVW',
      inspector: 'لوحة الخصائص',
      disclosures: ['تفاصيل الطبقة', 'الموضع', 'التوقيت'],
      defaultLabel: /^\u2068?افتراضي/,
      guides: 'المناطق الآمنة · الحركة ٩٣٪ · الرسومات ٩٠٪ · للمعاينة فقط',
      guideSettings: 'إعدادات المنطقة الآمنة',
      guideHelp: 'حول المناطق الآمنة',
      closeGuideSettings: 'إغلاق إعدادات المناطق الآمنة',
      help16x9: /للعرض بملء الشاشة بنسبة ١٦:٩.*EBU R95/,
      help4x3: /SMPTE ST 2046-1.*٥٧٦ و٤٨٠ خطًا/,
      frameToggle: 'إظهار الإطار',
      guideBorders: 'حدود المنطقة الآمنة',
      actionGuide: 'منطقة الحركة ٩٣٪',
    },
  ] as const) {
    await page.getByRole('button', { name: language.settings, exact: true }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('tab', { name: language.general, exact: true }).click();
    await settings.locator('#cg-interface-language').selectOption(language.code);
    await settings.getByRole('button', { name: language.close, exact: true }).last().click();
    await expect(badge).toHaveText(language.badge);
    const inspector = page.getByRole('complementary', { name: language.inspector });
    await expect(inspector).toBeVisible();
    await expectPresetStatusFits(two, badge, readyHeight);
    const timing = await inspector
      .getByRole('button', { name: language.disclosures[2], exact: true })
      .boundingBox();
    const position = await inspector
      .getByRole('button', { name: language.disclosures[1], exact: true })
      .boundingBox();
    expect(timing!.y + timing!.height).toBeLessThan(position!.y);
    await expect(
      page.locator('[data-look-binding="two:l-1"] [data-source-label="choice"]'),
    ).toHaveText(language.defaultLabel);
    await expect(guides).toHaveAttribute('title', language.guides);
    await page.getByRole('button', { name: language.guideSettings, exact: true }).click();
    const guideSettings = page.getByRole('dialog', { name: language.guideSettings, exact: true });
    const help = guideSettings.locator('details').filter({ hasText: language.guideHelp });
    await help.locator('summary').click();
    await guideSettings.getByRole('radio', { name: '16:9', exact: true }).click();
    await expect(help).toContainText(language.help16x9);
    await guideSettings.getByRole('radio', { name: '4:3', exact: true }).click();
    await expect(help).toContainText(language.help4x3);
    await expectNestedSafeGuideBorders(guideSettings, language, 'rtl');
    if (language.code === 'fa') {
      await expect(guideSettings.getByText('ویرایش محدوده', { exact: true })).toBeVisible();
      await expect(guideSettings.getByLabel('رنگ محدوده', { exact: true })).toBeVisible();
    }
    await guideSettings
      .getByRole('button', { name: language.closeGuideSettings, exact: true })
      .click();
    for (const name of language.disclosures) {
      const button = page.getByRole('button', { name, exact: true });
      if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button.locator('.lucide-chevron-right')).toHaveCSS(
        'transform',
        'matrix(-1, 0, 0, 1, 0, 0)',
      );
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(button.locator('.lucide-chevron-down')).toHaveCSS('transform', 'none');
    }
    await expect(two).toHaveAttribute('aria-pressed', 'true');
    await expect(two.locator('bdi')).toHaveText('2-box');
  }
});

test('PLATE INPUTS lists every look with its own frames, and the flat template keeps its editor', async ({
  app,
}) => {
  await registerLooksTemplate(app);
  await registerFlatTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Plate inputs"]');
  await expect(looks).toBeVisible();
  await expect(looks.getByRole('heading', { name: 'Plate inputs', exact: true })).toBeVisible();
  await expect(
    looks.getByText('Editing plate inputs does not take them on air.', { exact: true }),
  ).toBeVisible();

  /*
    🔴 `INSPECTOR-DELTA` §4 — ONE LOOK AT A TIME, BEHIND TABS, which is what the reference
    draws (`05-row-inspector.html`: `div.look-tabs` of `aria-pressed` buttons, then a
    `#look-mappings` list holding only the selected look's frames). This asserted BOTH looks
    visible at once — "the whole point … side by side" — and that shape is deliberately gone.

    ⚠ RE-POINTED, NOT RELAXED. Every look must still be REACHABLE and must still offer only
    its own frames; the tab press is the difference. And the composing-while-off-air need the
    old comment named is served better than before, not worse: a look holding an unapplied
    edit now marks its own tab, so an edit on a look you have navigated away from still
    announces itself instead of merely being further down a scroll.
  */
  await expect(looks.locator('[data-look-tab="two"]')).toBeVisible();
  await expect(looks.locator('[data-look-tab="solo"]')).toBeVisible();
  await expect(looks.locator('[data-look-tab="three"]')).toBeVisible();
  await expect(looks.locator('[data-look-tab="four"]')).toBeVisible();

  // B-401 — the selected/live wording stays inside an equal preset cell. Selecting another
  // look must not stretch that button or push it onto a different row.
  const presetGeometry = async (): Promise<{ x: number; y: number; width: number }[]> =>
    looks.locator('[data-look-tab]').evaluateAll((tabs) =>
      tabs.map((tab) => {
        const rect = tab.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      }),
    );
  const beforeSelection = await presetGeometry();
  expect(beforeSelection).toHaveLength(4);
  expect(new Set(beforeSelection.map(({ y }) => Math.round(y))).size).toBe(1);
  expect(Math.max(...beforeSelection.map(({ width }) => width))).toBeLessThanOrEqual(
    Math.min(...beforeSelection.map(({ width }) => width)) + 1,
  );

  // The LIVE look is the one open on arrival, and it offers only its own frames.
  await expect(looks.locator('[data-look-row="two"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="two:l-1"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="two:l-2"]')).toBeVisible();

  // Press the other tab: `solo` has `l-1` and, by construction, no `l-2`.
  await looks.locator('[data-look-tab="solo"]').click();
  await expect(looks.locator('[data-look-binding="solo:l-1"]')).toBeVisible();
  await expect(looks.locator('[data-look-binding="solo:l-2"]')).toHaveCount(0);
  /*
    ⚠ THE POSITIVE CONTROL. `solo:l-2` being absent is TRUE and WORTHLESS if the tab press did
    nothing — so the switch is proved by the row only `solo` has, and by `two`'s going away.
  */
  await expect(looks.locator('[data-look-row="solo"]')).toBeVisible();
  await expect(looks.locator('[data-look-row="two"]')).toHaveCount(0);
  expect(await presetGeometry()).toEqual(beforeSelection);

  // …and back, so the section is not a one-way trip. The rest of this test reads `two`'s
  // own control, so it is also the state the assertions below need.
  await looks.locator('[data-look-tab="two"]').click();
  await expect(looks.locator('[data-look-binding="two:l-2"]')).toBeVisible();

  /*
    §3d — THE DEFAULT IS NAMED INSIDE THE CONTROL THAT INHERITS IT. The blank option used to
    read "— template default —" and the section pointed UPWARD at the LIVE PLATES list for what
    that meant. A default the operator cannot see is a value they cannot reason about.

    ⚠ **ASSERTED ON THE BLANK OPTION, NOT ON THE `<select>`, and that is the repair rather than
    an incidental tidy-up.** `toContainText` on a `<select>` matches the CONCATENATION of every
    option's text — so this passed on a substring of the blank option while the other options
    (catalog source NAMES) were free to change underneath it, and it would equally have passed
    on a source happening to be called "Template default". Addressing the option directly means
    the assertion fails when the thing it is about changes, and only then.

    The value is `''` — `PLATE_UNASSIGNED`, the blank option's own value — which is a stable
    handle in a way its LABEL is not: this spec is red today precisely because that label was
    renamed (`— template default (none set) —` → `Default (none set)`).

    ⚠ `PLAYOUT-SOURCES-01` — the control is the source picker now, and the blank option is the
    call site's `Default (…)` CHOICE: while the plate inherits, the field's value is `''` and its
    face IS that choice (`data-source-label="choice"`), addressed directly for the reason above.
  */
  const inheriting = looks.locator('[data-look-binding="two:l-1"]');
  await expect(inheriting).toHaveAttribute('data-picker-value', '');
  await expect(inheriting.locator('[data-source-label="choice"]')).toHaveText(/^Default \(/);

  /*
    ⚠ §2.1 — A TEMPLATE WITH NO LOOKS GETS NO PLATE INPUTS SECTION, and must therefore keep its
    flat editor. This is the case that makes the section conditional rather than a replacement:
    it is the commonest installation, and it has no other way to point a plate.
  */
  const flatRow = await app.loadTemplate(FLAT_TPL);
  await app.selectLayerRow(flatRow);
  await expect(app.inspector.locator('[aria-label="Plate inputs"]')).toHaveCount(0);
  await expect(app.inspector.locator('[aria-label="Live plates"]')).toBeVisible();
});

for (const legacy of [false, true]) {
  test(`a reused frame has one title across presets (${legacy ? 'retained page' : 'VCG import'})`, async ({
    app,
  }) => {
    const scene = lookFieldScene(true);
    const frameFields = lookFieldScope(['frame-title']);
    const frame: Composition = {
      id: 'guest-frame',
      name: 'Guest frame',
      resolution: lookFixtureResolution,
      frameRange: lookFixtureRange,
      editorBackdrop: 'transparent',
      layers: [
        lookFixtureLayer('frame-artwork', [
          {
            ...lookFixtureElement,
            id: 'frame-plate',
            name: 'Frame plate',
            type: 'video-placeholder',
            routeKey: 'plate-1',
            transform: lookFixtureTransform(0, 0, 1920, 1080),
          },
          ...frameFields.elements.map((element) => ({ ...element, zIndex: 1 })),
        ]),
      ],
      fields: frameFields.fields,
      bindings: frameFields.bindings,
    };
    for (const preset of (scene.compositions ?? []).slice(0, 2)) {
      const layer = preset.layers[0]!;
      const plate = layer.children[0]!;
      layer.children[0] = {
        ...lookFixtureElement,
        id: `${preset.id}-guest`,
        type: 'composition',
        name: 'Guest',
        compositionId: frame.id,
        transform: plate.transform,
      };
    }
    scene.compositions?.push(frame);

    const templateId = scene.id;
    if (legacy) {
      const html = await generatedLookPage(scene);
      await app.page.evaluate(
        ({ templateId, html }) => {
          const get = window.cg.templates.get;
          const page = window.cg.templates.page;
          window.cg.templates.get = async (request) => {
            const info = await get(request);
            if (info?.templateId !== templateId) return info;
            const { sharedFrameTitles: _titles, ...legacyInfo } = info;
            return legacyInfo;
          };
          window.cg.templates.page = (id, channel) =>
            id === templateId
              ? Promise.resolve({ kind: 'page', html, source: 'bridge' })
              : page(id, channel);
        },
        { templateId, html },
      );
    }
    const bytes = await pack({
      scene,
      manifestExtras: {
        id: templateId,
        name: scene.name,
        authoring: {
          designerVersion: '0.0.0',
          createdAt: scene.metadata.createdAt,
          exportedAt: scene.metadata.updatedAt,
        },
        compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
        fontDeps: [],
        assetIndex: [],
      },
      indexHtml: '<!doctype html><html><body></body></html>',
      cgJs: '',
      cgCss: '',
    });
    const row = await app.importVcg('shared-frame-titles.vcg', bytes, 59);
    if (!legacy) {
      await app.page.getByRole('button', { name: 'Open templates', exact: true }).click();
      const catalogue = app.page.getByRole('dialog', { name: /^Templates/ });
      const listing = catalogue.getByRole('button', {
        name: 'Select shared frame titles',
        exact: true,
      });
      // One shared frame title and two independent values with the same preset-local field id.
      await expect(listing.getByText('3 fields', { exact: true })).toBeVisible();
      await listing.click();
      const details = catalogue.getByRole('complementary', { name: 'Template details' });
      await expect(details.locator('dt:text-is("Text fields") + dd')).toHaveText('3');
      await catalogue.locator('[data-modal-role="cancel"]').click();
    }
    await app.selectLayerRow(row);

    const selectPreset = (number: number) =>
      app.inspector.locator(`[data-look-tab="look-${String(number)}"]`).click();
    const title = app.inspector.getByRole('textbox', { name: 'frame-title', exact: true });
    const local = app.inspector.getByRole('textbox', { name: 'preset-note', exact: true });
    await expect(title).toHaveValue('frame-title');
    await title.fill('تایتل تازه');
    await local.fill('متن فقط در پریست یک');
    await selectPreset(2);
    await expect(title).toHaveValue('تایتل تازه');
    await expect(local).toHaveValue('preset-note');
    await selectPreset(3);
    await expect(title).toHaveCount(0);
    await selectPreset(2);
    await app.discardEdits();
    await expect(title).toHaveValue('frame-title');
    await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
    await expect(app.layerRow(row)).toContainText('ON AIR');
    const appliedFields = () =>
      app.page.evaluate(
        async (id) =>
          (await window.cg.stack.snapshot()).find((item) => item.templateId === id)?.fields,
        templateId,
      );
    await title.fill('عنوان ذخیره‌شده');
    expect(await appliedFields()).toMatchObject({
      'Preset 1': { Guest: { 'frame-title': 'frame-title' } },
      'Preset 2': { Guest: { 'frame-title': 'frame-title' } },
    });
    await app.inspector
      .getByRole('button', { name: 'Apply staged edits to the on-air row' })
      .click();
    await expect(app.inspector.getByLabel('unapplied edits', { exact: true })).toHaveCount(0);
    expect(await appliedFields()).toMatchObject({
      'Preset 1': { Guest: { 'frame-title': 'عنوان ذخیره‌شده' } },
      'Preset 2': { Guest: { 'frame-title': 'عنوان ذخیره‌شده' } },
    });
    await selectPreset(1);
    await expect(title).toHaveValue('عنوان ذخیره‌شده');
    await expect(local).toHaveValue('preset-note');
  });
}

test('the selected look shows only its own dynamic fields alongside shared fields', async ({
  app,
}) => {
  await registerLooksTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const inspector = app.inspector;
  const tabs = inspector.getByRole('group', { name: 'Look to edit' });
  const two = inspector.getByRole('region', { name: 'Two box guest fields' });
  const solo = inspector.getByRole('region', { name: 'Solo guest fields' });
  const shared = inspector.getByRole('region', { name: 'Shared guest fields' });
  await expect(two).toBeVisible();
  await expect(solo).toHaveCount(0);
  await expect(shared).toBeVisible();
  await expect(inspector.getByLabel('headline', { exact: true })).toBeVisible();
  await two.getByLabel('guest', { exact: true }).fill('مهمان اول');

  await tabs.locator('[data-look-tab="solo"]').click();
  await expect(solo).toBeVisible();
  await expect(two).toHaveCount(0);
  await expect(shared).toBeVisible();
  await solo.getByLabel('guest', { exact: true }).fill('مهمان دوم');

  await tabs.locator('[data-look-tab="three"]').click();
  await expect(two).toHaveCount(0);
  await expect(solo).toHaveCount(0);
  await expect(shared).toBeVisible();
  await expect(inspector.getByLabel('headline', { exact: true })).toBeVisible();

  await tabs.locator('[data-look-tab="two"]').click();
  await expect(two.getByLabel('guest', { exact: true })).toHaveValue('مهمان اول');
  await tabs.locator('[data-look-tab="solo"]').click();
  await expect(solo.getByLabel('guest', { exact: true })).toHaveValue('مهمان دوم');
});

test('legacy catalogue recovers per-preset fields from the retained page and keeps shared fields', async ({
  app,
}) => {
  await registerLegacyLookTemplate(app.page);
  const row = await app.loadTemplate(LEGACY_LOOKS_TPL);
  await app.selectLayerRow(row);
  const inspector = app.inspector;
  const field = (name: string) => inspector.getByRole('textbox', { name, exact: true });
  const selectLook = (index: number) =>
    inspector.locator(`[data-look-tab="look-${String(index)}"]`).click();
  for (const index of [1, 2, 3]) {
    if (index !== 1) await selectLook(index);
    await expect(field('common-top')).toBeVisible();
    await expect(field('common-bottom')).toBeVisible();
    for (const preset of [1, 2, 3]) {
      const count = preset === index ? 1 : 0;
      await expect(field(`plate-1-${String(preset)}`)).toHaveCount(count);
      await expect(field(`plate-2-${String(preset)}`)).toHaveCount(count);
    }
    await field(`plate-1-${String(index)}`).fill(`draft ${String(index)}`);
  }
  await selectLook(1);
  await expect(field('plate-1-1')).toHaveValue('draft 1');
  await selectLook(2);
  await expect(field('plate-1-2')).toHaveValue('draft 2');
  await selectLook(3);
  await expect(field('plate-1-3')).toHaveValue('draft 3');
  const reads = await app.page.evaluate(
    () => (window as unknown as { legacyLookPageReads: unknown[] }).legacyLookPageReads,
  );
  expect(reads).toEqual([{ templateId: LEGACY_LOOKS_TPL, channel: 1 }]);
});

test('🔴 B-156 — a LOADED row does not claim air or repeat selection as a sentence', async ({
  app,
}) => {
  /*
    The owner's report, through the real UI: `ON AIR NOW` in the Inspector beside `READY` in the
    layer table. The badge was gated on which look the ROW IS SET TO, which is true the moment a
    row is loaded — it never tested whether anything was playing.
  */
  await registerLooksTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const badge = app.inspector.locator('[data-look-live="two"]');
  await expect(badge).toHaveCount(0);
  await expect(app.inspector.locator('[data-look-tab="two"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('🔴 FIELD-FIXES-01 C — a REFUSED take does not claim air for its look; control: a take that lands does', async ({
  app,
}) => {
  /*
    The owner's report of 2026-09-26: `ERROR` on the row, and `look-2 ON AIR NOW` in its Inspector
    over a take the server had refused. The refusal comes from the mock's one-shot seam, shaped as
    the bridge records it.
  */
  await registerLooksTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);
  const preset = app.inspector.locator('[data-look-tab="two"]');
  const readyHeight = (await preset.boundingBox())!.height;
  await app.page.evaluate(() => {
    (window as unknown as { CG_E2E_REFUSE_NEXT_TAKE?: unknown }).CG_E2E_REFUSE_NEXT_TAKE = {
      code: 'amcp-403',
      command: 'PLAY 1-60 DECKLINK DEVICE 1',
    };
  });
  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row)).toContainText('ERROR');

  const badge = app.inspector.locator('[data-look-live="two"]');
  await expect(badge).toHaveCount(0);

  // CONTROL — the take that lands: the same badge now makes the claim.
  await app.layerRow(row).getByRole('button', { name: 'PLAY' }).click();
  await expect(app.layerRow(row)).toContainText('ON AIR');
  const onAirBadge = app.inspector.locator('[data-look-live="two"]');
  await expect(onAirBadge).toContainText('ON AIR NOW');
  await expect(onAirBadge).toHaveAttribute('data-look-badge', 'on-air');
  await expectPresetStatusFits(preset, onAirBadge, readyHeight);
});

test.describe('D-218 Designer-authored Focus', () => {
  test.use({ playoutSources: E2E_PLAYOUT });

  test('runs the authored direct effect in PVW and keeps PGM independent', async ({ app }) => {
    const page = app.page;
    const templateId = 'tpl-designer-focus';
    const scene = lookFieldScene();
    const group = scene.lookGroups?.[0];
    const origin = group?.looks[0];
    if (group === undefined || origin === undefined) throw new Error('Missing Focus fixture');
    origin.presetFocus = {
      targets: { 'plate-1': 'look-2', 'plate-2': 'look-3' },
      effects: {
        focus: { motion: 'cut', fade: false, durationMs: 400 },
        switch: { mode: 'fade', direction: 'left', durationMs: 1000 },
      },
    };
    for (const [compositionIndex, plate] of [
      [1, 'plate-1'],
      [2, 'plate-2'],
    ] as const) {
      const layer = scene.compositions?.[compositionIndex]?.layers[0];
      if (layer === undefined) throw new Error('Missing Focus destination');
      layer.children = layer.children.flatMap<Element>((child) => {
        if (child.type !== 'video-placeholder') return [child];
        if (child.routeKey !== plate) return [];
        return [{ ...child, transform: lookFixtureTransform(0, 0, 1920, 1080) }];
      });
    }

    const liveSources = buildTemplateLiveSources(scene);
    expect(liveSources.looks?.[0]?.presetFocus).toEqual(origin.presetFocus);
    const html = await generatedLookPage(scene);
    await page.evaluate(
      async ({ templateId, liveSources, html }) => {
        await window.cg.sources.setConfig({ layerRange: { start: 60, end: 79 } });
        await window.cg.sources.setAssignments({
          assignments: [
            { templateId, plateId: 'plate-1', sourceId: 'in-studio-1' },
            { templateId, plateId: 'plate-2', sourceId: 'in-studio-2' },
          ],
        });
        await window.cg.templates.import({
          template: {
            templateId,
            name: 'Designer Focus',
            templateType: 'lower-third',
            fields: [],
            liveSources,
          },
          html,
        });
        const readPage = window.cg.templates.page;
        window.cg.templates.page = (id, channel) =>
          id === templateId
            ? Promise.resolve({ kind: 'page', html, source: 'bridge' })
            : readPage(id, channel);
      },
      { templateId, liveSources, html },
    );

    await app.showMonitors();
    const row = app.layerRow(await app.loadTemplate(templateId));
    const programmePreset = () =>
      page.evaluate(
        async (id) =>
          (await window.cg.stack.snapshot()).find((item) => item.templateId === id)?.activeLookId,
        templateId,
      );
    await expect.poll(programmePreset).toBe('look-1');
    await expect(row.locator('[data-look-id]')).toHaveCount(1);
    await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
    await page
      .locator('[data-pvw-controls]')
      .getByRole('button', { name: 'PLAY', exact: true })
      .click();

    const preview = page.getByRole('group', { name: 'Preview Focus', exact: true });
    const focus1 = preview.getByRole('button', { name: 'Focus plate 1 in Preview' });
    const focus2 = preview.getByRole('button', { name: 'Focus plate 2 in Preview' });
    const returnToOrigin = preview.getByRole('button', { name: 'Return to Preset 1' });
    const stage = page.frameLocator('iframe[data-rehearsal-frame]');
    const transition = stage.locator('[data-cg-pvw-focus-switch="fade"]');

    await focus1.click();
    await expect(focus1).toHaveAttribute('aria-pressed', 'true');
    await expect(stage.locator('[data-cg-element-id="look-2-plate-1"]')).toBeVisible();
    await focus2.click();
    await expect(transition).toBeVisible();
    await expect(transition.locator('[data-cg-pvw-focus-plane]')).toHaveCount(2);
    await expect(transition).toHaveCount(0);
    await expect(focus2).toHaveAttribute('aria-pressed', 'true');
    await returnToOrigin.click();
    await expect(returnToOrigin).toHaveCount(0);
    await expect(stage.locator('[data-cg-element-id="look-1-plate-2"]')).toBeVisible();

    expect(await programmePreset()).toBe('look-1');
  });
});
