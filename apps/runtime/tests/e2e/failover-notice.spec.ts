import { expect, test } from '@playwright/test';
import type { ConnectionConfig, ConnectionHealth } from '@cg/shared-ipc';

test('a dismissed direct-station failover stays acknowledged after reopening the console', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as typeof window & {
      CG_E2E: boolean;
      CG_E2E_FIXED_BANK: boolean;
      CG_E2E_PROGRAM_MONITOR: { backupChannel: number };
      __CG_SPLASH_DISABLED__: boolean;
      __CG_BRIDGE_URL__: string;
      nextFailover: () => void;
    };
    w.CG_E2E = true;
    w.CG_E2E_FIXED_BANK = true;
    w.CG_E2E_PROGRAM_MONITOR = { backupChannel: 1 };
    w.__CG_SPLASH_DISABLED__ = true;
    w.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
    Object.defineProperty(w, 'cg', {
      configurable: true,
      set(bridge: typeof window.cg) {
        const config: ConnectionConfig = {
          servers: {
            A: { host: '192.0.2.32', amcpPort: 5250, oscPort: 6251 },
            B: { host: '192.0.2.43', amcpPort: 5250, oscPort: 6252 },
          },
          strategy: 'mirror-sync',
          autoFailoverEnabled: true,
        };
        let health: ConnectionHealth = {
          primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
          backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
          currentPrimary: 'A',
          strategy: 'mirror-sync',
          lastFailover: {
            at: '2026-11-18T00:00:00.000Z',
            from: 'B',
            to: 'A',
            reason: 'amcp-ping-fail',
          },
        };
        const listeners = new Set<(state: ConnectionHealth) => void>();
        bridge.connections.config = async () => config;
        bridge.connections.health = async () => health;
        bridge.connections.onHealthChanged = (handler) => {
          listeners.add(handler);
          return () => listeners.delete(handler);
        };
        w.nextFailover = () => {
          health = {
            ...health,
            lastFailover: { ...health.lastFailover!, at: '2026-11-18T00:01:00.000Z' },
          };
          for (const listener of listeners) listener(health);
        };
        Object.defineProperty(w, 'cg', { value: bridge, configurable: true, writable: true });
      },
    });
  });
  await page.goto('/');
  const banner = page.locator('[data-failover-banner]');
  await expect(banner).toContainText('Auto-failover');
  await page.getByRole('button', { name: 'Dismiss failover banner', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Station setup', exact: true })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.evaluate(() =>
    (window as typeof window & { nextFailover: () => void }).nextFailover(),
  );
  await expect(banner).toContainText('Auto-failover');
});
