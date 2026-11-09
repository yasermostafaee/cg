import type { Page } from '@playwright/test';
import {
  aggregateBoundCompositionFields,
  type Composition,
  type Element,
  type Scene,
} from '@cg/shared-schema';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import { expect, test } from './fixtures/runtime.js';

/**
 * ⭐ **SESSION BO — the Inspector's LOOK INPUTS section, driven through the real UI.**
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

async function registerLegacyLookTemplate(page: Page): Promise<void> {
  const shared = lookFieldScope(['common-top', 'common-bottom']);
  const looks = [1, 2, 3].map((index) => ({
    id: `look-${String(index)}`,
    name: `Preset ${String(index)}`,
    instanceId: `instance-${String(index)}`,
    entered: { mode: 'cut' as const },
  }));
  const compositions: Composition[] = looks.map((look, index) => {
    const scope = lookFieldScope([`plate-1-${String(index + 1)}`, `plate-2-${String(index + 1)}`]);
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
  const scene: Scene = {
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
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: () => Promise.resolve(null), bytes: () => Promise.resolve(null) },
  }).produce(scene);
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
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
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
          defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
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

test('LOOK INPUTS lists every look with its own frames, and the flat template keeps its editor', async ({
  app,
}) => {
  await registerLooksTemplate(app);
  await registerFlatTemplate(app);
  const row = await app.loadTemplate(LOOKS_TPL);
  await app.selectLayerRow(row);

  const looks = app.inspector.locator('[aria-label="Look inputs"]');
  await expect(looks).toBeVisible();

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
    ⚠ §2.1 — A TEMPLATE WITH NO LOOKS GETS NO LOOK INPUTS SECTION, and must therefore keep its
    flat editor. This is the case that makes the section conditional rather than a replacement:
    it is the commonest installation, and it has no other way to point a plate.
  */
  const flatRow = await app.loadTemplate(FLAT_TPL);
  await app.selectLayerRow(flatRow);
  await expect(app.inspector.locator('[aria-label="Look inputs"]')).toHaveCount(0);
  await expect(app.inspector.locator('[aria-label="Live plates"]')).toBeVisible();
});

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
});
