import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import { expect, test } from '@playwright/test';
import { buildValidVcg } from './fixtures/runtime.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **CG CONTROL REBUILDS WHAT IT CAN, AND NAMES WHAT IT CANNOT.**
 *
 * A real CG Bridge (in process, auth off) behind a real `@cg/amcp-mock`, and the real console in
 * Chromium — the only place the console's own bake (its runtime bundle, its fonts) actually runs.
 * The bridge holds two templates on CH 1, as an upgraded station would:
 *
 *   - `tpl-kept` — imported by an earlier CG Control WITH its verified package kept: the console
 *     rebuilds it on connect, and one `template-rebuild` row says so; it moves to a new path.
 *   - `tpl-legacy` — imported before packages were kept: it cannot be rebuilt, and the Library
 *     names it once — "Re-import 1 template" — and nothing else about it changes.
 *
 * 🔴 Isolation: the templates, the stack and the record are scratch files; the mock is on loopback.
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } };
/** A runtime no console in this build has — an earlier release's. */
const EARLIER = { consoleVersion: '0.0.1', runtimeBuild: 'aaaaaaaaaaaaaaaa' };

const KEPT: TemplateInfo = {
  templateId: 'tpl-kept',
  name: 'e2e-lower-third',
  templateType: 'lower-third',
  fields: [],
};
const LEGACY: TemplateInfo = {
  templateId: 'tpl-legacy',
  name: 'زیرنویس قدیمی',
  templateType: 'lower-third',
  fields: [],
};

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

// A real bridge: serial, as a LOAD bound (`retention-honesty`).
test.describe.configure({ mode: 'serial' });

async function station(): Promise<{ url: string; handle: BridgeHandle }> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10, channels: 1 });
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-e2e-page-rebuild-'));
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  const handle = await createBridge({
    port: 0,
    connection,
    fixedLayers: BANK,
    stackPath: path.join(scratch, 'bridge-stack.json'),
    templatesDir: path.join(scratch, 'templates'),
  });
  bridge = handle;
  const rt = handle.runtime;
  // The upgraded station's library: one page whose package was kept, one from before.
  const bytes = Buffer.from(await buildValidVcg('tpl-kept'));
  const put = rt.templateSourcePut(bytes.toString('base64'));
  if (!put.stored || put.sha256 === undefined) throw new Error('the package was not kept');
  rt.templateImport(KEPT, '<!doctype html><html><body>earlier page</body></html>', 1, {
    build: EARLIER,
    sourceSha256: put.sha256,
  });
  rt.templateImport(LEGACY, '<!doctype html><html><body>legacy page</body></html>', 1);
  return { url: handle.url, handle };
}

test('🔴 on connect the console rebuilds the kept page (one audit row, a new path) and the Library names the one it cannot, once', async ({
  page,
}) => {
  const { url, handle } = await station();
  const rt = handle.runtime;
  const earlierPath = rt.templateServeUrl('tpl-kept', 1);
  expect(earlierPath).not.toBeNull();

  await page.addInitScript(`window.__CG_BRIDGE_URL__ = ${JSON.stringify(url)};`);
  await page.goto('/');
  const layers = page.getByRole('region', { name: 'Layers' });
  await expect(layers).toBeVisible({ timeout: 20_000 });

  // ── the kept page is rebuilt by THIS console's runtime, once, at a new path ──
  await expect
    .poll(async () => (await rt.auditRecent(20, 'template-rebuild')).length, { timeout: 20_000 })
    .toBe(1);
  const [row] = await rt.auditRecent(20, 'template-rebuild');
  expect(row).toMatchObject({
    action: 'template-rebuild',
    templateId: 'tpl-kept',
    outcome: 'ok',
    rebuild: { name: 'e2e-lower-third', from: EARLIER },
  });
  expect(row?.rebuild?.to.runtimeBuild).not.toBe(EARLIER.runtimeBuild);
  const rebuiltPath = rt.templateServeUrl('tpl-kept', 1);
  expect(rebuiltPath).not.toBe(earlierPath);
  expect(rt.templateHtml('tpl-kept', 1)).toContain('CG.createRuntime(scene');
  // The legacy page is untouched: no rebuild row for it, and the page it had.
  expect(rt.templateHtml('tpl-legacy', 1)).toContain('legacy page');

  // ── the Library names the one it cannot rebuild, once ──
  await layers.locator('[data-layer="80"]').getByRole('button', { name: 'LOAD' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker).toBeVisible();
  const line = picker.locator('[data-template-reimport]');
  await expect(line).toHaveAttribute('data-template-reimport', '1');
  await expect(line).toContainText('Re-import 1 template');
  await expect(line.locator('bdi')).toHaveText(['زیرنویس قدیمی']);
  // Nothing else changes for it: both templates are still listed.
  await expect(picker.locator('[data-template-list] [data-template-id="tpl-legacy"]')).toHaveCount(
    1,
  );
  await expect(picker.locator('[data-template-list] [data-template-id="tpl-kept"]')).toHaveCount(1);
});
