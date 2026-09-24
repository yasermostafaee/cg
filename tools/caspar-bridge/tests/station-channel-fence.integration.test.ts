import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import {
  AUTH_REQUIRED_REFUSAL,
  authzChannelRefusal,
  channelNotDeclaredRefusal,
  type ConnectionConfig,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import {
  buildRoutes,
  CasparRuntime,
  CHANNEL_DECLARING_ROUTES,
  createBridge,
  stationRefusal,
  type BridgeHandle,
} from '../src/index.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './support/harness.js';
import { expectRefusedWith, openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **THE STATION DECIDES WHAT IT WRITES TO. Every operating door that
 * names a channel refuses one this station does not declare — measured at the wire.**
 *
 * ── WHAT THIS STANDS ON ─────────────────────────────────────────────────────
 *
 * On 2026-09-22 a bridge configured for channel 2 seated six producers onto channel 1 — a partner
 * Playout's live PROGRAMME output — through `stack.restore`, the one door that trusted a
 * coordinate a client remembered. `CHANNEL-RESOLUTION-01` fenced that door and said so: _"only the
 * restore door is fenced"_. This file is the rest of the list.
 *
 * Three facts about a channel, and only one decides where we write:
 *
 *   - the channel EXISTS and has a NAME     — the Playout's catalogue (D4);
 *   - a principal MAY OPERATE it             — the grant (`cg_channels`, `C-038`);
 *   - THIS STATION OPERATES it               — the declared bank (`#declaredChannels()`).
 *
 * The principal here is the test Playout's real `cg-op2` grant, in shape: channels 1 AND 2 of this
 * host. Channel 1 is the Playout's programme. The permission gate CORRECTLY lets that principal
 * address channel 1 — the grant is true — which is exactly why the grant cannot be what decides.
 *
 * ── THE FOUR OPERATING DOORS THAT TAKE AN EXPLICIT CHANNEL ─────────────────
 *
 * Found by walking every request schema in `@cg/shared-ipc` for a key named `channel` at any
 * depth (83 request channels, 8 with one), not by merging the two earlier sessions' lists:
 *
 *   `layers.clear` · `playoutLayers.clear` · `fixedLayers.clear-layer` · `fixedLayers.load`
 *
 * The other four are not operating doors: `fixedLayers.set-config` (its channel IS the
 * declaration), `channelSettings.set` (already refused for an undeclared channel by its store's
 * `unknown-channel`), `sources.set-config` (a `route` source's channel is read FROM, never written
 * to) and `stack.restore` (fenced per item inside the runtime, as a SKIP — refusing the whole
 * frame would lose the rest of a console's stack for one foreign row).
 *
 * ── WHY EACH CASE CARRIES ITS OWN POSITIVE CONTROL ──────────────────────────
 *
 * "Nothing reached channel 1" is void until the same boot shows the same door DOES reach the wire
 * on the declared channel. Without it a door that had simply stopped working — an unhearing tap,
 * an unseeded producer, a template never imported — would pass the fence test completely. So every
 * case sends channel 1 first, asserts silence, then sends channel 2 on the same bridge and waits
 * for the command to land.
 *
 * ⚠ The mock serves THREE channels. The hazard needs channel 1 to be a real thing the mock would
 * answer for: a bridge addressing a channel the server does not have could look clean for the
 * wrong reason.
 */

/** The declared bank: CHANNEL 2 — operator rows 70–73, beds 50–58. */
const BANK: FixedLayerBank = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };
/** One reserved playout layer, channel-agnostic by the reservation's own rule. */
const RESERVED = { ranges: [{ from: 60, to: 60 }] };
/** An unreserved, undeclared layer where "somebody else's graphic" lives on both channels. */
const FOREIGN_LAYER = 20;
const BANK_ROW = 72;
const SWEEP_MS = 150;
const STALE_MS = 800;

const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

interface Rig {
  readonly mock: MockHandle;
  readonly handle: BridgeHandle;
  readonly client: Client;
  readonly tracePath: string;
  /** Send an AMCP line AS ANOTHER SYSTEM — the Playout putting its own graphic on a layer. */
  foreign(line: string): Promise<void>;
}

/** Every AMCP line the mock RECEIVED, in arrival order. */
async function recvLines(rig: Rig): Promise<string[]> {
  await rig.mock.traceFlush();
  return fs
    .readFileSync(rig.tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/**
 * Every line whose TARGET names `channel`, in both spellings a target has (`CLEAR 1-20`,
 * `CLEAR 1`). Verb-agnostic on purpose — the property is "nothing at all", and a list of verbs is
 * one new verb away from being a lie about what was checked. Same matcher as
 * `restore-channel-fence`, for the reason given there.
 */
function addressing(lines: readonly string[], channel: number): string[] {
  const targeted = new RegExp(`^[A-Z][A-Z ]*?\\s${String(channel)}(?:-\\d+)?(?:\\s|$)`);
  return lines.filter((l) => targeted.test(l));
}

async function boot(auth: 'off' | 'on'): Promise<Rig> {
  const oscPort = await freeUdpPort();
  const tracePath = path.join(
    os.tmpdir(),
    `cg-stationfence-${String(process.pid)}-${String(Date.now())}-${String(
      Math.trunc(performance.now()),
    )}.ndjson`,
  );
  track(tracePath, (p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
  const mock = track(
    await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: 3,
      tracePath,
    }),
    (m) => m.stop(),
  );
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const common = {
    port: 0,
    connection,
    fixedLayers: BANK,
    reservedLayers: RESERVED,
    runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
  };

  let handle: BridgeHandle;
  let token: string | null = null;
  if (auth === 'on') {
    const playout = track(await startFakePlayout(), (p) => p.stop());
    handle = track(
      await createBridge({
        ...common,
        playout: {
          auth: 'playout',
          issuer: playout.issuer,
          jwksUrl: playout.jwksUrl,
          tokenUrl: playout.tokenUrl,
          refreshUrl: playout.refreshUrl,
          revokedUrl: playout.revokedUrl,
        },
      }),
      (h) => h.close(),
    );
    token = (await playout.issueToken({ user: 'bothChannels' })).token;
  } else {
    handle = track(await createBridge(common), (h) => h.close());
  }

  await handle.runtime.whenServerHealthy(HEALTH_MS);
  // A negative observation is valid only from a PROVEN-QUIESCENT wire (harness flake family 3).
  await awaitChannelModeRead(handle.runtime);
  handle.runtime.templateImport(TEMPLATE, HTML);

  const client = await openClient(handle);
  if (token !== null) {
    const signedIn = await client.authenticate('auth-1', token);
    expect(signedIn.error, 'the cg-op2-shaped principal signs in').toBeUndefined();
  }

  let transport: AmcpTransport | null = null;
  let queue: CommandQueue | null = null;
  const rig: Rig = {
    mock,
    handle,
    client,
    tracePath,
    async foreign(line) {
      if (queue === null) {
        transport = track(new AmcpTransport(), (t) => t.destroy());
        await transport.connect(mock.host, mock.amcpPort);
        queue = track(new CommandQueue(transport), (q) => q.dispose());
      }
      await queue.enqueue(line);
    },
  };
  return rig;
}

/**
 * Put "somebody else's" html graphic on `layer` of BOTH channels, and wait until the bridge's tap
 * has heard the one on OUR channel — the OSC tick carries every channel, and the foreign play on
 * channel 1 is sent first, so by the time channel 2 is heard channel 1 has been too.
 */
async function seedHtml(rig: Rig, layer: number): Promise<void> {
  await rig.foreign(`PLAY 1-${String(layer)} "their-graphic" HTML`);
  await rig.foreign(`PLAY 2-${String(layer)} "their-graphic" HTML`);
  await waitFor(
    async () => (await orphans(rig)).some((o) => o.channel === 2 && o.layer === layer),
    `the tap to hear 2-${String(layer)}`,
  );
  // Two more sweeps, so the freshness window the clear gates read has certainly been refreshed.
  await delay(SWEEP_MS * 3);
}

/** What the console's orphan strip is fed — the `layers.orphans` read, over the socket. */
async function orphans(rig: Rig): Promise<{ channel: number; layer: number; producer: string }[]> {
  const res = await rig.client.ask(id(), 'layers.orphans');
  return (res.payload ?? []) as { channel: number; layer: number; producer: string }[];
}

interface Door {
  readonly name: string;
  /** Arrange whatever the door needs to have something to act on, on BOTH channels. */
  readonly arrange: (rig: Rig) => Promise<void>;
  /** Send the door for `channel`; returns the reply. */
  readonly send: (rig: Rig, channel: number) => Promise<{ payload?: unknown; error?: string }>;
  /** The line the declared-channel control must put on the wire. */
  readonly controlLine: RegExp;
}

let seq = 0;
const id = (): string => `req-${String((seq += 1))}`;

const DOORS: readonly Door[] = [
  {
    name: 'layers.clear',
    arrange: (rig) => seedHtml(rig, FOREIGN_LAYER),
    send: (rig, channel) => rig.client.ask(id(), 'layers.clear', { channel, layer: FOREIGN_LAYER }),
    controlLine: /^CLEAR 2-20$/,
  },
  {
    name: 'playoutLayers.clear',
    arrange: async (rig) => {
      await rig.foreign('PLAY 1-60 "their-graphic" HTML');
      await rig.foreign('PLAY 2-60 "their-graphic" HTML');
      // The reserved layer is excluded from the orphan sweep, so the tap is asked directly:
      // wait until the playout layer on the DECLARED channel reads as occupied.
      await waitFor(() => {
        const occupied = rig.handle.runtime.playoutLayersState();
        return occupied.some((p) => p.observed.kind === 'producer');
      }, 'the reserved layer to read occupied');
      await delay(SWEEP_MS * 3);
    },
    send: (rig, channel) => rig.client.ask(id(), 'playoutLayers.clear', { channel, layer: 60 }),
    controlLine: /^CLEAR 2-60$/,
  },
  {
    name: 'fixedLayers.clear-layer',
    arrange: () => Promise.resolve(),
    send: (rig, channel) =>
      rig.client.ask(id(), 'fixedLayers.clear-layer', { channel, layer: BANK_ROW }),
    controlLine: /^CLEAR 2-72$/,
  },
  {
    name: 'fixedLayers.load',
    arrange: () => Promise.resolve(),
    /*
      LOAD is list-only by design and emits no AMCP of its own, so the question at the wire is
      what the row it binds can then PUT there: the load is followed by a TAKE of the same item,
      which is the first verb that would carry the coordinate to CasparCG.
    */
    send: async (rig, channel) => {
      const itemId = `row-on-${String(channel)}`;
      const loaded = await rig.client.ask(id(), 'fixedLayers.load', {
        channel,
        layer: BANK_ROW,
        itemId,
        templateId: TEMPLATE.templateId,
        fields: {},
      });
      await rig.client.ask(id(), 'stack.take', { itemId });
      return loaded;
    },
    controlLine: /^CG 2-72 ADD\b/,
  },
];

/*
  🔴 THE DOOR THAT NAMES NO CHANNEL AND STILL CHOSE ONE.

  `stack.load` carries no coordinate: `#allocate` picks the layer from the deployment's dynamic
  policy — and it used to pick the CHANNEL from a constant, `DEFAULT_CHANNEL` (1), whatever the
  station declared. The shipped policy is empty (`LAYER-BANDS-16`), so a stock station cannot
  reach it; an installation that declares its own ranges (`BridgeOptions.layerPolicy`, which the
  option's own note invites) put every dynamic row on channel 1 of a channel-2 station.

  Measured before the fix: `CG 1-10 ADD` on the take. The take's own `CG … ADD` landing on the
  declared channel is this case's positive control — the same line, one channel over.
*/
describe('a door with NO explicit channel: the dynamic allocator places on the declared channel', () => {
  it('stack.load + stack.take under a declared policy seat on channel 2, never channel 1', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = path.join(
      os.tmpdir(),
      `cg-stationfence-dyn-${String(process.pid)}-${String(Date.now())}.ndjson`,
    );
    track(tracePath, (p) => {
      if (fs.existsSync(p)) fs.rmSync(p);
    });
    const mock = track(
      await createMock({
        amcpPort: 0,
        oscPort,
        oscHost: '127.0.0.1',
        oscHz: 40,
        channels: 3,
        tracePath,
      }),
      (m) => m.stop(),
    );
    const handle = track(
      await createBridge({
        port: 0,
        connection: {
          servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: true,
        },
        fixedLayers: BANK,
        // A deployment's own dynamic ranges — disjoint from the bank (50–58, 70–73).
        layerPolicy: { 'lower-third': [10, 19], custom: [30, 39] },
        runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
      }),
      (h) => h.close(),
    );
    await handle.runtime.whenServerHealthy(HEALTH_MS);
    await awaitChannelModeRead(handle.runtime);
    handle.runtime.templateImport(TEMPLATE, HTML);
    const rig: Rig = {
      mock,
      handle,
      client: await openClient(handle),
      tracePath,
      foreign: () => Promise.resolve(),
    };
    const before = (await recvLines(rig)).length;

    const loaded = await rig.client.ask(id(), 'stack.load', {
      itemId: 'dyn-1',
      templateId: TEMPLATE.templateId,
      fields: {},
    });
    expect(loaded.error).toBeUndefined();
    await rig.client.ask(id(), 'stack.take', { itemId: 'dyn-1' });
    await waitFor(
      async () => (await recvLines(rig)).slice(before).some((l) => /^CG \d+-\d+ ADD\b/.test(l)),
      'the take to reach the wire',
    );
    const after = (await recvLines(rig)).slice(before);

    expect(addressing(after, 1), 'nothing addressed channel 1').toEqual([]);
    expect(
      after.some((l) => /^CG 2-1\d ADD\b/.test(l)),
      'the row seated on channel 2',
    ).toBe(true);
  }, 40_000);
});

for (const auth of ['off', 'on'] as const) {
  describe(`auth ${auth.toUpperCase()} — an undeclared channel reaches nothing at the wire`, () => {
    for (const door of DOORS) {
      it(`${door.name}: channel 1 refused before CasparCG; channel 2 (the control) lands`, async () => {
        const rig = await boot(auth);
        await door.arrange(rig);
        const before = (await recvLines(rig)).length;

        // ── channel 1: not this station's ─────────────────────────────────────
        const refused = await door.send(rig, 1);
        // Let anything the door queued have every chance to reach the mock.
        await delay(SWEEP_MS * 4);
        const afterRefusal = (await recvLines(rig)).slice(before);

        // 🔴 THE WIRE FIRST. The sentence below is a consequence worth pinning; the property is
        // that channel 1 of a partner's output received nothing.
        expect(addressing(afterRefusal, 1), 'nothing addressed channel 1').toEqual([]);
        expectRefusedWith(refused.error, channelNotDeclaredRefusal(1), door.name);

        // ── channel 2: the positive control, on the same bridge ───────────────
        const accepted = await door.send(rig, 2);
        expect(
          accepted.error,
          `${door.name} on the declared channel is not refused`,
        ).toBeUndefined();
        await waitFor(
          async () => (await recvLines(rig)).slice(before).some((l) => door.controlLine.test(l)),
          `${door.name}'s command to land on channel 2`,
        );
        expect(addressing((await recvLines(rig)).slice(before), 1)).toEqual([]);
      }, 40_000);
    }
  });
}

/*
  🔴 THE CONSOLE NEVER OFFERS A CHANNEL THE STATION DOES NOT OPERATE.

  The two doors that reached the wire were not reached by a crafted client in the field: the
  console's own surfaces offered them. The orphan strip listed every html layer OSC reported on
  ANY channel with a CLEAR beside it, and the playout tab reported its rows on the constant
  channel 1. The gate refuses those clears now; these two cases are the half that keeps the
  console from drawing a control the bridge would refuse (absent, never greyed).
*/
describe('the reads that feed a CLEAR name only channels this station operates', () => {
  it('layers.orphans leaves out channel 1 — control: the same read lists channel 2', async () => {
    const rig = await boot('off');
    await seedHtml(rig, FOREIGN_LAYER);
    const listed = await orphans(rig);

    // The control FIRST: the read is live and hears the seeded graphic on our channel.
    expect(listed.some((o) => o.channel === 2 && o.layer === FOREIGN_LAYER)).toBe(true);
    // …and the partner's graphic on channel 1, played BEFORE ours on the same tick, is absent.
    expect(listed.filter((o) => o.channel !== BANK.channel)).toEqual([]);
  }, 40_000);

  it('playoutLayers.state reports the declared channel — control: its row reads the seeded producer', async () => {
    const rig = await boot('off');
    await rig.foreign('PLAY 1-60 "their-graphic" HTML');
    await rig.foreign('PLAY 2-60 "their-graphic" HTML');
    await waitFor(
      () => rig.handle.runtime.playoutLayersState().some((p) => p.observed.kind === 'producer'),
      'the reserved layer to read occupied',
    );
    const res = await rig.client.ask(id(), 'playoutLayers.state');
    const rows = (res.payload ?? []) as { channel: number; layer: number; observed: unknown }[];

    expect(rows).toEqual([
      { channel: 2, layer: 60, observed: { kind: 'producer', producer: 'html' } },
    ]);
  }, 40_000);
});

/*
  🔴 WHERE THE FENCE SITS IN THE GATE: after authentication, before permission. The ORDER is the
  message, and both neighbours are pinned — no wire is needed for either, so the dead connection
  is used and nothing here could reach a server.
*/
describe('the station fence sits after sign-in and before permission', () => {
  async function authed(): Promise<{
    handle: BridgeHandle;
    issue: (user: 'channelTwo' | 'bothChannels') => Promise<string>;
  }> {
    const playout = track(await startFakePlayout(), (p) => p.stop());
    const handle = track(
      await createBridge({
        port: 0,
        connection: {
          servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: true,
        },
        fixedLayers: BANK,
        playout: {
          auth: 'playout',
          issuer: playout.issuer,
          jwksUrl: playout.jwksUrl,
          tokenUrl: playout.tokenUrl,
          refreshUrl: playout.refreshUrl,
          revokedUrl: playout.revokedUrl,
        },
      }),
      (h) => h.close(),
    );
    return { handle, issue: async (user) => (await playout.issueToken({ user })).token };
  }

  it('a socket that has not signed in is told to sign in — the fence tells it nothing', async () => {
    const { handle } = await authed();
    const client = await openClient(handle);
    const res = await client.ask(id(), 'layers.clear', { channel: 1, layer: FOREIGN_LAYER });
    expectRefusedWith(res.error, AUTH_REQUIRED_REFUSAL, 'unauthenticated layers.clear');
  }, 20_000);

  it('an operator NOT granted channel 1 is told the station fact, not to ask for a grant', async () => {
    const { handle, issue } = await authed();
    const client = await openClient(handle);
    expect((await client.authenticate('a', await issue('channelTwo'))).error).toBeUndefined();

    const res = await client.ask(id(), 'layers.clear', { channel: 1, layer: FOREIGN_LAYER });
    // A grant would change nothing here, so the grant sentence would send them to the wrong
    // remedy. Checked as a string first, then as the station's — never `toBe(undefined)`.
    expectRefusedWith(res.error, channelNotDeclaredRefusal(1), 'channel-2 operator on channel 1');
    expect(res.error).not.toBe(authzChannelRefusal(1));

    // Control: the same principal on the declared channel passes the fence and reaches the
    // handler, which answers for itself (nothing is heard on a dead connection, so `foreign`).
    const ours = await client.ask(id(), 'layers.clear', { channel: 2, layer: FOREIGN_LAYER });
    expect(ours.error).toBeUndefined();
    expect(ours.payload).toEqual({ ok: false, reason: 'foreign' });
  }, 20_000);
});

/**
 * Every key named `channel` in a Zod schema, as a path — a mechanical walk, so the census below
 * cannot inherit anybody's list. Zod 3's `_def.typeName` is read duck-typed; the wrappers are the
 * ones the request schemas actually use.
 */
function channelPaths(schema: unknown, at = 'req', seen = new Set<unknown>()): string[] {
  const def = (schema as { _def?: Record<string, unknown> } | null)?._def;
  if (def === undefined || seen.has(schema)) return [];
  seen.add(schema);
  const next = (s: unknown, p: string): string[] => channelPaths(s, p, seen);
  switch (def['typeName']) {
    case 'ZodObject': {
      const shape = (
        typeof def['shape'] === 'function'
          ? (def['shape'] as () => Record<string, unknown>)()
          : def['shape']
      ) as Record<string, unknown>;
      return Object.entries(shape).flatMap(([k, v]) => [
        ...(k === 'channel' ? [`${at}.${k}`] : []),
        ...next(v, `${at}.${k}`),
      ]);
    }
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodReadonly':
      return next(def['innerType'], at);
    case 'ZodEffects':
      return next(def['schema'], at);
    case 'ZodArray':
      return next(def['type'], `${at}[]`);
    case 'ZodRecord':
      return next(def['valueType'], `${at}{}`);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = def['options'] as unknown[] | Map<unknown, unknown>;
      const list = options instanceof Map ? [...options.values()] : options;
      return [...new Set(list.flatMap((o) => next(o, at)))];
    }
    case 'ZodIntersection':
      return [...next(def['left'], at), ...next(def['right'], at)];
    case 'ZodLazy':
      return next((def['getter'] as () => unknown)(), at);
    default:
      return [];
  }
}

/*
  🔴 THE CENSUS — every route, walked; the fence's claim is about each of them.

  "Every operating door that names a channel is fenced" is a claim about the route table, and two
  earlier sessions each named part of the list without either being complete. So the list is
  DERIVED here from the request schemas, pinned by name, and each member is driven through the
  real `stationRefusal` rather than trusted to be on the right side of the exemption.
*/
describe('the census: every route that names a channel, classified', () => {
  const runtime = (): CasparRuntime =>
    new CasparRuntime(
      {
        servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      {},
      { fixedBank: BANK },
    );

  it('nine routes carry a channel key; six carry it at the top level, where the fence reads', () => {
    const table = buildRoutes(runtime());
    expect(table.size, 'the census is looking at the real table').toBeGreaterThan(50);
    const found = Object.fromEntries(
      [...table.entries()]
        .map(([name, route]) => [name, channelPaths(route.channel.request)] as const)
        .filter(([, paths]) => paths.length > 0),
    );
    expect(found).toEqual({
      'channelSettings.set': ['req.channel'],
      'fixedLayers.clear-layer': ['req.channel'],
      'fixedLayers.load': ['req.channel'],
      /*
        `MULTI-CHANNEL-01` — the plural declaration door. Its channels are INSIDE the list, so the
        fence (which reads a top-level `channel`) does not stand in its way — a declaration is not
        fenced by the declaration it writes — while the permission gate and the lock judge the
        channels it adds, edits or removes.
      */
      'fixedLayers.set-banks': ['req.banks[].channel'],
      'fixedLayers.set-config': ['req.channel'],
      'layers.clear': ['req.channel'],
      'playoutLayers.clear': ['req.channel'],
      // A `route` SOURCE's channel is read FROM — never a write target.
      'sources.set-config': ['req.sources[].producer.channel'],
      // Fenced per item inside the runtime, as a `not-declared` SKIP.
      'stack.restore': ['req.items[].slot.channel'],
    });
  });

  it('exactly two are exempt, and they are the two declaration-shaped configuration routes', () => {
    expect([...CHANNEL_DECLARING_ROUTES].sort()).toEqual([
      'channelSettings.set',
      'fixedLayers.set-config',
    ]);
  });

  it('every other top-level channel route is REFUSED an undeclared channel — and passes the declared one', () => {
    const r = runtime();
    const table = buildRoutes(r);
    const fenced = [...table.entries()].filter(
      ([name, route]) =>
        channelPaths(route.channel.request).includes('req.channel') &&
        !CHANNEL_DECLARING_ROUTES.has(name),
    );
    expect(fenced.map(([name]) => name).sort()).toEqual([
      'fixedLayers.clear-layer',
      'fixedLayers.load',
      'layers.clear',
      'playoutLayers.clear',
    ]);
    for (const [name, route] of fenced) {
      expect(stationRefusal(route, { channel: 1, layer: 72 }, r), name).toBe(
        channelNotDeclaredRefusal(1),
      );
      // The declared channel is the positive control: the fence is not simply refusing everything.
      expect(stationRefusal(route, { channel: 2, layer: 72 }, r), name).toBeNull();
    }
    // …and the exempt two are not refused by it, whatever they name.
    for (const name of CHANNEL_DECLARING_ROUTES) {
      const route = table.get(name);
      if (route === undefined) throw new Error(`${name} is not routed`);
      expect(stationRefusal(route, { channel: 1 }, r), name).toBeNull();
    }
  });

  /*
    🔴 ONE PREDICATE — the restore door asks the same question the gate does, in the one case
    where the two used to disagree: NO BANK. The restore fence waved everything through there;
    `#declaredChannels()` answers channel 1, `FixedLayerBankSchema`'s documented default.
  */
  it('a bank-less runtime skips a channel-2 restore as not-declared — control: channel 1 restores', async () => {
    const bankless = (): CasparRuntime => {
      const r = track(
        new CasparRuntime(
          {
            servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
            strategy: 'mirror-sync',
            autoFailoverEnabled: false,
          },
          {},
          {},
        ),
        (rt) => rt.stop(),
      );
      // Registered, so the skip reason is about the CHANNEL and not a missing template.
      r.templateImport(TEMPLATE, HTML);
      return r;
    };
    const retained = (channel: number): Parameters<CasparRuntime['restore']>[0] => [
      {
        itemId: `on-${String(channel)}`,
        templateId: TEMPLATE.templateId,
        fields: {},
        state: 'loaded',
        slot: { channel, layer: 72, server: 'primary' },
      },
    ];

    const foreign = await bankless().restore(retained(2));
    expect(foreign.restored).toBe(0);
    expect(foreign.skipped.map((s) => [s.itemId, s.reason])).toEqual([['on-2', 'not-declared']]);

    // The control — the declared default channel restores on the same kind of runtime.
    expect((await bankless().restore(retained(1))).restored).toBe(1);
  });

  it('a request naming no channel — item-scoped, bulk, or PANIC — is never refused by it', () => {
    const r = runtime();
    const table = buildRoutes(r);
    for (const [name, payload] of [
      ['stack.take', { itemId: 'x' }],
      ['stack.out', { itemId: 'x' }],
      ['stack.clear-all', undefined],
      ['stack.silence-all-live-plates', undefined],
      ['stack.restore', { items: [{ slot: { channel: 1, layer: 72 } }] }],
    ] as const) {
      const route = table.get(name);
      if (route === undefined) throw new Error(`${name} is not routed`);
      expect(stationRefusal(route, payload, r), name).toBeNull();
    }
  });
});
