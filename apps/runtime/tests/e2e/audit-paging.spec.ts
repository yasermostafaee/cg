import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import { expect, test } from '@playwright/test';

/**
 * 🔴 `CONSOLE-POLISH-01` §9 (`R-083`) — the prompt's test: _"50,000 rows open in under 1 s with 100
 * rendered; paging and a filter return the right rows; control: a new row appears at the top live."_
 *
 * A real CG Bridge (in process, auth off) whose record holds 50,000 rows, a real `@cg/amcp-mock`
 * behind it, and the real console in Chromium — the only place "how many rows are in the document"
 * and "scrolling to the end brings the next page" can be measured (golden rule 12c).
 *
 * 🔴 Isolation: the record, the stack and the templates are scratch files; the mock is on loopback.
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } };
const ROWS = 50_000;

/** Row `n`, oldest first: a take on row 80 by `سارا` (every fifth) or `Reza`. */
function line(n: number): string {
  return JSON.stringify({
    ts: new Date(Date.parse('2026-10-01T00:00:00.000Z') + n * 1000).toISOString(),
    actor: n % 5 === 0 ? 'سارا' : 'Reza',
    action: 'take',
    itemId: `item-${String(n)}`,
    slot: { channel: 1, layer: 80, server: 'primary' },
    outcome: 'ok',
  });
}

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
let scratch: string | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

// A real bridge and a 10 MB record: serial, as a LOAD bound (`retention-honesty`).
test.describe.configure({ mode: 'serial' });

async function station(): Promise<string> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10, channels: 1 });
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-audit-paging-'));
  const auditLogPath = path.join(scratch, 'bridge-audit.ndjson');
  const lines: string[] = [];
  for (let n = 0; n < ROWS; n++) lines.push(line(n));
  fs.writeFileSync(auditLogPath, `${lines.join('\n')}\n`);
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  bridge = await createBridge({
    port: 0,
    connection,
    fixedLayers: BANK,
    auditLogPath,
    stackPath: path.join(scratch, 'bridge-stack.json'),
    templatesDir: path.join(scratch, 'templates'),
  });
  return bridge.url;
}

test('🔴 §9 — 50,000 rows: the newest within a second, at most 100 in the document; the end brings the next page; a filter brings only its rows; control: a new row arrives at the top', async ({
  page,
}) => {
  const url = await station();
  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(url)};`);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible({ timeout: 20_000 });

  // ── open: the newest rows within a second ──
  /*
    Timed from the moment the press LANDS, not from when it was asked for: Playwright's click first
    waits for the button to be actionable, and the console's start-up splash holds it for several
    seconds — that is the splash's time, not the Log's.
  */
  const door = page.getByRole('button', { name: 'Open audit log' });
  await door.click({ trial: true, timeout: 20_000 });
  const opened = Date.now();
  await door.click();
  const log = page.getByRole('dialog', { name: 'Audit log' });
  const rows = log.locator('[data-audit-row]');
  const itemOf = (i: number) => rows.nth(i).locator('[data-audit-id="item"]');
  await expect(itemOf(0)).toHaveAttribute('data-audit-full-id', 'item-49999', { timeout: 1000 });
  expect(Date.now() - opened, 'the first rows within 1 s of opening').toBeLessThan(1000);
  await expect(log.locator('[data-audit-count]')).toHaveText('100+ events');
  await expect(log.locator('[data-audit-rows]')).toHaveAttribute('data-audit-held', '100');
  const firstWindow = await rows.count();
  test
    .info()
    .annotations.push(
      { type: 'rows in the document', description: String(firstWindow) },
      { type: 'first rows after the press (ms)', description: String(Date.now() - opened) },
    );
  expect(firstWindow, 'rows in the document').toBeGreaterThan(0);
  expect(firstWindow, 'rows in the document').toBeLessThanOrEqual(100);
  // Fewer than the page holds: the list renders the rows in view, not the page.
  expect(firstWindow).toBeLessThan(100);

  // ── the end of the list brings the next page ──
  const table = log.locator('[data-audit-table]');
  await table.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(log.locator('[data-audit-rows]')).toHaveAttribute('data-audit-held', '200');
  await table.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  // Still a window, not the 200 held — and its last row is the 200th newest.
  await expect(rows.last().locator('[data-audit-id="item"]')).toHaveAttribute(
    'data-audit-full-id',
    /^item-49[78]\d\d$/,
  );
  expect(await rows.count()).toBeLessThanOrEqual(100);

  // ── a filter brings only its rows, newest first ──
  await log.locator('#audit-actor').fill('سارا');
  await expect(itemOf(0)).toHaveAttribute('data-audit-full-id', 'item-49995');
  await expect(itemOf(1)).toHaveAttribute('data-audit-full-id', 'item-49990');
  const actors = await log
    .locator('[data-audit-actor]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-audit-actor')));
  expect(actors.length).toBeGreaterThan(0);
  expect(new Set(actors)).toEqual(new Set(['سارا']));

  // ── CONTROL: a row recorded now arrives at the top, live ──
  await log.locator('[data-audit-reset]').click();
  await expect(itemOf(0)).toHaveAttribute('data-audit-full-id', 'item-49999');
  bridge?.runtime.recordAuthzRefusal({ actor: 'Nima', actorSub: 'u-9', channel: 'stack.take' });
  const top = rows.first();
  await expect(top.locator('[data-audit-actor]')).toHaveAttribute('data-audit-actor', 'Nima');
  await expect(top).toContainText('refused');
  // …and the rows held before it are still there beneath it.
  await expect(itemOf(1)).toHaveAttribute('data-audit-full-id', 'item-49999');
});
