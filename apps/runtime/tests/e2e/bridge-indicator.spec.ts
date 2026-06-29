import { expect, test } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';

/**
 * C-001 Phase 1 — boot selection + resilience, end to end through the real UI.
 * The browser probes `window.__CG_BRIDGE_URL__` at boot; the test sets it (and
 * optionally boots a real `@cg/caspar-bridge`) before the app's JS runs, then
 * asserts the tri-state connection indicator.
 */

function setBridgeUrl(url: string): string {
  return `window.__CG_BRIDGE_URL__ = ${JSON.stringify(url)};`;
}

test.describe('bridge link indicator', () => {
  let bridge: BridgeHandle | null = null;

  test.afterEach(async () => {
    await bridge?.close();
    bridge = null;
  });

  test('boot with no bridge → OFFLINE (mock) indicator', async ({ page }) => {
    // Claim a free port, then release it so nothing answers there.
    const probe = await createBridge({ port: 0 });
    const deadUrl = probe.url;
    await probe.close();

    await page.addInitScript(setBridgeUrl(deadUrl));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('OFFLINE (mock)');
  });

  test('boot with a reachable bridge → LIVE indicator', async ({ page }) => {
    bridge = await createBridge({ port: 0 });

    await page.addInitScript(setBridgeUrl(bridge.url));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('LIVE');
  });

  test('bridge drops mid-session → DISCONNECTED indicator (no silent downgrade)', async ({
    page,
  }) => {
    bridge = await createBridge({ port: 0 });

    await page.addInitScript(setBridgeUrl(bridge.url));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('LIVE');

    // Drop the bridge mid-session — the indicator must surface DISCONNECTED,
    // never silently revert to the mock.
    await bridge.close();
    bridge = null;

    await expect(link).toContainText('DISCONNECTED');
  });
});
