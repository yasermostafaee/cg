import { expect, test } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import type { ConnectionConfig } from '@cg/shared-ipc';

/** Unreachable CasparCG + ephemeral OSC bind — these tests only exercise the WS link. */
function ephemeralConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

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

  /**
   * R-006 — this test used to assert "boot with no bridge → OFFLINE (mock)". That was the
   * BUG, pinned: an unreachable bridge silently became a simulation that reports successful
   * playouts, so the operator saw ON AIR for a graphic that never existed. An unreachable
   * bridge must land in a loud DISCONNECTED state and must NOT construct the mock.
   */
  test('boot with no bridge → loud DISCONNECTED, and NEVER the mock', async ({ page }) => {
    // Claim a free port, then release it so nothing answers there.
    const probe = await createBridge({ port: 0, connection: ephemeralConnection() });
    const deadUrl = probe.url;
    await probe.close();

    await page.addInitScript(setBridgeUrl(deadUrl));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('DISCONNECTED');
    await expect(link).not.toContainText('OFFLINE (mock)');

    // A pill is not enough for "nothing can reach air" — the alert is unmissable.
    const alert = page.getByRole('alert', { name: 'Bridge disconnected' });
    await expect(alert).toContainText('NOTHING CAN REACH AIR');
    await expect(alert).toContainText('refused, not');

    // No server is claimed healthy while nothing is reachable (the green pill that used to
    // sit beside the amber one, and won).
    await expect(page.getByText('HEALTHY')).toHaveCount(0);
  });

  test('boot with a reachable bridge → LIVE indicator', async ({ page }) => {
    bridge = await createBridge({ port: 0, connection: ephemeralConnection() });

    await page.addInitScript(setBridgeUrl(bridge.url));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('LIVE');
  });

  test('bridge drops mid-session → DISCONNECTED indicator (no silent downgrade)', async ({
    page,
  }) => {
    bridge = await createBridge({ port: 0, connection: ephemeralConnection() });

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
