import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBridge } from '@cg/caspar-bridge';
import { expect, test } from '@playwright/test';

test('the audit log downloads the ticketed Bridge ZIP without leaving the console', async ({
  page,
}, testInfo) => {
  const directory = testInfo.outputPath('bridge');
  const logsDir = path.join(directory, 'logs');
  await mkdir(logsDir, { recursive: true });
  await writeFile(path.join(logsDir, 'bridge.log'), 'Local audit archive fixture\n');
  const bridge = await createBridge({
    host: '127.0.0.1',
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    logsDir,
    fixedLayers: { channel: 1, start: 80, count: 4, low: { start: 50, count: 10 } },
    stackPath: path.join(directory, 'stack.json'),
    templatesDir: path.join(directory, 'templates'),
  });
  try {
    await page.addInitScript((url) => {
      Object.assign(window, { __CG_BRIDGE_URL__: url, __CG_SPLASH_DISABLED__: true });
    }, bridge.url);
    const bridgeOrigin = new URL(bridge.url.replace(/^ws/, 'http')).origin;
    // Keep the test on the loopback fixture even when a workstation download hook
    // intercepts .zip requests in the browser. CG Bridge still redeems the actual ticket.
    await page.route(
      (url) => url.origin === bridgeOrigin && url.pathname === '/logs.zip',
      async (route) => {
        const response = await fetch(route.request().url(), {
          headers: { Origin: new URL(page.url()).origin },
          redirect: 'error',
        });
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      },
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Open audit log' }).click();
    const audit = page.getByRole('dialog', { name: 'Audit log' });
    const button = audit.getByRole('button', { name: 'Download logs' });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cg-bridge-logs-.+\.zip$/);
    const saved = await download.path();
    if (saved === null) throw new Error('The browser reported a download with no saved file.');
    const archive = await readFile(saved);
    expect(archive.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(archive.includes(Buffer.from('bridge.log'))).toBe(true);
    await expect(audit).toBeVisible();

    await page.route('**/logs.zip?*', (route) =>
      route.fulfill({
        status: 403,
        headers: { 'access-control-allow-origin': '*' },
        body: 'forbidden',
      }),
    );
    await button.click();
    await expect(audit.getByRole('alert')).toContainText(
      'CG Bridge did not provide the log archive (HTTP 403: forbidden).',
    );
  } finally {
    await bridge.close();
  }
});
