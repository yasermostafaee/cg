import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { isRegistryRecordName } from '../src/template-registry.js';
import { deadConnection, openClient } from './support/auth-harness.js';
import { track } from './support/harness.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `RELEASE-091-01` §1 (`B-288`) — **PVW GETS THE PAGE THE BRIDGE SERVES CASPARCG.** A console that
 * never imported a template asks `templates.page` and receives exactly the bytes
 * `/template/<id>~<version>` returns — the version the row's channel lists — or why there is none.
 */

const NEWS: TemplateInfo = { templateId: 'news', templateType: 'lower-third', fields: [] };
const NEWS_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>خبر</body></html>';

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

async function station(templatesDir: string, tracked = true): Promise<BridgeHandle> {
  const handle = await createBridge({
    port: 0,
    connection: deadConnection(),
    templatesDir,
    fixedLayers: [standardBank(1), standardBank(2)],
  });
  return tracked ? track(handle, (h) => h.close()) : handle;
}

it('🔴 the page on CH 1 is the served page, byte for byte — over the socket too; CH 2, which does not list it, answers not-listed', async () => {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-template-page-')), (d) =>
    fs.rmSync(d, { recursive: true, force: true }),
  );
  const handle = await station(path.join(root, 'templates'));
  expect(handle.runtime.templateImport(NEWS, NEWS_HTML, 1)).toMatchObject({
    registered: true,
  });

  const page = handle.runtime.templatePage('news', 1);
  expect(page).toEqual({ ok: true, html: NEWS_HTML });
  // The bytes CasparCG gets: the serve path's own answer (`B-293`: the path names the version).
  const served = await get(handle.runtime.templateServeUrl('news', 1) ?? '');
  expect(served.status).toBe(200);
  expect(page.ok && page.html).toBe(served.body);

  // Through the route a console calls — a read, answered on the socket.
  const client = await openClient(handle);
  const viaSocket = await client.ask('p1', 'templates.page', { templateId: 'news', channel: 1 });
  expect(viaSocket.error).toBeUndefined();
  expect(viaSocket.payload).toEqual({ ok: true, html: NEWS_HTML });

  // CONTROL — CH 2 does not list it.
  expect(handle.runtime.templatePage('news', 2)).toEqual({ ok: false, reason: 'not-listed' });
});

it('CONTROL — with its file gone from the store, a restarted bridge has no page for it: not-listed', async () => {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-template-page-')), (d) =>
    fs.rmSync(d, { recursive: true, force: true }),
  );
  const templatesDir = path.join(root, 'templates');
  const first = await station(templatesDir, false);
  expect(first.runtime.templateImport(NEWS, NEWS_HTML, 1)).toMatchObject({
    registered: true,
  });
  expect(first.runtime.templatePage('news', 1).ok).toBe(true);
  await first.close();

  const recordFiles = fs.readdirSync(templatesDir).filter(isRegistryRecordName);
  expect(recordFiles.length, 'the version was persisted').toBe(1);
  for (const f of recordFiles) fs.rmSync(path.join(templatesDir, f));

  const second = await station(templatesDir);
  expect(second.runtime.templatePage('news', 1)).toEqual({ ok: false, reason: 'not-listed' });
});
