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

async function placement(page: Page, panel: FloatingPanelId) {
  return page.evaluate(
    (id) => (window as unknown as ProbeWindow).floatingWindowProbe.latest[id]?.placement,
    panel,
  );
}

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
  await hideMonitors.hover();
  await expect(mainTip).toHaveText(title);
  await expect(dockTip).toHaveCount(0);
});

test('R-129 floats and redocks stable panel documents with one selection, draft and PVW session', async ({
  page,
}) => {
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

  await inspector.getByRole('button', { name: /^Float / }).click();
  await expect
    .poll(() => placement(page, 'inspector'))
    .toMatchObject({ width: expect.any(Number) });
  await row(84).locator('[data-row-body]').click();
  await expect(row(84)).toHaveAttribute('aria-pressed', 'true');
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
  await inspector.getByRole('button', { name: /^Exit floating / }).click();
  await expect.poll(() => placement(page, 'inspector')).toBeNull();
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
