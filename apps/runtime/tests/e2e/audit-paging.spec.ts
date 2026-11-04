import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import { expect, test } from '@playwright/test';

/**
 * 🔴 `CONSOLE-POLISH-01` §9 (`R-083`) — 50,000 rows open through explicit 25-row pages;
 * paging and a filter return the right rows; control: a new row appears at the top live.
 *
 * A real CG Bridge (in process, auth off) whose record holds 50,000 rows, a real `@cg/amcp-mock`
 * behind it, and the real console in Chromium — the only place "how many rows are in the document"
 * and the operator-facing paging controls can be measured (golden rule 12c).
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

test('🔴 §9 — 50,000 rows: explicit 25-row pages, server filters, and live page 1', async ({
  page,
}) => {
  const url = await station();
  const auditFrames: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', (event) => {
      if (typeof event.payload === 'string' && event.payload.includes('audit.page')) {
        auditFrames.push(event.payload);
      }
    });
  });
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
  const itemOf = (i: number) => rows.nth(i);
  await expect(itemOf(0)).toHaveAttribute('data-audit-item-id', 'item-49999', { timeout: 1000 });
  expect(auditFrames.at(-1)).toContain('"limit":25');
  expect(Date.now() - opened, 'the first rows within 1 s of opening').toBeLessThan(1000);
  await expect(log.locator('[data-audit-count]')).toHaveText('25 events');
  await expect(log.locator('[data-audit-total]')).toHaveText('50000 events total', {
    timeout: 20_000,
  });
  await expect(log.locator('[data-audit-rows]')).toHaveAttribute('data-audit-held', '25');
  await expect(itemOf(0).locator('[data-audit-channel]')).toHaveText('CH 1');
  await expect(itemOf(0)).not.toContainText('View details');
  const columnNames = ['channel', 'time', 'actor', 'action', 'item', 'result'] as const;
  await expect
    .poll(async () =>
      log
        .locator('[data-audit-head] [data-audit-column]')
        .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-audit-column'))),
    )
    .toEqual(columnNames);
  for (const column of columnNames) {
    const heading = await log.locator(`[data-audit-column="${column}"]`).boundingBox();
    const value = await itemOf(0).locator(`[data-audit-cell="${column}"]`).boundingBox();
    expect(heading, `${column} heading has geometry`).not.toBeNull();
    expect(value, `${column} value has geometry`).not.toBeNull();
    expect(
      Math.abs((heading?.x ?? 0) - (value?.x ?? 0)),
      `${column} heading aligns with its value`,
    ).toBeLessThanOrEqual(1);
  }
  const itemBox = await itemOf(0).locator('[data-audit-cell="item"]').boundingBox();
  const resultBox = await itemOf(0).locator('[data-audit-cell="result"]').boundingBox();
  expect(itemBox, 'Item has geometry with details open').not.toBeNull();
  expect(resultBox, 'Result has geometry with details open').not.toBeNull();
  expect((itemBox?.x ?? 0) + (itemBox?.width ?? 0)).toBeLessThanOrEqual((resultBox?.x ?? 0) + 1);
  await expect(itemOf(0).locator('[data-audit-cell="item"]')).toHaveCSS('overflow', 'hidden');

  const footerBox = await log.locator('[data-audit-footer]').boundingBox();
  const pagerBox = await log.getByLabel('Audit pages').boundingBox();
  const closeBox = await log.locator('[data-audit-close]').boundingBox();
  expect(footerBox, 'the Audit footer has geometry').not.toBeNull();
  expect(pagerBox, 'Previous/Next have geometry').not.toBeNull();
  expect(closeBox, 'Close has geometry').not.toBeNull();
  const footerCentre = (footerBox?.x ?? 0) + (footerBox?.width ?? 0) / 2;
  const pagerCentre = (pagerBox?.x ?? 0) + (pagerBox?.width ?? 0) / 2;
  expect(Math.abs(footerCentre - pagerCentre), 'Previous/Next stay centred').toBeLessThanOrEqual(1);
  expect(
    (closeBox?.x ?? 0) - ((pagerBox?.x ?? 0) + (pagerBox?.width ?? 0)),
    'Previous/Next are separated from Close',
  ).toBeGreaterThan(24);

  await itemOf(0).click();
  await expect(itemOf(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(log.locator('[data-audit-details]')).toHaveCount(0);
  await itemOf(0).click();
  await expect(itemOf(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(log.locator('[data-audit-details]')).toBeVisible();
  // Opening the dialog can leave the pointer over its first row, depending on the viewport.
  // Measure the resting colour from a known pointer position before proving the hover state.
  await page.mouse.move(0, 0);
  const hoverTarget = itemOf(1); // Row 0 is selected automatically; row 1 remains a hover control.
  const restBackground = await hoverTarget.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await hoverTarget.hover();
  await expect(hoverTarget).toHaveCSS('background-color', 'rgb(40, 52, 67)');
  expect(restBackground).not.toBe('rgb(40, 52, 67)');
  const firstWindow = await rows.count();
  test
    .info()
    .annotations.push(
      { type: 'rows in the document', description: String(firstWindow) },
      { type: 'first rows after the press (ms)', description: String(Date.now() - opened) },
    );
  expect(firstWindow, 'rows in the document').toBe(25);

  // ── explicit Next/Previous use the bridge cursor ──
  await log.getByRole('button', { name: 'Next audit page' }).click();
  await expect(log.locator('[data-audit-page]')).toHaveText('Page 2');
  await expect(itemOf(0)).toHaveAttribute('data-audit-item-id', 'item-49974');
  await log.getByRole('button', { name: 'Previous audit page' }).click();
  await expect(log.locator('[data-audit-page]')).toHaveText('Page 1');
  await expect(itemOf(0)).toHaveAttribute('data-audit-item-id', 'item-49999');

  // ── a filter brings only its rows, newest first ──
  await log.locator('#audit-actor').fill('سارا');
  await expect(itemOf(0)).toHaveAttribute('data-audit-item-id', 'item-49995');
  await expect(itemOf(1)).toHaveAttribute('data-audit-item-id', 'item-49990');
  const actors = await log
    .locator('[data-audit-actor]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-audit-actor')));
  expect(actors.length).toBeGreaterThan(0);
  expect(new Set(actors)).toEqual(new Set(['سارا']));
  await expect(log.locator('[data-audit-total]')).toHaveText('10000 events total', {
    timeout: 20_000,
  });

  // ── CONTROL: a row recorded now arrives at the top, live ──
  await log.locator('[data-audit-reset]').click();
  await expect(itemOf(0)).toHaveAttribute('data-audit-item-id', 'item-49999');
  bridge?.runtime.recordAuthzRefusal({ actor: 'Nima', actorSub: 'u-9', channel: 'stack.take' });
  const top = rows.first();
  await expect(top.locator('[data-audit-actor]')).toHaveAttribute('data-audit-actor', 'Nima');
  await expect(top).toContainText('refused');
  await expect(log.locator('[data-audit-total]')).toHaveText('50001 events total');
  // …and the rows held before it are still there beneath it.
  await expect(itemOf(1)).toHaveAttribute('data-audit-item-id', 'item-49999');
});
