import type { Page } from '@playwright/test';
import type {
  FloatingPanelArrangement,
  FloatingPanelWindowDoor,
} from '../../src/shared/floating-panel-window.js';
import {
  FLOATING_PANEL_IDS,
  type FloatingPanelId,
  type FloatingPanelPlacements,
} from '../../src/shared/floating-panels.js';
import type { RuntimeBridge } from '../../src/shared/runtime-bridge.js';
import { armMockRuntime, expect, RuntimeApp, test } from './fixtures/runtime.js';

interface FloatingWindowProbe {
  placements: FloatingPanelPlacements;
  latest: Partial<Record<FloatingPanelId, FloatingPanelArrangement>>;
  playoutWrites: number;
}

type ProbeWindow = Window & { floatingWindowProbe: FloatingWindowProbe };

async function openPanelDocuments(page: Page): Promise<Map<FloatingPanelId, Page>> {
  await page.addInitScript(() => {
    if (window.location.pathname.endsWith('/floating-panel.html')) return;
    const probe: FloatingWindowProbe = { placements: {}, latest: {}, playoutWrites: 0 };
    (window as unknown as ProbeWindow).floatingWindowProbe = probe;
    const door: FloatingPanelWindowDoor = {
      async arrange(request) {
        probe.latest[request.panel] = request;
        if (request.placement === null) delete probe.placements[request.panel];
        else probe.placements[request.panel] = request.placement;
      },
      async placement(panel) {
        return probe.placements[panel] ?? null;
      },
      async dispose() {
        probe.placements = {};
        probe.latest = {};
      },
    };
    let cg: RuntimeBridge | undefined;
    Object.defineProperty(window, 'cg', {
      configurable: true,
      get: () => cg,
      set(bridge: RuntimeBridge) {
        Object.defineProperty(bridge, 'floatingPanels', { configurable: true, value: door });
        for (const key of ['take', 'update', 'stop', 'out'] as const) {
          const method = bridge.stack[key];
          Object.defineProperty(bridge.stack, key, {
            configurable: true,
            value: new Proxy(method, {
              apply(target, receiver, args) {
                probe.playoutWrites += 1;
                return Reflect.apply(target, receiver, args);
              },
            }),
          });
        }
        cg = bridge;
      },
    });
  });
  await page.goto('/');
  const panels = new Map<FloatingPanelId, Page>();
  await expect
    .poll(() => {
      for (const popup of page.context().pages()) {
        const address = popup.url();
        if (!address.includes('/floating-panel.html')) continue;
        const url = new URL(address);
        const id = FLOATING_PANEL_IDS.find((panel) => panel === url.searchParams.get('panel'));
        if (id !== undefined) panels.set(id, popup);
      }
      return panels.size;
    })
    .toBe(FLOATING_PANEL_IDS.length);
  return panels;
}

async function arrangement(page: Page, panel: FloatingPanelId) {
  return page.evaluate(
    (id) => (window as unknown as ProbeWindow).floatingWindowProbe.latest[id],
    panel,
  );
}

async function placement(page: Page, panel: FloatingPanelId) {
  return (await arrangement(page, panel))?.placement;
}

for (const mode of ['docked', 'floating'] as const) {
  test(`B-454 F5 follows the layer shortcut switch in ${mode} Layers`, async ({ page }) => {
    await armMockRuntime(page);
    const documents = await openPanelDocuments(page);
    const layers = documents.get('layers')!;
    const app = new RuntimeApp(layers);
    await expect(app.layerRow(95)).toBeVisible();
    const loaded = await page.evaluate(() =>
      window.cg.fixedLayers.load({
        channel: 1,
        layer: 95,
        itemId: 'item-native-f5',
        templateId: 'ticker',
        fields: {},
      }),
    );
    expect(loaded.accepted).toBe(true);
    const documentStart = () => layers.evaluate(() => performance.timeOrigin);
    const start = await documentStart();
    const writes = () =>
      page.evaluate(() => (window as unknown as ProbeWindow).floatingWindowProbe.playoutWrites);
    const toggle = app.layers.getByRole('switch', { name: 'Layer shortcuts', exact: true });
    const search = app.layers.getByRole('searchbox', { name: 'Find row or template' });
    const state = app.layerState(95);
    const detached = mode === 'floating';
    if (detached) await layers.getByRole('button', { name: /^Float / }).click();
    await expect
      .poll(() => arrangement(page, 'layers'))
      .toMatchObject({
        placement: detached ? expect.any(Object) : null,
      });
    await expect(state).toHaveText('READY');
    const beforeKey = await writes();
    await expect(toggle).not.toBeChecked();
    await layers.keyboard.press('F5');
    await expect(layers.getByText(/^Layer shortcuts are off\./)).toBeVisible();
    expect(await writes()).toBe(beforeKey);

    await toggle.click();
    await search.focus();
    await layers.keyboard.press('F5');
    expect(await writes()).toBe(beforeKey);
    await expect(search).toBeFocused();
    await search.blur();
    await layers.keyboard.press('F5');
    await expect.poll(writes).toBe(beforeKey + 1);
    await expect(state).toHaveText('SIM ON AIR');
    expect(await documentStart()).toBe(start);
  });
}

test('R-129 shows and hides each docked monitor independently or together', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const header = page.locator('[data-app-header]');
  const monitorButton = (name: string) => header.getByRole('button', { name, exact: true });
  const dock = (panel: FloatingPanelId) => page.locator(`[data-floating-dock="${panel}"]`);
  const layersHeight = async () => (await dock('layers').boundingBox())?.height ?? 0;
  const monitorWidth = async (panel: 'pgm' | 'pvw') =>
    (await dock(panel).boundingBox())?.width ?? 0;
  const expectDockedMonitors = async (pvw: boolean, pgm: boolean) => {
    await expect
      .poll(async () => {
        const [preview, programme] = await Promise.all([
          arrangement(page, 'pvw'),
          arrangement(page, 'pgm'),
        ]);
        return [preview?.visible, programme?.visible];
      })
      .toEqual([pvw, pgm]);
  };

  await expectDockedMonitors(false, false);
  const fullLayersHeight = await layersHeight();
  expect(fullLayersHeight).toBeGreaterThan(0);

  await monitorButton('Show PVW monitor').click();
  await expectDockedMonitors(true, false);
  await expect(dock('pgm')).toHaveCount(0);
  const previewOnlyWidth = await monitorWidth('pvw');
  expect(previewOnlyWidth).toBeGreaterThan(0);
  await expect.poll(layersHeight).toBeLessThan(fullLayersHeight);

  const pvw = documents.get('pvw')!;
  await pvw.getByRole('button', { name: 'Show PREVIEW (PVW) fullscreen', exact: true }).click();
  await expect(header).toHaveCount(0);
  await expectDockedMonitors(true, false);
  await pvw.getByRole('button', { name: 'Exit fullscreen PREVIEW (PVW)', exact: true }).click();
  await expectDockedMonitors(true, false);
  await expect(monitorButton('Show PGM monitor')).toBeVisible();

  // The aggregate button restores both monitors from a mixed state.
  await monitorButton('Show monitors').click();
  await expectDockedMonitors(true, true);
  await expect.poll(() => monitorWidth('pvw')).toBeLessThan(previewOnlyWidth);
  const pairedProgrammeWidth = await monitorWidth('pgm');
  expect(pairedProgrammeWidth).toBeGreaterThan(0);

  await monitorButton('Hide PVW monitor').click();
  await expectDockedMonitors(false, true);
  await expect.poll(() => monitorWidth('pgm')).toBeGreaterThan(pairedProgrammeWidth);
  await monitorButton('Hide PGM monitor').click();
  await expectDockedMonitors(false, false);
  await expect.poll(layersHeight).toBeCloseTo(fullLayersHeight, 0);

  await monitorButton('Show PGM monitor').click();
  await expectDockedMonitors(false, true);
  const pgm = documents.get('pgm')!;
  await pgm.getByRole('button', { name: /^Float / }).click();
  await expect.poll(() => arrangement(page, 'pgm')).toMatchObject({ visible: true, dock: null });
  await expect(monitorButton('Show PVW monitor')).toBeVisible();
  await expect(monitorButton('Show monitors')).toHaveCount(0);
  await pgm.getByRole('button', { name: /^Exit floating / }).click();
  await expect.poll(() => arrangement(page, 'pgm')).toMatchObject({ placement: null });
  await expectDockedMonitors(false, true);
  await monitorButton('Show monitors').click();
  await expectDockedMonitors(true, true);
  await monitorButton('Hide monitors').click();
  await expectDockedMonitors(false, false);
  expect(
    await page.evaluate(() => (window as unknown as ProbeWindow).floatingWindowProbe.playoutWrites),
  ).toBe(0);
});

test('R-129 the toolbar toggle only controls docked monitors', async ({ page }) => {
  const app = new RuntimeApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const pgm = documents.get('pgm')!;
  const pvw = documents.get('pvw')!;
  await app.showMonitors();

  await pgm.getByRole('button', { name: /^Float / }).click();
  await expect
    .poll(() => arrangement(page, 'pgm'))
    .toMatchObject({ visible: true, dock: null, placement: { width: expect.any(Number) } });
  const floatingPgm = await arrangement(page, 'pgm');
  const hidePvw = page.getByRole('button', { name: 'Hide PVW monitor', exact: true });
  const showPvw = page.getByRole('button', { name: 'Show PVW monitor', exact: true });
  await expect(hidePvw).toHaveAttribute('aria-expanded', 'true');
  await hidePvw.click();
  await expect(showPvw).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => arrangement(page, 'pvw')).toMatchObject({ visible: false });
  expect(await arrangement(page, 'pgm')).toEqual(floatingPgm);
  await showPvw.click();
  await expect.poll(() => arrangement(page, 'pvw')).toMatchObject({ visible: true });

  await pvw.getByRole('button', { name: /^Float / }).click();
  await expect
    .poll(() => arrangement(page, 'pvw'))
    .toMatchObject({ visible: true, dock: null, placement: { width: expect.any(Number) } });
  const floatingPvw = await arrangement(page, 'pvw');
  await expect(
    page.getByRole('button', { name: /^(Show|Hide) ((PGM|PVW) monitor|monitors)$/ }),
  ).toHaveCount(0);
  expect(await arrangement(page, 'pgm')).toEqual(floatingPgm);

  await pgm.getByRole('button', { name: /^Exit floating / }).click();
  const hidePgm = page.getByRole('button', { name: 'Hide PGM monitor', exact: true });
  const showPgm = page.getByRole('button', { name: 'Show PGM monitor', exact: true });
  await hidePgm.click();
  await expect(showPgm).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => arrangement(page, 'pgm')).toMatchObject({ visible: false });
  expect(await arrangement(page, 'pvw')).toEqual(floatingPvw);
  await showPgm.click();
  await expect.poll(() => arrangement(page, 'pgm')).toMatchObject({ visible: true });

  await pvw.getByRole('button', { name: /^Exit floating / }).click();
  await expect(page.getByRole('button', { name: 'Hide monitors', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('R-129 keeps the header tooltip visible across a docked monitor', async ({ page }) => {
  const app = new RuntimeApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const pgm = documents.get('pgm')!;
  // The mock-only banner otherwise separates the header tooltip from the monitor.
  await page.getByRole('alert', { name: 'Test mode' }).evaluate((banner) => {
    banner.style.display = 'none';
  });
  await app.showMonitors();
  await page.mouse.move(1, 1);

  const hideMonitors = page.getByRole('button', { name: 'Hide monitors', exact: true });
  const mainTip = page.getByRole('tooltip');
  const dockTip = pgm.locator('.cg-tooltip[aria-hidden="true"]');
  const title = 'Fold PREVIEW and PROGRAM away — the layer list takes the height';
  await hideMonitors.hover();
  await expect(mainTip).toHaveText(title);

  const tip = (await mainTip.boundingBox())!;
  const dock = (await page.locator('[data-floating-dock="pgm"]').boundingBox())!;
  const left = Math.max(tip.x, dock.x);
  const top = Math.max(tip.y, dock.y);
  const right = Math.min(tip.x + tip.width, dock.x + dock.width);
  const bottom = Math.min(tip.y + tip.height, dock.y + dock.height);
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);

  await expect(dockTip).toHaveText(title);
  await expect(dockTip).toBeVisible();
  await expect(pgm.getByRole('tooltip')).toHaveCount(0);
  const rendered = (await dockTip.boundingBox())!;
  expect(Math.abs(rendered.x - (tip.x - dock.x))).toBeLessThan(1);
  expect(Math.abs(rendered.y - (tip.y - dock.y))).toBeLessThan(1);
  expect(rendered.width).toBeCloseTo(tip.width, 1);
  expect(rendered.height).toBeCloseTo(tip.height, 1);
  const hit = await dockTip.evaluate(
    (element, { x, y }) => {
      const target = element.ownerDocument.elementFromPoint(x, y);
      return Boolean(target?.closest('[data-floating-panel-content]')) && !element.contains(target);
    },
    { x: (left + right) / 2 - dock.x, y: (top + bottom) / 2 - dock.y },
  );
  expect(hit).toBe(true);

  // The source can change its intrinsic size after the first paint, for example
  // when a font finishes loading. The copy must follow the measured size.
  await mainTip.evaluate((element) => {
    element.style.maxWidth = '240px';
  });
  await expect
    .poll(async () => (await dockTip.boundingBox())?.width)
    .toBeCloseTo((await mainTip.boundingBox())!.width, 1);

  await page.keyboard.press('Escape');
  await expect(mainTip).toHaveCount(0);
  await expect(dockTip).toHaveCount(0);

  await pgm.getByRole('button', { name: /^Float / }).click();
  await expect.poll(() => placement(page, 'pgm')).toMatchObject({ width: expect.any(Number) });
  // Move away first so the main document receives a new pointerover even though the
  // native pane is simulated by a separate browser window.
  await page.mouse.move(1, 1);
  const hidePvw = page.getByRole('button', { name: 'Hide PVW monitor', exact: true });
  await expect(hidePvw).toHaveAttribute('title', /\S/);
  const pvwTitle = (await hidePvw.getAttribute('title'))!;
  await hidePvw.hover();
  await expect(mainTip).toHaveText(pvwTitle);
  await expect(dockTip).toHaveCount(0);
});

test('R-129 paints command feedback above the docked Layers panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const layers = documents.get('layers')!;
  const dock = page.locator('[data-floating-dock="layers"]');
  const toast = page.getByRole('status', { name: 'Command success' });
  const overlay = layers.locator('[data-command-toast-overlay]');
  const report = (message: string) =>
    page.evaluate((text) => {
      (window as unknown as { CG_TEST_SUCCEED: (value: string) => void }).CG_TEST_SUCCEED(text);
    }, message);

  await expect
    .poll(() => arrangement(page, 'layers'))
    .toMatchObject({ visible: true, placement: null });
  const panel = (await dock.boundingBox())!;
  // The fake native door opens a normal browser window. Match the actual dock's viewport
  // before hit-testing the portion of the toast near its bottom edge.
  await layers.setViewportSize({
    width: Math.round(panel.width),
    height: Math.round(panel.height),
  });
  await report('Cleared · 2 rows');
  await expect(toast).toHaveText('Cleared · 2 rows');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(overlay).toHaveText('Cleared · 2 rows');
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(layers.getByRole('status', { name: 'Command success' })).toHaveCount(0);

  const main = (await toast.boundingBox())!;
  const mirror = (await overlay.boundingBox())!;
  const left = Math.max(main.x, panel.x);
  const top = Math.max(main.y, panel.y);
  const right = Math.min(main.x + main.width, panel.x + panel.width);
  const bottom = Math.min(main.y + main.height, panel.y + panel.height);
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  expect(Math.abs(mirror.x - (main.x - panel.x))).toBeLessThan(1);
  expect(Math.abs(mirror.y - (main.y - panel.y))).toBeLessThan(1);
  expect(mirror.width).toBeCloseTo(main.width, 1);
  expect(mirror.height).toBeCloseTo(main.height, 1);

  const hits = await overlay.evaluate(
    (element, { x, y }) => {
      const owner = element.ownerDocument;
      const underlying = owner.elementFromPoint(x, y);
      const pointerEvents = element.style.pointerEvents;
      try {
        // Hit-test with the overlay enabled to measure which surface paints on top.
        element.style.pointerEvents = 'auto';
        return {
          passesThrough: Boolean(underlying?.closest('[data-floating-panel-content]')),
          overlaysPanel: element.contains(owner.elementFromPoint(x, y)),
        };
      } finally {
        element.style.pointerEvents = pointerEvents;
      }
    },
    { x: (left + right) / 2 - panel.x, y: (top + bottom) / 2 - panel.y },
  );
  expect(hits).toEqual({ passesThrough: true, overlaysPanel: true });
  await expect(toast).toHaveCount(0);
  await expect(overlay).toHaveCount(0);

  await layers.getByRole('button', { name: /^Float / }).click();
  await expect.poll(() => placement(page, 'layers')).toMatchObject({ width: expect.any(Number) });
  await report('Cleared · 3 rows');
  await expect(toast).toHaveText('Cleared · 3 rows');
  await expect(overlay).toHaveCount(0);
});

test('R-129 floats and redocks stable panel documents with one selection, draft and PVW session', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const app = new RuntimeApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const layers = documents.get('layers')!;
  const inspector = documents.get('inspector')!;
  const pvw = documents.get('pvw')!;
  const loaded = await page.evaluate(async () => {
    const previewHtml = '<!doctype html><html><body>Floating workspace</body></html>';
    await window.cg.templates.import({
      template: {
        templateId: 'floating-workspace-proof',
        name: 'Floating workspace test',
        sourceFileName: 'floating-workspace.vcg',
        templateType: 'lower-third',
        fields: [{ id: 'headline', label: 'Headline', type: 'text', required: false, default: '' }],
      },
      html: previewHtml,
    });
    const pageFor = window.cg.templates.page;
    window.cg.templates.page = (templateId, channel) =>
      templateId === 'floating-workspace-proof'
        ? Promise.resolve({ kind: 'page', html: previewHtml, source: 'bridge' })
        : pageFor(templateId, channel);
    return Promise.all(
      [84, 85].map((layer) =>
        window.cg.fixedLayers.load({
          channel: 1,
          layer,
          itemId: `floating-layer-${layer}`,
          templateId: 'floating-workspace-proof',
          fields: { headline: `Original ${layer}` },
        }),
      ),
    );
  });
  expect(loaded.map(({ accepted }) => accepted)).toEqual([true, true]);

  await app.showMonitors();
  const row = (layer: number) => layers.locator(`[data-layer="${layer}"]`);
  await row(84).locator('[data-row-body]').click();
  await expect(row(84)).toHaveAttribute('aria-pressed', 'true');
  const headline = inspector.getByRole('textbox', { name: 'headline', exact: true });
  await expect(headline).toHaveValue('Original 84');
  await headline.fill('An unapplied edit');
  const collapse = inspector.getByRole('button', { name: 'Collapse all sections', exact: true });
  const expand = inspector.getByRole('button', { name: 'Expand all sections', exact: true });
  await collapse.click();
  await expect(headline).toBeHidden();

  await inspector.getByRole('button', { name: /^Float / }).click();
  await expect
    .poll(() => placement(page, 'inspector'))
    .toMatchObject({ width: expect.any(Number) });
  await row(84).locator('[data-row-body]').click();
  await expect(row(84)).toHaveAttribute('aria-pressed', 'true');
  await expect(expand).toBeVisible();
  await expect(headline).toBeHidden();
  await expand.click();
  await expect(headline).toHaveValue('An unapplied edit');
  await row(85).locator('[data-row-body]').click();
  await expect(headline).toHaveValue('Original 85');
  await row(84).locator('[data-row-body]').click();
  await expect(headline).toHaveValue('An unapplied edit');

  await row(84).getByRole('button', { name: 'ON PVW', exact: true }).click();
  const preview = pvw
    .frameLocator('iframe[data-rehearsal-frame="floating-layer-84"]')
    .locator('body');
  await expect(preview).toHaveText('Floating workspace');
  await preview.evaluate((body) => body.setAttribute('data-running-preview', 'retained'));

  await pvw.getByRole('button', { name: /^Float / }).click();
  await expect.poll(() => placement(page, 'pvw')).toMatchObject({ width: expect.any(Number) });
  await pvw.getByRole('button', { name: /^Maximize floating / }).click();
  await expect.poll(async () => (await placement(page, 'pvw'))?.maximized).toBe(true);
  await expect(pvw.locator('[data-monitor-companion-controls]')).toHaveCount(0);
  await expect(preview).toHaveAttribute('data-running-preview', 'retained');

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Station setup' });
  await settings.getByRole('tab', { name: 'General', exact: true }).click();
  await settings.getByRole('textbox', { name: 'Profile name', exact: true }).fill('Floating test');
  await settings.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: 'Saved UI profile' })).toHaveValue(
    'Floating test',
  );
  await settings.getByRole('button', { name: 'Close', exact: true }).click();

  await pvw.getByRole('button', { name: /^Exit floating / }).click();
  await expect.poll(() => placement(page, 'pvw')).toBeNull();
  await expect(preview).toHaveAttribute('data-running-preview', 'retained');
  await collapse.click();
  await inspector.getByRole('button', { name: /^Exit floating / }).click();
  await expect.poll(() => placement(page, 'inspector')).toBeNull();
  await expect(expand).toBeVisible();
  await expect(headline).toBeHidden();
  await expand.click();
  await expect(headline).toHaveValue('An unapplied edit');

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  await settings.getByRole('tab', { name: 'General', exact: true }).click();
  await settings.getByRole('combobox', { name: 'Saved UI profile' }).selectOption('Floating test');
  await settings.getByRole('button', { name: 'Load profile', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => (await placement(page, 'pvw'))?.maximized).toBe(true);
  await expect
    .poll(() => placement(page, 'inspector'))
    .toMatchObject({ width: expect.any(Number) });
  await expect(preview).toHaveAttribute('data-running-preview', 'retained');
  await expect(headline).toHaveValue('An unapplied edit');
  expect(
    await page.evaluate(() => (window as unknown as ProbeWindow).floatingWindowProbe.playoutWrites),
  ).toBe(0);
});

test('R-018 opens the file picker from the docked and floating Inspector window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await armMockRuntime(page);
  const documents = await openPanelDocuments(page);
  const layers = documents.get('layers')!;
  const inspector = documents.get('inspector')!;
  const names = ['docked-headlines.txt', 'floating-headlines.txt'];
  const cancelled = 'Inspector file picker cancelled';

  await page.evaluate(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: () => {
        document.body.dataset['filePickerCalled'] = 'true';
        throw new Error('The picker ran in the main window');
      },
    });
  });
  await inspector.evaluate(
    async ({ names, cancelled }) => {
      const directory = await navigator.storage.getDirectory();
      const handles = await Promise.all(
        names.map(async (name) => {
          const handle = await directory.getFileHandle(name, { create: true });
          const writer = await handle.createWritable();
          await writer.write('First headline|Second headline');
          await writer.close();
          return handle;
        }),
      );
      const calls: { owner: boolean; trusted: boolean; active: boolean }[] = [];
      let trusted = false;
      document.addEventListener(
        'click',
        (event) => {
          trusted = event.isTrusted;
        },
        true,
      );
      Object.defineProperty(window, 'showOpenFilePicker', {
        configurable: true,
        value: async function (this: Window) {
          calls.push({
            owner: this === window,
            trusted,
            active: navigator.userActivation.isActive,
          });
          document.body.dataset['filePickerCalls'] = JSON.stringify(calls);
          if (calls.length % 2 === 1) throw new DOMException(cancelled, 'AbortError');
          return [handles[calls.length / 2 - 1]];
        },
      });
    },
    { names, cancelled },
  );

  const loaded = await page.evaluate(async () => {
    const templateId = 'floating-inspector-file-picker';
    await window.cg.templates.import({
      template: {
        templateId,
        name: 'Floating Inspector headlines',
        sourceFileName: 'floating-inspector-headlines.vcg',
        templateType: 'crawl',
        fields: [
          {
            id: 'headlines',
            label: 'Headlines',
            type: 'list',
            required: false,
            default: [{ id: 'default', text: 'Original headline' }],
            allowFileSource: true,
          },
        ],
      },
      html: '<!doctype html><html><body>Floating Inspector headlines</body></html>',
    });
    return window.cg.fixedLayers.load({
      channel: 1,
      layer: 84,
      itemId: 'floating-inspector-file-picker-item',
      templateId,
      fields: { headlines: [{ id: 'default', text: 'Original headline' }] },
    });
  });
  expect(loaded.accepted).toBe(true);
  await layers.locator('[data-layer="84"] [data-row-body]').click();
  await expect.poll(() => placement(page, 'inspector')).toBeNull();
  const pick = inspector.getByRole('button', { name: 'Load headlines from file' });
  const calls = inspector.locator('body');
  const expectedCall = { owner: true, trusted: true, active: true };
  await pick.click();
  await expect(calls).toHaveAttribute('data-file-picker-calls', JSON.stringify([expectedCall]));
  await pick.click();
  await expect(inspector.locator('.cg-file-chip__name')).toHaveText(names[0]!);

  await inspector.getByRole('button', { name: /^Float / }).click();
  await expect
    .poll(() => placement(page, 'inspector'))
    .toMatchObject({ width: expect.any(Number) });
  await inspector.getByRole('button', { name: 'Detach headlines file source' }).click();
  await pick.click();
  await expect(calls).toHaveAttribute(
    'data-file-picker-calls',
    JSON.stringify(Array(3).fill(expectedCall)),
  );
  await pick.click();
  await expect(inspector.locator('.cg-file-chip__name')).toHaveText(names[1]!);
  await expect(calls).toHaveAttribute(
    'data-file-picker-calls',
    JSON.stringify(Array(4).fill(expectedCall)),
  );

  await inspector.getByRole('button', { name: /^Exit floating / }).click();
  await expect.poll(() => placement(page, 'inspector')).toBeNull();
  await expect(inspector.locator('.cg-file-chip__name')).toHaveText(names[1]!);
  await inspector.getByRole('button', { name: 'Detach headlines file source' }).click();
  await pick.click();
  await expect(calls).toHaveAttribute(
    'data-file-picker-calls',
    JSON.stringify(Array(5).fill(expectedCall)),
  );
  await expect(page.locator('body')).not.toHaveAttribute('data-file-picker-called', 'true');
  await expect(page.getByText(cancelled)).toHaveCount(0);
  await expect(inspector.getByText(cancelled)).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as ProbeWindow).floatingWindowProbe.playoutWrites),
  ).toBe(0);
});
