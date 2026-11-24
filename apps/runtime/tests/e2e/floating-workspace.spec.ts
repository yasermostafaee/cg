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
