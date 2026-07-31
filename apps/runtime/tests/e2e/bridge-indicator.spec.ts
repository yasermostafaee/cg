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
    // sit beside the amber one, and won). Scoped + case-sensitive: a bare
    // getByText('HEALTHY') is a substring, case-INsensitive match, so it also hits
    // "unhealthy" and would pass for the wrong reason.
    await expect(page.getByLabel('Status bar')).not.toContainText('HEALTHY');
  });

  /**
   * §7 — THIS TEST USED TO ASSERT THE DEFECT, and re-pointing it is the evidence.
   *
   * It asserted `LIVE` against a bridge whose CasparCG is deliberately unreachable
   * (`amcpPort: 1` — see `ephemeralConnection`), which is precisely the state the
   * owner misread: `● LIVE` beside `● PRIMARY A OFFLINE`, and the reassuring claim
   * won. The link IS up and that is worth saying; what the pill may not do is say
   * it in the word that reads as connected-to-the-plant.
   */
  test('boot with a reachable bridge but no CasparCG → says BRIDGE ONLY, never LIVE', async ({
    page,
  }) => {
    bridge = await createBridge({ port: 0, connection: ephemeralConnection() });

    await page.addInitScript(setBridgeUrl(bridge.url));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    await expect(link).toContainText('BRIDGE ONLY');
    await expect(link).toContainText('NO CASPARCG');
    // The whole point: nothing in this pill reads as connected while it is not.
    await expect(link).not.toContainText('LIVE');
    // …and the link state itself is NOT collapsed away — a down bridge is a
    // different, louder thing, and this is not it.
    await expect(link).not.toContainText('DISCONNECTED');
  });

  test('bridge drops mid-session → DISCONNECTED indicator (no silent downgrade)', async ({
    page,
  }) => {
    bridge = await createBridge({ port: 0, connection: ephemeralConnection() });

    await page.addInitScript(setBridgeUrl(bridge.url));
    await page.goto('/');

    const link = page.getByRole('status', { name: 'Bridge link' });
    // The link is UP. The pill names which hop it means, so the assertion does
    // too — this fixture has no CasparCG behind the bridge (`amcpPort: 1`).
    await expect(link).toContainText('BRIDGE');
    await expect(link).not.toContainText('DISCONNECTED');

    // Drop the bridge mid-session — the indicator must surface DISCONNECTED,
    // never silently revert to the mock.
    await bridge.close();
    bridge = null;

    await expect(link).toContainText('DISCONNECTED');
  });
});
