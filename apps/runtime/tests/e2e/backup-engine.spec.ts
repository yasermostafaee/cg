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
import { stopChild } from './fixtures/child-process.js';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **ONE PLAYOUT SESSION PER ENGINE, IN A REAL BROWSER.**
 *
 * Two fake engines with different keys and different passwords — the backup verifying every bearer
 * against its OWN key, so the primary's token is `401` there as on the real pair — and a real CG Bridge
 * whose server B is the backup. A station admin signs CG Bridge in on each engine from «Sign in CG
 * Bridge…»; the status bar and the check's Sign-in group follow, in words.
 *
 * Isolation by explicit flags, as `playout-authz.spec.ts`: every path a scratch file, both CasparCG
 * ports dead (`127.0.0.1:1`, `:2`), ephemeral ports. The fakes' keys live in memory only.
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
  // The backup engine's license does not include CG: its line must say so once it is signed in.
  backup.setLicense('not_included');
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-backup-engine-'));
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
      // The pair: server B on a dead port, and the backup ENGINE named outright (both fakes share
      // 127.0.0.1 and differ by port).
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

test('🔴 «Sign in CG Bridge…» names both engines; each is signed in with its own password; the status bar and the check follow', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const station = await startPair();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);
  await page.goto('/');
  await signInConsole(page);

  const bar = page.getByLabel('Status bar');
  // Neither engine signed in: a chip beside each server, in words.
  await expect(bar.locator('[data-engine-chip="primary"]')).toHaveText(/A: SIGN IN CG BRIDGE/, {
    timeout: 20_000,
  });
  await expect(bar.locator('[data-engine-chip="backup"]')).toHaveText(/B: SIGN IN CG BRIDGE/);

  // The dialog lists both engines, each with its address and its state.
  await page.getByRole('button', { name: 'Sign in CG Bridge…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in CG Bridge' });
  await expect(dialog.locator('[data-engine-row="primary"]')).toContainText('Primary engine');
  await expect(dialog.locator('[data-engine-row="backup"]')).toContainText('Backup engine');
  await expect(dialog.locator('[data-engine-row="backup"]')).toContainText(backup?.baseUrl ?? '');
  await expect(dialog.locator('[data-engine-row="backup"]')).toContainText(
    'Needs a station admin to sign in.',
  );
  await expect(dialog.locator('[data-password-where]')).toContainText(
    "Each engine's password is on that engine's",
  );

  // The primary, with its own password.
  await dialog.locator('#cg-bridge-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  await expect(bar.locator('[data-engine-chip="primary"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(bar.locator('[data-engine-chip="backup"]')).toHaveText(/B: SIGN IN CG BRIDGE/);
  await expect(page.locator('[data-bridge-session-banner]')).toContainText(
    'CG Bridge needs a station admin to sign in on the backup engine',
  );

  // The backup: the PRIMARY's password is refused there (each engine keeps its own) — then its own.
  await page.getByRole('button', { name: 'Sign in CG Bridge…' }).click();
  const again = page.getByRole('dialog', { name: 'Sign in CG Bridge' });
  await expect(again.getByRole('tab', { name: 'Backup engine' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await again.locator('#cg-bridge-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await again.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(again).toContainText('Backup engine: The username or password is wrong.');
  await again.locator('#cg-bridge-signin-pass').fill(BACKUP_PASSWORD);
  await again.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(again).toHaveCount(0, { timeout: 15_000 });

  // Signed in, the backup's own license reads not licensed — said beside BACKUP B, in words.
  await expect(bar.locator('[data-engine-chip="backup"]')).toHaveText(/B: CG NOT LICENSED/, {
    timeout: 20_000,
  });
  await expect(bar.locator('[data-engine-chip="backup"]')).toHaveAttribute(
    'title',
    'Backup engine: CG not licensed on this engine.',
  );
  await expect(bar.locator('[data-engine-chip="primary"]')).toHaveCount(0);

  // The check's Sign-in group: one line per engine, the backup's in words.
  await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Station setup' });
  const servers = setup.getByRole('tab', { name: /Servers/ });
  if ((await servers.getAttribute('aria-selected')) !== 'true') await servers.click();
  const signInGroup = setup.locator('[data-check-group="sign-in"]');
  await expect(signInGroup.locator('[data-check="bridge-session-backup"]')).toContainText(
    'CG Bridge on the backup engine: CG not licensed on this engine.',
    { timeout: 30_000 },
  );
  await expect(signInGroup.locator('[data-check="bridge-session-backup"]')).toHaveAttribute(
    'data-status',
    'fail',
  );
});
