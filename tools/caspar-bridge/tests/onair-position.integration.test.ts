import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * R-011 — operator position overrides ride the served URL query, through the
 * ONE ADD-construction path (`#sendAdd`), with the B-064 serve contract
 * untouched: the query is appended onto the RESOLVED http URL only, and the
 * queried URL still SERVES (the mock fetches + resolves it — never a bare
 * id). set-position is refused on air; overrides survive a setConfig
 * rebuild and die with the item's removal.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };
const POSITION = { anchor: 'bottom-right', offset: { x: -10, y: -20 } } as const;
const QUERY = '?pos=bottom-right&dx=-10&dy=-20';

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function boot(): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(singleServer(mock.amcpPort, oscPort));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(6000);
}

it('R-011: a stored position rides the ADD URL query; no override, no query; the take re-ADD inherits it; setConfig survives', async () => {
  await boot();

  // 1. No override → the CG ADD URL carries NO position query.
  expect((await runtime!.load('item1', 'lower-third', { headline: 'x' })).accepted).toBe(true);
  const bare = mock!.lastCgAdd(SLOT)?.template;
  expect(bare).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third$/);
  expect(bare).not.toContain('?');

  // 2. set-position on the LOADED-not-taken item → an invisible re-ADD
  //    re-serves with the query on the RESOLVED URL — and it still RESOLVES
  //    (served, never a bare id: the B-064 contract untouched).
  expect(await runtime!.setPosition('item1', POSITION)).toEqual({ ok: true });
  const withQuery = mock!.lastCgAdd(SLOT)?.template;
  expect(withQuery).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third\?/);
  expect(withQuery).toContain(QUERY);
  await expect(mock!.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');

  // 3. On air → set-position is REFUSED (bridge-authoritative).
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(await runtime!.setPosition('item1', { anchor: 'center', offset: { x: 0, y: 0 } })).toEqual(
    { ok: false, reason: 'on-air' },
  );

  // 4. Out (CLEAR destroys the producer) → take re-ADDs (B-039) and the
  //    fresh ADD carries the SAME stored query.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  expect((await runtime!.take('item1')).accepted).toBe(true);
  const retakeAdd = mock!.lastCgAdd(SLOT)?.template;
  expect(retakeAdd).toContain(QUERY);

  // 5. The override SURVIVES a setConfig rebuild (an operator placement is
  //    not server knowledge): out first (the on-air gate), apply the same
  //    config, reconnect, take → the re-ADD still carries the query.
  expect((await runtime!.out('item1')).accepted).toBe(true);
  const applied = await runtime!.setConfig(runtime!.config());
  expect(applied.ok).toBe(true);
  await runtime!.whenServerHealthy(6000);
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).toContain(QUERY);

  // 6. A second item with no override still ADDs query-free (per-item map).
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const second = mock!.lastCgAdd({ channel: 1, layer: 11 })?.template;
  expect(second).toMatch(/\/template\/lower-third$/);
  expect(second).not.toContain('?');
}, 30000);

it('set-position on an unknown item is refused; a removed item drops its override', async () => {
  await boot();

  expect(await runtime!.setPosition('ghost', POSITION)).toEqual({
    ok: false,
    reason: 'unknown-item',
  });

  // Store an override on a loaded item, remove it, then re-load the SAME
  // itemId — the fresh load must carry NO query (the override died with the
  // item, not the id).
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(await runtime!.setPosition('item1', POSITION)).toEqual({ ok: true });
  expect(mock!.lastCgAdd(SLOT)?.template).toContain(QUERY);
  expect((await runtime!.remove('item1')).accepted).toBe(true);
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).not.toContain('?');
}, 30000);

it('set-position on an IDLE item stores for the next load (no immediate re-ADD)', async () => {
  await boot();

  // Load then OUT: the producer is destroyed — the item is idle, no re-ADD
  // should fire on set-position (nothing to re-serve invisibly).
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  expect((await runtime!.out('item1')).accepted).toBe(true);
  const addBefore = mock!.lastCgAdd(SLOT)?.template;
  expect(await runtime!.setPosition('item1', POSITION)).toEqual({ ok: true });
  expect(mock!.lastCgAdd(SLOT)?.template).toBe(addBefore); // unchanged — stored only

  // The next ADD (the take re-ADD) picks the stored override up.
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).toContain(QUERY);
}, 30000);
