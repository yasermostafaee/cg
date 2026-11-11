import * as dgram from 'node:dgram';
import { afterEach, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CG_LIVE_POSITION_PAGE_MARKER, type StackItemState } from '@cg/shared-schema';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { SAME_NUMBERS_ON_B } from './support/backup-map.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * R-011 — operator position overrides ride the served URL query, through the
 * ONE ADD-construction path (`#sendAdd`), with the B-064 serve contract
 * untouched: the query is appended onto the RESOLVED http URL only, and the
 * queried URL still SERVES (the mock fetches + resolves it — never a bare
 * id). set-position is refused on air; overrides survive a setConfig
 * rebuild and die with the item's removal.
 */

let mock: MockHandle | null = null;
let backup: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  await backup?.stop();
  backup = null;
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
const POSITION_HTML = HTML.replace('</head>', `${CG_LIVE_POSITION_PAGE_MARKER}</head>`);
const POSITION_TEMPLATE: TemplateInfo = {
  ...TEMPLATE,
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [],
  },
};
const SLOT = { channel: 1, layer: 10 };
const POSITION = { anchor: 'bottom-right', offset: { x: -10, y: -20 } } as const;
const QUERY = '?pos=bottom-right&dx=-10&dy=-20';
/**
 * R-030 — the CHANNEL RASTER now rides EVERY served ADD URL, whether or not the
 * operator has set a position override.
 *
 * That is why the "no override" cases below assert the absence of `pos=` rather
 * than the absence of a query string, and it is a re-expression of the R-011
 * property, not a relaxation of it: the property being protected is "an item
 * with no operator override carries no POSITION in its URL", and that is exactly
 * what `not.toContain('pos=')` says. Asserting no `?` at all conflated the
 * override with the query, and the raster has to be there independently —
 * gating it behind an override would leave every un-nudged graphic (the
 * majority) computing its authored position against the wrong frame on a
 * non-1080 channel, which is the C-018 defect surviving its own fix.
 *
 * 1920×1080 is the default a fresh install with no persisted channel settings
 * gets, and it is deliberately the reference raster — so this suite's ADDs are
 * scale-1 and byte-identical in placement to pre-R-030.
 */
const RASTER_QUERY = 'cw=1920&ch=1080';

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function boot(template = TEMPLATE, html = HTML, redundant = false): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  const config = singleServer(mock.amcpPort, oscPort);
  if (redundant) {
    const backupOscPort = await freeUdpPort();
    backup = await createMock({
      amcpPort: 0,
      oscPort: backupOscPort,
      oscHost: '127.0.0.1',
      oscHz: 30,
    });
    config.servers.B = { host: '127.0.0.1', amcpPort: backup.amcpPort, oscPort: backupOscPort };
  }
  runtime = new CasparRuntime(
    config,
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      ...(redundant && { backupChannels: SAME_NUMBERS_ON_B }),
    },
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(template, html);
  await runtime.whenServerHealthy(HEALTH_MS);
}

it('applies position and fields to the same resident programme page and keeps the previous values on refusal', async () => {
  await boot(POSITION_TEMPLATE, POSITION_HTML);
  const row = () => runtime!.stackSnapshot().find((item) => item.itemId === 'item1');
  await expect(
    runtime!.load('item1', 'lower-third', { headline: 'before' }),
  ).resolves.toMatchObject({ accepted: true });
  expect(row()?.onAirPosition).toBeUndefined();
  await expect(runtime!.update('item1', {}, 'merge', undefined, POSITION)).resolves.toMatchObject({
    accepted: false,
    errorCode: 'live-position-unavailable',
  });
  await expect(runtime!.take('item1')).resolves.toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ status: 'on-air', onAirPosition: true });
  const initialAdd = mock!.lastCgAdd(SLOT)?.template;
  const baseline = mock!.receivedCommands().length;
  const cgWrites = () =>
    mock!
      .receivedCommands()
      .slice(baseline)
      .map(({ line }) => line)
      .filter((line) => /^(CG |MIXER |PLAY |CLEAR )/.test(line));

  await expect(runtime!.update('item1', {}, 'merge', undefined, POSITION)).resolves.toEqual({
    accepted: true,
  });
  expect(JSON.parse(mock!.lastCgUpdate(SLOT)?.data ?? '{}')).toEqual({
    __cg: { position: POSITION },
  });
  expect(row()).toMatchObject({
    status: 'on-air',
    position: POSITION,
    fields: { headline: 'before' },
  });

  const next = { anchor: 'top-left', offset: { x: 17, y: 21 } } as const;
  await expect(
    runtime!.update('item1', { headline: 'after' }, 'merge', undefined, next),
  ).resolves.toEqual({ accepted: true });
  expect(JSON.parse(mock!.lastCgUpdate(SLOT)?.data ?? '{}')).toEqual({
    headline: 'after',
    __cg: { position: next },
  });
  expect(row()).toMatchObject({ status: 'on-air', position: next, fields: { headline: 'after' } });
  expect(cgWrites()).toHaveLength(2);
  expect(cgWrites().every((line) => line.startsWith('CG 1-10 UPDATE '))).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).toBe(initialAdd);

  mock!.setHandler('CG', () => ({ kind: 'err', code: 403, verb: 'CG', detail: 'UPDATE FAILED' }));
  await expect(
    runtime!.update('item1', { headline: 'refused' }, 'merge', undefined, POSITION),
  ).resolves.toMatchObject({ accepted: false, errorCode: 'amcp-403' });
  expect(row()).toMatchObject({ status: 'on-air', position: next, fields: { headline: 'after' } });
});

it('keeps a legacy resident page locked after a marked version is imported into its catalogue', async () => {
  await boot(POSITION_TEMPLATE);
  await runtime!.load('item1', 'lower-third', { headline: 'before' });
  await runtime!.take('item1');
  const row = () => runtime!.stackSnapshot().find((item) => item.itemId === 'item1');
  await expect.poll(() => row()?.status).toBe('on-air');
  runtime!.templateImport(POSITION_TEMPLATE, POSITION_HTML);
  expect(row()?.onAirPosition).toBeUndefined();
  await expect(
    runtime!.update('item1', { headline: 'refused' }, 'merge', undefined, POSITION),
  ).resolves.toMatchObject({ accepted: false, errorCode: 'live-position-unavailable' });
  expect(JSON.parse(mock!.lastCgUpdate(SLOT)?.data ?? '{}')).not.toHaveProperty('__cg.position');
  expect(row()).toMatchObject({ fields: { headline: 'before' } });
});

it('keeps Position available while unchanged HTML occupancy remains fresh after Take', async () => {
  await boot(POSITION_TEMPLATE, POSITION_HTML);
  const row = () => runtime!.stackSnapshot().find((item) => item.itemId === 'item1');
  await expect(runtime!.load('item1', 'lower-third', {})).resolves.toMatchObject({
    accepted: true,
  });
  await expect(runtime!.take('item1')).resolves.toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ status: 'on-air', onAirPosition: true });

  // Age out both prior observations. The next identical producer tick refreshes the raw
  // occupancy tap, but deduplication leaves the Reconciler at the acknowledged Take.
  const now = Date.now.bind(Date);
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now() + 3000);
  try {
    expect(row()).toMatchObject({ status: 'playing', pending: false });
    expect(row()?.onAirPosition).toBeUndefined();
    await expect.poll(row).toMatchObject({ status: 'playing', onAirPosition: true });
    await expect(runtime!.update('item1', {}, 'merge', undefined, POSITION)).resolves.toEqual({
      accepted: true,
    });
    expect(row()?.position).toEqual(POSITION);
  } finally {
    clock.mockRestore();
  }
});

it('retains the on-air position lock when another programme server is declared', async () => {
  await boot(POSITION_TEMPLATE, POSITION_HTML, true);
  await expect(runtime!.load('item1', 'lower-third', {})).resolves.toMatchObject({
    accepted: true,
  });
  await expect(runtime!.take('item1')).resolves.toMatchObject({ accepted: true });
  const row = () => runtime!.stackSnapshot().find((item) => item.itemId === 'item1');
  await expect.poll(() => row()?.status).toBe('on-air');
  expect(row()?.onAirPosition).toBeUndefined();
  expect(backup!.lastCgAdd(SLOT)).toBeDefined();
  const before = mock!.lastCgUpdate(SLOT);
  const backupBefore = backup!.lastCgUpdate(SLOT);
  await expect(runtime!.update('item1', {}, 'merge', undefined, POSITION)).resolves.toMatchObject({
    accepted: false,
    errorCode: 'live-position-unavailable',
  });
  expect(mock!.lastCgUpdate(SLOT)).toEqual(before);
  expect(backup!.lastCgUpdate(SLOT)).toEqual(backupBefore);
});

it('R-011: a stored position rides the ADD URL query; no override, no query; the take re-ADD inherits it; setConfig survives', async () => {
  await boot();

  // 1. No override → the CG ADD URL carries NO POSITION, and (R-030) the
  //    channel raster regardless.
  expect((await runtime!.load('item1', 'lower-third', { headline: 'x' })).accepted).toBe(true);
  const bare = mock!.lastCgAdd(SLOT)?.template;
  expect(bare).toMatch(
    // `B-293` — the path names the version: `<templateId>~<versionId>`.
    new RegExp(`^http://127\\.0\\.0\\.1:\\d+/template/lower-third~[0-9a-f]{16}\\?${RASTER_QUERY}$`),
  );
  expect(bare).not.toContain('pos=');
  expect(bare).not.toContain('dx=');

  // 2. set-position on the LOADED-not-taken item → an invisible re-ADD
  //    re-serves with the query on the RESOLVED URL — and it still RESOLVES
  //    (served, never a bare id: the B-064 contract untouched).
  expect(await runtime!.setPosition('item1', POSITION)).toEqual({ ok: true });
  const withQuery = mock!.lastCgAdd(SLOT)?.template;
  expect(withQuery).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/template\/lower-third~[0-9a-f]{16}\?/);
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
  await runtime!.whenServerHealthy(HEALTH_MS);
  expect((await runtime!.take('item1')).accepted).toBe(true);
  expect(mock!.lastCgAdd(SLOT)?.template).toContain(QUERY);

  // 6. A second item with no override still ADDs POSITION-free — the override
  //    map is per item, and item1's placement must not leak onto item2. The
  //    raster is shared because it is a property of the CHANNEL, not the item.
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const second = mock!.lastCgAdd({ channel: 1, layer: 11 })?.template;
  expect(second).toMatch(new RegExp(`/template/lower-third~[0-9a-f]{16}\\?${RASTER_QUERY}$`));
  expect(second).not.toContain('pos=');
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
  // The override died with the item, not with the id — so no POSITION rides the
  // fresh load. The raster still does (R-030): it belongs to the channel and was
  // never the removed item's to drop.
  expect(mock!.lastCgAdd(SLOT)?.template).not.toContain('pos=');
  expect(mock!.lastCgAdd(SLOT)?.template).toContain(RASTER_QUERY);
}, 30000);

/**
 * B-072 — the stored override is READ-BACK on the item-state stream. R-011
 * stored it and honoured it on air, but nothing carried it home: the picker
 * re-seeded from the manifest default on every reselect, so the UI lied about
 * what was applied — and an innocent re-Apply then overwrote the good on-air
 * override with the default. The override must ride BOTH renderer-facing
 * exits (`stackSnapshot()` and the `stackChanged` push), survive re-reads, and
 * disappear on remove (inheriting R-011's delete-on-remove, not re-doing it).
 */
it('B-072: the stored override is published in item state on BOTH snapshot and state-changed', async () => {
  await boot();

  const pushes: (readonly StackItemState[])[] = [];
  const off = runtime!.stackChanged.subscribe((s) => pushes.push(s));
  try {
    expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);

    // Before any override: published state carries NO position (the consumer
    // falls back to the template's manifest default).
    const before = runtime!.stackSnapshot().find((i) => i.itemId === 'item1');
    expect(before).toBeDefined();
    expect(before?.position).toBeUndefined();

    expect(await runtime!.setPosition('item1', POSITION)).toEqual({ ok: true });

    // 1. The SNAPSHOT channel carries the override.
    const snap = runtime!.stackSnapshot().find((i) => i.itemId === 'item1');
    expect(snap?.position).toEqual(POSITION);

    // 2. The STATE-CHANGED push carries it too (same join, both exits).
    await vi.waitFor(() => {
      const latest = pushes.at(-1)?.find((i) => i.itemId === 'item1');
      expect(latest?.position).toEqual(POSITION);
    });

    // 3. Re-reading (the deselect → reselect analogue) still yields it: the
    //    read is idempotent, never consumed by the ADD that used it.
    expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')?.position).toEqual(POSITION);
    expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')?.position).toEqual(POSITION);

    // 4. A second item with no override publishes none (per-item, not global).
    expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
    expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item2')?.position).toBeUndefined();

    // 5. Removal clears it — the published state inherits delete-on-remove.
    expect((await runtime!.remove('item1')).accepted).toBe(true);
    expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')).toBeUndefined();
    expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
    expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item1')?.position).toBeUndefined();
  } finally {
    off();
  }
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
