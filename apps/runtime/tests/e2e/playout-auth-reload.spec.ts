import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  startFakePlayout,
  FAKE_OPERATOR,
  FAKE_PLAYOUT_PASSWORD,
  type FakePlayout,
} from '../../../../tools/caspar-bridge/tests/support/fake-playout.js';

/**
 * 🔴 `PLAYOUT-AUTH-01 · DELTA C` — **THE REAL PAGE, RELOADED, AGAINST A REAL BRIDGE.**
 *
 * ── WHY THIS EXISTS, AND WHY THE BRIDGE TEST DOES NOT REPLACE IT ────────────
 *
 * `DELTA B` shipped with a bridge-level spec that presents one token five times in a loop and
 * asserts a single `sign-in` row. It was red-before, it went green, and it was reported as the
 * evidence. The owner then reloaded a real browser and watched the row count climb anyway.
 *
 * The spec was not wrong about what it measured; it measured the wrong thing. A loop over one
 * socket is not a page load: a load re-runs `main.tsx`, re-reads `localStorage`, re-creates
 * `WebSocketRuntime`, opens a NEW socket, and re-runs the whole connect sequence. Every one of
 * those is a place the property could break, and none of them was in the loop.
 *
 * ⚠ **THIS SPEC IS THE AUTHORITATIVE ASSERTION** for "one sign-in per sign-in" and for
 * `DELTA A`'s "nothing is refused on a reconnect". The bridge-level specs stay as the
 * UNIT-LEVEL CONTROL — they localise a failure to the gate rather than to the page — but a
 * green from them is not a statement about what a reload does.
 *
 * ── WHAT THE OWNER'S DEFECT ACTUALLY WAS ────────────────────────────────────
 *
 * Measured on this rig, five real reloads, same `jti` throughout: a bridge built from the
 * commit BEFORE the fix wrote **6** `sign-in` rows; the fix wrote **1**. Nothing differed but
 * which source had been compiled — `pnpm dev:playout-auth` ran `bin/caspar-bridge.mjs`, which
 * imports `../dist/index.js`, and nothing built it. The script builds first now.
 *
 * ⚠ This spec is immune to that by construction: it spawns the CLI too, and `test:e2e` goes
 * through turbo, which builds the workspace before Playwright starts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const BRIDGE_CLI = path.join(REPO, 'tools/caspar-bridge/bin/caspar-bridge.mjs');

let playout: FakePlayout | null = null;
let bridge: ChildProcess | null = null;
let stateDir: string | null = null;

interface Station {
  readonly bridgeUrl: string;
  readonly auditPath: string;
}

/**
 * A fake Playout and a bridge in `auth: 'playout'` mode against it, both on loopback, with
 * every persisted path in a scratch directory.
 *
 * 🔴 The ES256 key is generated in memory at start and written nowhere, and the one password
 * is a constant that says so in its own name. Nothing here can reach the plant: the CasparCG
 * host is forced to `127.0.0.1` on a port nothing answers, which is all these specs need —
 * they are about the gate, not about air.
 */
async function startStation(): Promise<Station> {
  playout = await startFakePlayout();
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-auth-'));
  const auditPath = path.join(stateDir, 'audit.ndjson');
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
      '--live-layers-path',
      scratch('live.json'),
      '--audit-log-path',
      auditPath,
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

  /*
    ⚠ **WAIT FOR BOTH LINES, NOT THE FIRST ONE.** The bridge prints its URL and THEN its auth
    mode, so a wait that stopped at the URL could read `boot` before the mode line existed —
    and the control below would fail for a reason with nothing to do with the station. It did
    exactly that, once, in a parallel run. A flaky control is worse than none, because it gets
    deleted rather than fixed.

    Waiting for `auth: PLAYOUT` IS the positive control: a bridge that came up without a gate
    would make every assertion in this file vacuous, and it says which mode it is in itself.
  */
  const deadline = Date.now() + 30_000;
  let url: string | null = null;
  while (Date.now() < deadline) {
    const match = /WS listening on (ws:\/\/[^\s]+)/.exec(boot);
    if (match?.[1] !== undefined && boot.includes('auth: PLAYOUT')) {
      url = match[1];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (url === null) {
    throw new Error(`the bridge never started in auth mode; its boot output was:\n${boot}`);
  }
  return { bridgeUrl: url, auditPath };
}

/** Every audit row written so far. The RECORD, read from disk — not the panel's view of it. */
function auditRows(auditPath: string): { action: string; actor?: string; actorSub?: string }[] {
  if (!fs.existsSync(auditPath)) return [];
  return fs
    .readFileSync(auditPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { action: string; actor?: string; actorSub?: string });
}

test.afterEach(async () => {
  bridge?.kill('SIGINT');
  bridge = null;
  await playout?.stop();
  playout = null;
  if (stateDir !== null && fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  stateDir = null;
});

test('🔴 DELTA B — five RELOADS of the real page write ONE sign-in row', async ({ page }) => {
  const station = await startStation();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);

  await page.goto('/');

  // The gate is up, because the bridge advertises `auth: 'playout'` and nothing is held yet.
  const username = page.locator('#cg-signin-user');
  await expect(username).toBeVisible({ timeout: 20_000 });

  await username.fill(FAKE_OPERATOR.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Signed in: the gate lifts and the footer names the operator.
  await expect(username).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_OPERATOR.name);

  expect(
    auditRows(station.auditPath).filter((r) => r.action === 'sign-in'),
    'the one real sign-in was not recorded — the instrument is dead',
  ).toHaveLength(1);

  for (let reload = 1; reload <= 5; reload += 1) {
    await page.reload();
    /*
      ⚠ Waited on the PILL, not on a timer. The assertion is that the console came back signed
      in without asking, so the thing to wait for is the console saying so — a sleep would pass
      just as happily against a page that had not finished, which is how a flaky spec is born.
    */
    await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_OPERATOR.name, {
      timeout: 20_000,
    });
    await expect(
      page.locator('#cg-signin-user'),
      `reload ${String(reload)} asked again`,
    ).toHaveCount(0);
  }

  const signIns = auditRows(station.auditPath).filter((r) => r.action === 'sign-in');
  expect(
    signIns,
    'a reconnect was recorded as an act of the operator — one password, many sign-ins',
  ).toHaveLength(1);
  expect(signIns[0]?.actor).toBe(FAKE_OPERATOR.name);
  expect(signIns[0]?.actorSub).toBe(FAKE_OPERATOR.sub);
});

test('🔴 DELTA A — a reload is refused NOTHING, and the layer list arrives', async ({ page }) => {
  const station = await startStation();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(station.bridgeUrl)};`);

  /*
    Every refusal the console surfaces on a reconnect goes through the command toast and the
    resync-error reporter, and both end up in the page's console as an error. Collecting them
    is how this spec sees what the owner saw: a banner reading "This console is not signed in"
    on a console whose footer said it was.
  */
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/');
  const username = page.locator('#cg-signin-user');
  await expect(username).toBeVisible({ timeout: 20_000 });
  await username.fill(FAKE_OPERATOR.username);
  await page.locator('#cg-signin-pass').fill(FAKE_PLAYOUT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(username).toHaveCount(0, { timeout: 20_000 });

  for (let reload = 1; reload <= 5; reload += 1) {
    await page.reload();
    await expect(page.getByLabel('Sign-in state')).toContainText(FAKE_OPERATOR.name, {
      timeout: 20_000,
    });
  }

  expect(
    pageErrors.filter((text) => text.includes('not signed in')),
    'a signed-in console was told it is not signed in',
  ).toEqual([]);

  /*
    …and the layer list ARRIVED. The owner's second symptom was a panel stuck on
    "Loading the layer list…" forever, because its first read was refused and nothing retried.
    Asserting the ABSENCE of that text is the property; the station declares the built-in
    default bank, so rows are genuinely expected.
  */
  await expect(page.locator('[data-layers-loading]')).toHaveCount(0, { timeout: 20_000 });
});
