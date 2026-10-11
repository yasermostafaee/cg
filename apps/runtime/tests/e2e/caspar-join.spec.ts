import type { Locator, Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { shotOf } from './fixtures/cg-control.js';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `B-327` (`SERVERS-SIMPLIFY-01` T6) — **THE OWNER'S STATE, IN A REAL ENGINE: EVERY LINE GREEN, THE METER `— LUFS`.**
 *
 * His `.93` was server A against a Playout whose `casparHost` is `127.0.0.1`: picture and sound were there, the check
 * passed, and the loudness badge read `— LUFS`, because the meters, the sources and the grants are joined by an
 * exact host. Here a real CG Bridge drives server A at `127.0.0.9` (port 1: nothing answers) against the fake
 * Playout's meters on `127.0.0.1`:
 *
 *   - before: the badge `— LUFS`; Station setup's check FAILS a line that names both hosts and the cost;
 *   - `Use the Playout's` writes the host CG Bridge derived (`127.0.0.1` — CG Bridge is on the Playout's machine);
 *   - after: the line passes and the badge reads the Playout's loudness, `−23.2 LUFS`.
 *
 * Nothing reaches a real Playout or CasparCG. `CG_SHOTS_DIR` set: the report's pictures are written there.
 */

let playout: FakePlayout | null = null;
let bridge: BridgeHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await playout?.stop();
  playout = null;
});

const LEVELS = {
  dbfs: [-18, -18, ...Array.from({ length: 14 }, () => -60)],
  loudness: { momentary: -22.6, shortterm: -23.2, limiterGrDb: 0 },
};

const badge = (page: Page): Locator => page.locator('[data-loudness-badge]');

test('🔴 B-327 — the owner’s state: the meter silent, the join line fails naming both hosts; `Use the Playout’s` restores the meter', async ({
  page,
}) => {
  test.setTimeout(120_000);
  playout = await startFakePlayout({ grants: { admin: '*' } });
  playout.setMeterLevels(1, LEVELS);
  bridge = await createBridge({
    port: 0,
    connection: {
      // The owner's state: server A is not the host the Playout names.
      servers: { A: { host: '127.0.0.9', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: defaultFixedLayerBank(),
    playout: {
      auth: 'playout',
      issuer: playout.issuer,
      jwksUrl: playout.jwksUrl,
      tokenUrl: playout.tokenUrl,
      refreshUrl: playout.refreshUrl,
      revokedUrl: playout.revokedUrl,
    },
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(
    `window.__CG_BRIDGE_URL__ = ${JSON.stringify(bridge.url)}; window.__CG_SPLASH_DISABLED__ = true;`,
  );
  await page.goto('/');
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.first().click();

  // Before: the Playout is sending (its stream is open), and the badge knows nothing.
  await expect.poll(() => playout?.meterStreams ?? 0, { timeout: 20_000 }).toBe(1);
  await page.waitForTimeout(1_000);
  await expect(badge(page)).toHaveText('— LUFS');
  await shotOf(badge(page), 'SERVERS-SIMPLIFY-01-before-6-meter.png');

  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  await setup
    .getByRole('tablist', { name: 'Station setup sections' })
    .getByRole('tab', { name: /^Connection/ })
    .click();
  const card = setup.getByRole('region', { name: 'Playout' });
  const line = card.locator('[data-check="caspar-join"]');
  await expect(line).toHaveAttribute('data-status', 'fail', { timeout: 30_000 });
  await expect(line).toContainText(
    'CasparCG A is 127.0.0.9; the Playout names 127.0.0.1: meters, sources and grants are dropped.',
  );
  const a = setup.getByRole('region', { name: 'CasparCG A' });
  await shotOf(card, 'SERVERS-SIMPLIFY-01-after-6-join-line.png');
  await shotOf(a, 'SERVERS-SIMPLIFY-01-after-7-use-the-playouts.png');

  // The repair: the derived host, through the one config door.
  await a.locator('[data-use-playouts]').click();
  await expect(a.locator('[data-setup-readonly]').first()).toHaveText('127.0.0.1', {
    timeout: 30_000,
  });
  await expect(line).toHaveAttribute('data-status', 'pass', { timeout: 30_000 });
  await expect(line).toContainText("CasparCG A is the Playout's: 127.0.0.1.");
  await expect(a.locator('[data-use-playouts]')).toHaveCount(0);

  // After: the meter returns.
  await setup.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(badge(page)).toHaveText('−23.2 LUFS', { timeout: 20_000 });
  await shotOf(badge(page), 'SERVERS-SIMPLIFY-01-after-8-meter.png');
});
