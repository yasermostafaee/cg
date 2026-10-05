import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import {
  pairBackupCatalogue,
  pairPrimaryCatalogue,
} from '../../../../tools/caspar-bridge/tests/support/fake-station.js';
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — **WHERE EACH CHANNEL'S LINES GO ON THE BACKUP ENGINE, IN A REAL
 * BROWSER**: the status bar's `BACKUP B · n of m channels mapped`, the channel view's backup line, and Station
 * setup's `Backup engine` lines.
 *
 * Two fake engines publishing a real pair's D4 — the backup's mirror of the primary's channel 1 is the
 * backup's OWN channel 2 (`mirrorOf`, `2.9.5`) — and a real CG Bridge whose server B is the backup. Then the
 * backup engine as `2.9.2` publishes it (no `mirrorOf`): nothing mapped, until a station admin's entry.
 * Isolation as `backup-engine.spec.ts`: scratch paths, dead CasparCG ports, ephemeral ports.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');
const BACKUP_PASSWORD = 'test-only-backup-engine-not-a-secret';

let primary: FakePlayout | null = null;
let backup: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

async function startPair(): Promise<{ bridgeUrl: string }> {
  primary = await startFakePlayout();
  backup = await startFakePlayout({ password: BACKUP_PASSWORD, verifyBearers: true });
  primary.setChannels(pairPrimaryCatalogue(backup.baseUrl));
  backup.setChannels(pairBackupCatalogue(primary.baseUrl));
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-backup-map-'));
  const scratch = (name: string): string => path.join(stateDir as string, name);
  fs.writeFileSync(
    scratch('fixed.json'),
    JSON.stringify({ channel: 1, start: 80, count: 4 }),
    'utf8',
  );
  bridge = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--auth',
      'playout',
      '--playout-issuer',
      primary.issuer,
      '--playout-jwks-url',
      primary.jwksUrl,
      '--playout-config-path',
      scratch('playout.json'),
      '--persist-path',
      scratch('connection.json'),
      '--fixed-layers-path',
      scratch('fixed.json'),
      '--reserved-layers-path',
      scratch('reserved.json'),
      '--source-catalog-path',
      scratch('catalog.json'),
      '--source-assignments-path',
      scratch('assignments.json'),
      '--playout-inputs-path',
      scratch('inputs.json'),
      '--bound-media-path',
      scratch('media.json'),
      '--live-layers-path',
      scratch('live.json'),
      '--audit-log-path',
      scratch('audit.ndjson'),
      '--templates-dir',
      scratch('templates'),
      '--bridge-session-path',
      scratch('bridge-session.json'),
      '--backup-playout-address',
      backup.baseUrl,
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
      '--backup-host',
      '127.0.0.1',
      '--backup-amcp-port',
      '2',
      '--port',
      '0',
      '--template-serve-port',
      '0',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let boot = '';
  bridge.stderr?.on('data', (chunk: Buffer) => {
    boot += chunk.toString();
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
    if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) return { bridgeUrl: match[1] };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
}

test.afterEach(async () => {
  await stopChild(bridge);
  bridge = null;
  await primary?.stop();
  primary = null;
  await backup?.stop();
  backup = null;
  if (stateDir !== null && fs.existsSync(stateDir))
    fs.rmSync(stateDir, { recursive: true, force: true });
  stateDir = null;
});

async function signInConsole(page: Page): Promise<void> {
  const user = page.locator('#cg-signin-user');
  await expect(user).toBeVisible({ timeout: 20_000 });
  await user.fill(FAKE_ADMIN.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user).toHaveCount(0, { timeout: 20_000 });
}

/** «Sign in CG Bridge…» on the engine it opens on, with that engine's password. */
async function signInBridge(page: Page, password: string): Promise<void> {
  await page.getByRole('button', { name: 'Sign in CG Bridge…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in CG Bridge' });
  await dialog.locator('#cg-bridge-signin-pass').fill(password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
}

test('🔴 the channel’s lines on the backup engine: the status bar’s count, the channel view’s line and Station setup’s lines — from the backup’s D4, then from a station admin’s entry', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const station = await startPair();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signInConsole(page);
  // CG Bridge on each engine, each with its own password: only then is the backup's D4 read.
  await signInBridge(page, FAKE_PLAYOUT_PASSWORD);
  await signInBridge(page, BACKUP_PASSWORD);

  // 1 — the status bar's count: the backup's mirror of CH 1 is ITS channel 2.
  const bar = page.getByLabel('Status bar');
  const count = bar.locator('[data-backup-mapped]');
  await expect(count).toHaveText('BACKUP B · 1 of 1 channels mapped', { timeout: 20_000 });
  await expect(count).toHaveAttribute('data-backup-mapped', 'ok');

  // 2 — the channel's own view: PROGRAM names the backup's own channel and host.
  await page.getByRole('button', { name: 'Show monitors' }).click();
  const line = page.locator('[data-backup-channel-line]');
  await expect(line).toHaveText('Backup: CH 2 on 127.0.0.1');

  // 3 — Station setup → Servers → Backup engine: one line, from the backup engine's own list.
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  const servers = setup.getByRole('tab', { name: /Servers/ });
  if ((await servers.getAttribute('aria-selected')) !== 'true') await servers.click();
  const card = setup.getByRole('region', { name: 'Backup engine' });
  const row = card.locator('[data-backup-entry-row="1"]');
  await expect(row).toContainText('CH 1 (primary) → CH');
  await expect(row.locator('[data-backup-entry-state]')).toHaveText(
    'CH 2 in force · from the backup engine',
  );

  // The backup engine as `2.9.2` publishes it: no `mirrorOf` — nothing is mapped, and every surface says so.
  const legacy = pairBackupCatalogue((primary as FakePlayout).baseUrl).map((r) => {
    const copy: Record<string, unknown> = { ...r };
    delete copy['mirrorOf'];
    delete copy['mirrors'];
    return copy as unknown as typeof r;
  });
  backup?.setChannels(legacy);
  await expect(row.locator('[data-backup-entry-state]')).toHaveText(
    'Not mapped · The backup engine publishes no mirrors (Playout before 2.9.5).',
    { timeout: 20_000 },
  );
  await expect(count).toHaveText('BACKUP B · 0 of 1 channels mapped');
  await expect(count).toHaveAttribute('data-backup-mapped', 'alarm');

  // A station admin enters CH 1 → CH 2: checked against the backup's list, and in force.
  await card.getByLabel('Backup channel for CH 1').fill('2');
  await card.getByRole('button', { name: 'Save backup channels' }).click();
  await expect(row.locator('[data-backup-entry-state]')).toHaveText(
    'CH 2 in force · from this entry',
    { timeout: 20_000 },
  );
  await expect(count).toHaveText('BACKUP B · 1 of 1 channels mapped');

  // Close the dialog: the channel's own line reads the entry's channel.
  await page.keyboard.press('Escape');
  await expect(line).toHaveText('Backup: CH 2 on 127.0.0.1');
});
