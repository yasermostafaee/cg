import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dialog, Page } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';
import { stopChild } from './fixtures/child-process.js';
import { buildValidVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `R-094` — **CG CONTROL DOES NOT CLOSE ON A SLIP**, in a real browser.
 *
 *   - **The browser console's leave prompt**: against a REAL bridge in `auth: 'playout'` mode and a
 *     fake Playout (the `playout-auth-reload.spec.ts` station), a signed-out console's tab closes
 *     without a word and a signed-in one asks first. The signed-out case clicks into the page first,
 *     so its silence cannot be the browser's user-activation rule.
 *   - **CG Control's window close**: the shell faked through `__TAURI_INTERNALS__`, its ask sent as
 *     `close_window.rs` sends it (`cg:close-requested`). The RENDER check of `Close CG Control?`
 *     (golden rule 12) — the installed app is driven by the desktop smoke, and "closing sends nothing
 *     to CG Bridge" is pinned at the wire by `closeConsole.dom.test.ts`.
 *
 * 🔴 Isolation as `playout-authz.spec.ts` states it: every persisted path a scratch file, the
 * CasparCG host forced to `127.0.0.1` on a port nothing answers, both listening ports ephemeral.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

async function startStation(): Promise<{ bridgeUrl: string }> {
  playout = await startFakePlayout();
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-close-'));
  const scratch = (name: string): string => path.join(stateDir as string, name);
  bridge = spawn(
    process.execPath,
    [
      BRIDGE_CLI,
      '--auth',
      'playout',
      '--playout-issuer',
      playout.issuer,
      '--playout-jwks-url',
      playout.jwksUrl,
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
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
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
  // Both lines: `auth: PLAYOUT` is the positive control that the gate is up at all.
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
  await playout?.stop();
  playout = null;
  if (stateDir !== null && fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  stateDir = null;
});

/** Every dialog the page raises, by type — answered "stay", so a prompt that shows keeps the tab. */
function recordDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (d: Dialog) => {
    seen.push(d.type());
    void d.dismiss();
  });
  return seen;
}

test('🔴 the browser console asks before its tab is left while signed in — and not while signed out', async ({
  page,
  context,
}) => {
  const station = await startStation();
  await context.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);

  // CONTROL — signed out: the gate is up, the page has had a gesture, and the tab closes silently.
  await page.goto('/');
  const signedOutUser = page.locator('#cg-signin-user');
  await expect(signedOutUser).toBeVisible({ timeout: 20_000 });
  await signedOutUser.click();
  const seenSignedOut = recordDialogs(page);
  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  expect(seenSignedOut, 'a signed-out console asked before closing').toEqual([]);

  // Signed in: the same close asks first, and the tab stays.
  const console2 = await context.newPage();
  await console2.goto('/');
  const username = console2.locator('#cg-signin-user');
  await expect(username).toBeVisible({ timeout: 20_000 });
  await username.fill(FAKE_OPERATOR.username);
  await console2.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await console2.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(username).toHaveCount(0, { timeout: 20_000 });
  await expect(console2.getByLabel('Sign-in state')).toContainText(FAKE_OPERATOR.name);
  const seenSignedIn = recordDialogs(console2);
  await console2.close({ runBeforeUnload: true });
  await expect.poll(() => seenSignedIn).toContain('beforeunload');
  expect(console2.isClosed(), 'the tab stays: the prompt was answered "stay"').toBe(false);
});

test.describe('R-094 — CG Control’s window close (the shell faked)', () => {
  const said = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  const shellAsksToClose = (page: Page): Promise<void> =>
    page.evaluate(() => {
      window.dispatchEvent(new Event('cg:close-requested'));
    });

  test('🔴 a held close asks ONCE; the fact line counts what is on air; Enter and Escape keep the window; Close closes it', async ({
    app,
  }) => {
    const page = app.page;
    await page.addInitScript(() => {
      const w = window as unknown as { __said: string[]; __TAURI_INTERNALS__: unknown };
      w.__said = [];
      w.__TAURI_INTERNALS__ = {
        invoke: (command: string) => {
          w.__said.push(command);
          return Promise.resolve(command === 'keyboard_language' ? 'unknown' : null);
        },
      };
    });
    await app.goto();
    await expect.poll(() => said(page)).toContain('close_guard');

    const dialog = page.getByRole('dialog', { name: 'Close CG Control?' });
    /*
      The fact line is the console's ONE air count (`airTally`), so it must say what the layer
      table's header says. The offline mock seeds rows on air of its own; the count is read from
      the header rather than assumed (an assumed 0 met the mock's seeded 2 on the first run).
    */
    const headerTally = async (): Promise<number> => {
      const label = await page
        .getByLabel(/^\d+ items on air$/)
        .first()
        .getAttribute('aria-label');
      return Number(/^(\d+)/.exec(label ?? '')?.[1] ?? Number.NaN);
    };
    const factFor = (n: number): string =>
      n === 1 ? '1 item stays on air.' : `${String(n)} items stay on air.`;
    const before = await headerTally();
    expect(before, 'the header tally was read').toBeGreaterThan(0);

    await shellAsksToClose(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Close CG Control?' })).toBeVisible();
    await expect(dialog.locator('[data-modal-body]')).toHaveText(factFor(before));
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeFocused();
    await expect(dialog.locator('.cg-modal-footer button')).toHaveText(['Cancel', 'Close']);
    // A stray Enter presses Cancel: the window stays.
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect(await said(page)).not.toContain('close_window_now');

    // One more row on air: the fact line follows the stack, still agreeing with the header.
    const layer = await app.importVcg('close.vcg', await buildValidVcg('tpl-e2e-close'));
    await app.layerRow(layer).getByRole('button', { name: 'PLAY' }).click();
    await expect.poll(headerTally).toBe(before + 1);
    await shellAsksToClose(page);
    await expect(dialog.locator('[data-modal-body]')).toHaveText(factFor(before + 1));
    // A second close while it asks: still one dialog.
    await shellAsksToClose(page);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // Escape keeps the window.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await said(page)).not.toContain('close_window_now');

    // Closed again: Close closes the window — and the row is still on air behind it.
    await shellAsksToClose(page);
    // The ✕ is named `Close` and means Cancel; the window's Close is named for what it closes.
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Close CG Control', exact: true }).click();
    await expect.poll(() => said(page)).toContain('close_window_now');
    // …and nothing came off air: a window close is not a CLEAR.
    await page.waitForTimeout(500);
    expect(await headerTally(), 'a window close is not a CLEAR').toBe(before + 1);
  });
});
