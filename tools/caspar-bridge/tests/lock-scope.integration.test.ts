import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import type { AuditEntry } from '@cg/shared-schema';
import {
  AUTHZ_ROLE_REFUSAL,
  authzChannelRefusal,
  channelNotDeclaredRefusal,
  LOCK_ENGAGED_REFUSAL,
  type ConnectionConfig,
  type LockState,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  type Client,
} from './support/auth-harness.js';
import type { FakePlayout, IssueTokenOptions } from './support/fake-playout.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `B-257` / `B-258` / `B-259` / `B-260` — **THE LOCK COVERS THE ENGAGER'S CHANNELS, AND THE
 * AUTH AXIS STOPS INHERITING THE LOCK'S REASONS WHERE THEY DO NOT TRANSFER.**
 *
 * `BRIDGE-TRUTH-01` §1's throwaway measurement, made permanent. The defect: the lock was one
 * per bridge and refused every verb on every channel, while its PIN was known only to whoever
 * engaged it — so an operator granted channel 1 could lock an operator of channel 2 out of
 * CLEAR and PANIC on a channel the first one held no grant for.
 *
 * ⚠ **THE STATION HAS ONE DECLARED CHANNEL TODAY.** `#declaredChannels()` is the bank's channel
 * and nothing else, so a principal's `permittedChannels` — and therefore what a lock covers — is
 * at most that one channel. The channel-2 operator below holds a real grant for channel 2 on
 * this station's host, and holds nothing the lock can cover. That is the shape B-257 was measured
 * in.
 *
 * 🔴 `CHANNEL-AUTHORITY-01` — **and channel 2 is not THIS STATION's channel, so its CLEAR is
 * refused — by the STATION fence, never by the lock.** This spec used to assert, as the fix, that
 * the channel-2 operator's `layers.clear` on channel 2 reached the wire as `CLEAR 2-40`: the
 * permission gate honoured the grant, and nothing asked whether this station operates channel 2.
 * That is the hazard `CHANNEL-AUTHORITY-01` closes — a grant is a fact about a PERSON, and it put
 * a write on a channel the station does not declare. B-257's own property is unchanged and still
 * proven at the wire: the lock does not reach this operator, whose PANIC passes and lands.
 *
 * 🔴 **EVERY ABSENCE HERE HAS ITS POSITIVE CONTROL NAMED BESIDE IT.** A refusal that did not
 * happen proves something only when the same instrument, on the same socket, was shown to
 * refuse something else — or to reach the wire.
 */

let mock: MockHandle | null = null;
let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;
let tracePath: string | null = null;
let foreign: AmcpTransport | null = null;

afterEach(async () => {
  foreign?.destroy();
  foreign = null;
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
});

const HOST = '127.0.0.1';
const CH1 = [{ host: HOST, channel: 1 }] as const;

/** Beds 50-58 < band 60-69 < reservation 70-79 < operator rows 80-99 — the boot suite's S6 layout. */
const BANK = { channel: 1, low: { start: 50, count: 9 }, start: 80, count: 20 };
const BED_ROW = 58;
/** A layer outside every range this station declares, on either channel. */
const FREE = 40;

const TEMPLATE: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'two-box',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 100, y: 100, width: 400, height: 225 },
        dynamic: false,
      },
    ],
  },
};
const HTML = '<!doctype html><html><body>two-box</body></html>';

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
  ],
  layerRange: { start: 60, end: 69 },
};
const ASSIGNMENTS: SourceAssignments = {
  assignments: [{ templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-a' }],
};

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, HOST, () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: HOST, amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** Every AMCP line the fake CasparCG RECEIVED, in order. */
async function wire(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/** An auth-ON bridge in front of a two-channel fake CasparCG, with a live-source template. */
async function station(): Promise<void> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-lock-scope-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: HOST,
    oscHz: 30,
    tracePath,
    channels: 2,
  });
  const started = await startAuthedBridge({
    connection: singleServer(mock.amcpPort, oscPort),
    fixedLayers: BANK,
    reservedLayers: { ranges: [{ from: 70, to: 79 }] },
    sourceCatalog: CATALOG,
    sourceAssignments: ASSIGNMENTS,
  });
  handle = started.handle;
  playout = started.playout;
  await handle.runtime.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(handle.runtime);
}

async function signedIn(options: IssueTokenOptions): Promise<Client> {
  if (handle === null || playout === null) throw new Error('no station');
  const client = await openClient(handle);
  const issued = await playout.issueToken(options);
  const res = await client.authenticate(`auth-${String(Math.random())}`, issued.token);
  if (res.error !== undefined) throw new Error(`fixture token rejected: ${res.error}`);
  return client;
}

/** Channel 1's operator: the engager. */
const A: IssueTokenOptions = { user: 'operator', cgChannels: CH1 };
/** Channel 2's operator — `cg-op-ch2`, a different person, full operator role, channel 2 only. */
const B: IssueTokenOptions = { user: 'channelTwo' };
/** A SECOND principal holding channel 1. */
const C: IssueTokenOptions = { user: 'longName', cgChannels: CH1 };

/**
 * Put an html producer on a channel-2 layer from ANOTHER AMCP client, the way the orphan suite
 * does — somebody else's graphic, on a channel this station does not declare.
 *
 * ⚠ It stays, although B's CLEAR on channel 2 no longer reaches it: this is the producer the
 * spec's `CLEAR 2-40` used to land on before `CHANNEL-AUTHORITY-01`. With it present, a CLEAR the
 * fence failed to stop WOULD reach the wire (`clearLayer` clears an observed html producer), so
 * "nothing addressed channel 2" measures the fence and not an empty layer.
 */
async function foreignHtmlOnChannelTwo(): Promise<void> {
  if (mock === null) throw new Error('no mock');
  foreign = new AmcpTransport();
  await foreign.connect(mock.host, mock.amcpPort);
  await new CommandQueue(foreign).enqueue(`PLAY 2-${String(FREE)} "foreign" HTML`);
}

/** Every line whose target is channel 2, in both spellings (`CLEAR 2-40`, `CLEAR 2`). */
const onChannelTwo = (lines: readonly string[]): string[] =>
  lines.filter((l) => /^[A-Z][A-Z ]*?\s2(?:-\d+)?(?:\s|$)/.test(l));

/** Put a raised plate on air on channel 1, as A — so PANIC has something to reach. */
async function onAir(a: Client): Promise<void> {
  expect((await a.ask('i', 'templates.import', { template: TEMPLATE, html: HTML })).error).toBe(
    undefined,
  );
  const load = await a.ask('l', 'fixedLayers.load', {
    channel: 1,
    layer: BED_ROW,
    itemId: 'row-1',
    templateId: 'two-box',
    fields: {},
  });
  expect(load.error).toBe(undefined);
  const take = await a.ask('t', 'stack.take', { itemId: 'row-1' });
  expect(take.error, 'the take was refused').toBe(undefined);
  expect((take.payload as { accepted: boolean }).accepted, JSON.stringify(take.payload)).toBe(true);
  const raise = await a.ask('v', 'stack.set-plate-volume', {
    itemId: 'row-1',
    plateId: 'guest-1',
    volume: 1,
  });
  expect(raise.error).toBe(undefined);
}

describe('B-257 — a lock covers the ENGAGER’S channels, captured at engage', () => {
  it('channel 1 locks; channel 2’s operator is not locked — PANIC lands, and channel 2 is not this station’s; B-229 holds on channel 1', async () => {
    await station();
    const a = await signedIn(A);
    const b = await signedIn(B);
    const c = await signedIn(C);
    await onAir(a);

    // Positive control 1 — A on channel 2 meets the STATION fence (`CHANNEL-AUTHORITY-01`), which
    // answers before permission: channel 2 is not this station's, whoever asks. The channel gate's
    // own liveness is positive control 3 below, on channel 1, which this station does declare.
    const aOnTwo = await a.ask('a1', 'layers.clear', { channel: 2, layer: FREE });
    expectRefusedWith(aOnTwo.error, channelNotDeclaredRefusal(2), 'A cleared channel 2');

    expect((await a.ask('a2', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    const lock = (await b.ask('s', 'lock.state')).payload as LockState;
    // The covered set is A's channels — captured, on the wire, for every console to read.
    expect(lock).toMatchObject({ engaged: true, channels: [1] });

    // B's CLEAR on channel 2 is refused — by the STATION, NOT by the lock, and nothing reaches
    // channel 2. `CHANNEL-AUTHORITY-01` inverted this line: it was asserted here as B-257's fix
    // that the clear landed as `CLEAR 2-40`, a write to a channel this station does not operate.
    await foreignHtmlOnChannelTwo();
    const before = (await wire()).length;
    const clear = await b.ask('b1', 'layers.clear', { channel: 2, layer: FREE });
    expectRefusedWith(clear.error, channelNotDeclaredRefusal(2), 'B cleared channel 2');
    expect(clear.error, 'the lock reached B').not.toBe(LOCK_ENGAGED_REFUSAL);

    // THE FIX — B's PANIC passes the lock and reaches the wire. ⚠ PANIC is unscoped (A16): it
    // silences the WHOLE ledger, and the ledger's seats are on channel 1 because that is where
    // this station's rows are. The lock does not re-scope it; it only no longer refuses it.
    // ⭐ It is also the positive control for the silence above: the trace is live, and it
    // carries B's PANIC while carrying nothing for channel 2.
    const panicFrom = (await wire()).length;
    const panic = await b.ask('b2', 'stack.silence-all-live-plates');
    expect(panic.error, 'B was refused PANIC').toBe(undefined);
    expect((await wire()).slice(panicFrom).some((l) => /^MIXER 1-6\d VOLUME 0\b/.test(l))).toBe(
      true,
    );
    expect(onChannelTwo((await wire()).slice(before)), 'something reached channel 2').toEqual([]);

    // CLEAR ALL — the bulk rule decides it, all-or-nothing, and the reason is NOT the lock: the
    // stack's only row is on channel 1, which B does not hold.
    const all = await b.ask('b3', 'stack.clear-all');
    expectRefusedWith(all.error, authzChannelRefusal(1), 'B cleared a channel-1 stack');
    expect(all.error).not.toBe(LOCK_ENGAGED_REFUSAL);

    // Positive control 2 — `B-229` INTACT inside the scope: a second channel-1 principal meets
    // the LOCK on channel 1, CLEAR and PANIC alike (constraint 3).
    const cClear = await c.ask('c1', 'layers.clear', { channel: 1, layer: FREE });
    expectRefusedWith(cClear.error, LOCK_ENGAGED_REFUSAL, 'C cleared a covered channel');
    const cPanic = await c.ask('c2', 'stack.silence-all-live-plates');
    expectRefusedWith(cPanic.error, LOCK_ENGAGED_REFUSAL, 'C PANICked a covered channel');

    // Positive control 3 — B on channel 1 is refused by PERMISSION, reason named, not by a PIN
    // B does not hold.
    const bOnOne = await b.ask('b4', 'layers.clear', { channel: 1, layer: FREE });
    expectRefusedWith(bOnOne.error, authzChannelRefusal(1), 'B cleared channel 1');

    // Release is unchanged — the engager's PIN — and a second engage while locked is refused.
    expect((await b.ask('b5', 'lock.engage', { pin: '0000' })).payload).toEqual({ ok: false });
    expect((await a.ask('a3', 'lock.release', { pin: '4711' })).payload).toEqual({ ok: true });
  });

  it('an engager holding "*" covers every channel — the lock as it always was', async () => {
    await station();
    const star = await signedIn({ user: 'admin', cgChannels: '*' });
    const b = await signedIn(B);
    expect((await star.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    const lock = (await b.ask('s', 'lock.state')).payload as LockState;
    expect(lock.engaged).toBe(true);
    // Absent, not `[]` and not a list: the wire is byte-identical to the pre-B-257 lock.
    expect('channels' in lock).toBe(false);
    const clear = await b.ask('b1', 'layers.clear', { channel: 2, layer: FREE });
    expectRefusedWith(clear.error, LOCK_ENGAGED_REFUSAL, 'B cleared under an every-channel lock');
  });

  it('auth OFF carries no covered set, and an engage that would cover nothing is refused', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);
    expect((await client.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    const lock = (await client.ask('s', 'lock.state')).payload as LockState;
    expect(lock.engaged).toBe(true);
    expect('channels' in lock, 'auth OFF grew a covered set').toBe(false);
  });

  it('an operator holding no channel on this station has nothing to lock', async () => {
    await station();
    const b = await signedIn(B); // channel 2 only; the station declares channel 1
    expect((await b.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: false });
    // Positive control — the same socket CAN engage an ordinary lock once it holds channel 1.
    const a = await signedIn(A);
    expect((await a.ask('e2', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
  });
});

/**
 * 🔴 `MULTI-CHANNEL-01` §2 C / F — **THE PARTIAL OVERLAP B-257 COULD NOT BUILD, NOW BUILT.** Two
 * declared channels; the engager holds channel 1, so the lock covers channel 1 alone. A principal
 * holding BOTH channels meets the lock on channel 1's scoped verbs and not on channel 2's — the
 * named channel is the footprint the lock judges (`channelsForRequest` (a)), exactly as for any
 * other channel-scoped intent.
 */
describe('MULTI-CHANNEL-01 — a lock covering one of two declared channels', () => {
  it('refuses the covered channel’s PANIC and bulk verbs — control: the same principal’s same verbs on the uncovered channel pass', async () => {
    const started = await startAuthedBridge({
      fixedLayers: [standardBank(1), standardBank(2)],
    });
    handle = started.handle;
    playout = started.playout;
    const a = await signedIn(A);
    const both = await signedIn({
      user: 'longName',
      cgChannels: [
        { host: HOST, channel: 1 },
        { host: HOST, channel: 2 },
      ],
    });
    expect((await a.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    const lock = (await both.ask('s', 'lock.state')).payload as LockState;
    expect(lock).toMatchObject({ engaged: true, channels: [1] });

    const verbs = [
      'stack.silence-channel-live-plates',
      'stack.clear-all',
      'stack.stop-all',
      'stack.remove-all',
    ] as const;
    for (const [i, verb] of verbs.entries()) {
      const covered = await both.ask(`c${String(i)}`, verb, { channel: 1 });
      expectRefusedWith(covered.error, LOCK_ENGAGED_REFUSAL, `${verb} on the covered channel`);
      // CONTROL — the same principal, the same verb, on the channel the lock does not cover.
      const free = await both.ask(`f${String(i)}`, verb, { channel: 2 });
      expect(free.error, `${verb} on the uncovered channel was refused`).toBeUndefined();
    }
  });
});

describe('B-259 — a locked console does not change hands by token', () => {
  it('a DIFFERENT principal is refused; the refresh and a first sign-in pass', async () => {
    await station();
    const a = await signedIn(A);
    expect((await a.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    if (playout === null || handle === null) throw new Error('no station');

    const swap = await a.authenticate('x1', (await playout.issueToken(C)).token);
    expectRefusedWith(swap.error, LOCK_ENGAGED_REFUSAL, 'a principal swap on a locked console');
    const still = (await a.ask('s1', 'auth.state')).payload as { principal: { sub: string } };
    expect(still.principal.sub, 'the swap took effect anyway').toBe('u-1042');

    // Positive control 1 — the SAME person's refreshed token passes (D2's refresh).
    const refresh = await a.authenticate('x2', (await playout.issueToken(A)).token);
    expect(refresh.error, 'the refresh was refused').toBe(undefined);

    // Positive control 2 — a FIRST sign-in under the lock passes: a reloaded console signs in.
    const fresh = await openClient(handle);
    const first = await fresh.authenticate('x3', (await playout.issueToken(C)).token);
    expect(first.error, 'a first sign-in was refused under the lock').toBe(undefined);
  });

  it('a console the lock does not reach may change hands', async () => {
    await station();
    const a = await signedIn(A);
    const b = await signedIn(B);
    expect((await a.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    if (playout === null) throw new Error('no station');
    const swap = await b.authenticate('x', (await playout.issueToken({ user: 'viewer' })).token);
    expect(swap.error, 'the lock reached a console holding none of its channels').toBe(undefined);
  });
});

describe('B-258 — reconnect machinery is refused, not recorded as a press', () => {
  it('a viewer’s restore writes no refused row; a viewer’s real press does', async () => {
    await station();
    const v = await signedIn({ user: 'viewer' });
    const restore = await v.ask('r', 'stack.restore', { items: [] });
    expectRefusedWith(restore.error, AUTHZ_ROLE_REFUSAL, 'a viewer restored');
    const redeliver = await v.ask('d', 'templates.import', {
      template: TEMPLATE,
      html: HTML,
      redelivery: true,
    });
    expectRefusedWith(redeliver.error, AUTHZ_ROLE_REFUSAL, 'a viewer re-delivered');

    // Positive control — the SAME viewer's real press writes its refused row, so the recorder
    // is live and the absence above is a measurement.
    const take = await v.ask('t', 'stack.take', { itemId: 'nope' });
    expectRefusedWith(take.error, AUTHZ_ROLE_REFUSAL, 'a viewer took');

    const rows = (await v.ask('a', 'audit.recent', { limit: 50 })).payload as AuditEntry[];
    const refused = rows.filter((r) => r.action === 'refused').map((r) => r.refused?.channel);
    expect(refused).toEqual(['stack.take']);
  });
});

describe('B-260 — every template mutation writes a row; a lock refuses an overwrite', () => {
  async function auditRows(client: Client): Promise<AuditEntry[]> {
    return (await client.ask(`a-${String(Math.random())}`, 'audit.recent', { limit: 100 }))
      .payload as AuditEntry[];
  }
  const other: TemplateInfo = { templateId: 'other', templateType: 'other', fields: [] };

  it('(a) a re-delivery that changes the catalogue writes a row; one that changes nothing does not', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const c = await openClient(handle);
    const redeliver = (id: string, html: string) =>
      c.ask(`r-${id}-${String(Math.random())}`, 'templates.import', {
        template: { ...other, templateId: id },
        html,
        redelivery: true,
      });

    expect((await redeliver('other', 'v1')).error).toBe(undefined); // registers
    expect((await redeliver('other', 'v1')).error).toBe(undefined); // identical
    expect((await redeliver('other', 'v2')).error).toBe(undefined); // replaces
    expect(handle.runtime.templateHtml('other')).toBe('v2');
    const removed = await c.ask('rm', 'templates.remove', { templateId: 'other' });
    expect((removed.payload as { ok: boolean }).ok).toBe(true);

    const actions = (await auditRows(c)).map((r) => `${r.action}:${r.outcome}`).reverse();
    // Register + replace = two rows; the identical re-delivery between them wrote none. The two
    // rows on either side of it are the positive control that the recorder was live throughout.
    expect(actions).toEqual([
      'template-redeliver:ok',
      'template-redeliver:ok',
      'template-remove:ok',
    ]);
  });

  it('(b) under a lock a re-delivery may not OVERWRITE; registering and no-change still pass', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const c = await openClient(handle);
    expect((await c.ask('i', 'templates.import', { template: other, html: 'v1' })).error).toBe(
      undefined,
    );
    expect((await c.ask('l', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });

    const overwrite = await c.ask('o', 'templates.import', {
      template: other,
      html: 'v2-under-lock',
      redelivery: true,
    });
    expectRefusedWith(
      overwrite.error,
      LOCK_ENGAGED_REFUSAL,
      'a locked console overwrote a template',
    );
    expect(handle.runtime.templateHtml('other'), 'the held HTML moved').toBe('v1');

    // Positive controls — the SAME frame shape still passes when it overwrites nothing, so the
    // refusal is about the overwrite and not about the flag.
    const same = await c.ask('s', 'templates.import', {
      template: other,
      html: 'v1',
      redelivery: true,
    });
    expect(same.error, 'an identical re-delivery was refused under the lock').toBe(undefined);
    const fresh = await c.ask('f', 'templates.import', {
      template: { ...other, templateId: 'fresh' },
      html: 'f1',
      redelivery: true,
    });
    expect(fresh.error, 'a re-delivery restoring a missing template was refused').toBe(undefined);
    expect(handle.runtime.templateHtml('fresh')).toBe('f1');
  });
});
