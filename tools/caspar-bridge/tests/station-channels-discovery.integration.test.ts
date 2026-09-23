import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMock } from '@cg/amcp-mock';
import {
  StationChannelsChangedChannel,
  type ConnectionConfig,
  type FixedLayerBank,
  type StationChannels,
} from '@cg/shared-ipc';
import { CATALOGUE_POLL_MS, createBridge, type BridgeHandle } from '../src/index.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './support/harness.js';
import { deadConnection, openClient, waitFor, type Client } from './support/auth-harness.js';
import {
  FAKE_CATALOGUE,
  startFakePlayout,
  type FakePlayout,
  type FakeUserKey,
} from './support/fake-playout.js';

/**
 * 🔴 `R-062` gap 2 / `C-039` — **THE CHANNEL-DISCOVERY CALL, FED FIRST BY THE PLAYOUT'S CATALOGUE.**
 *
 * Three facts per channel, and this suite holds them APART: `named` (a D4 row joined on this
 * station's host), `declared` (this station operates it — the only one that decides what the
 * bridge writes to) and `permitted` (this principal's grant). The station is on channel 2; the fake
 * Playout's catalogue names channel 2 AND channel 1, its own programme output; and the principal is
 * `cg-op-both`, granted both — the test Playout's real `cg-op2` shape.
 *
 * ⚠ **THE CLOCK IS THE BRIDGE'S, INJECTED.** One `now` drives the token verifier and the catalogue
 * reader together, so "30 s later" and "past `exp`" are single facts rather than two clocks that
 * could disagree, and nothing here sleeps for half a minute. The catalogue's own tick is set out of
 * reach so every read is one the spec asked for.
 *
 * 🔴 **EVERY ABSENCE NAMES ITS CONTROL**, beside it: a read that did not happen is measured against
 * a counter first shown to move, and a name that is not there against one that is.
 */

/** The declared bank: CHANNEL 2. */
const BANK: FixedLayerBank = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };

let seq = 0;
const id = (): string => `d-${String((seq += 1))}`;

interface Station {
  readonly handle: BridgeHandle;
  readonly playout: FakePlayout;
  /** Move the bridge's clock. */
  advance(ms: number): void;
  /** A console signed in as `user`, with the bridge having read the catalogue for it. */
  signIn(user: FakeUserKey, expEpochSec?: number): Promise<{ client: Client; token: string }>;
  list(client: Client): Promise<StationChannels>;
}

async function station(connection: ConnectionConfig = deadConnection()): Promise<Station> {
  let offset = 0;
  const now = (): number => Date.now() + offset;
  const playout = track(await startFakePlayout(), (p) => p.stop());
  const handle = track(
    await createBridge({
      port: 0,
      connection,
      fixedLayers: BANK,
      playout: {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
      },
      playoutAuthOptions: { now },
      // The tick is put out of reach: every read in this suite is one a step asked for.
      playoutCatalogueOptions: { now, tickMs: 3_600_000 },
    }),
    (h) => h.close(),
  );
  const catalogue = handle.playoutCatalogue;
  if (catalogue === null) throw new Error('an auth-ON bridge built no catalogue reader');
  return {
    handle,
    playout,
    advance: (ms) => {
      offset += ms;
    },
    async signIn(user, expEpochSec) {
      const client = await openClient(handle);
      const issued = await playout.issueToken({
        user,
        ...(expEpochSec !== undefined ? { expEpochSec } : {}),
      });
      const res = await client.authenticate(id(), issued.token);
      if (res.error !== undefined) throw new Error(`fixture token rejected: ${res.error}`);
      // The sign-in kicks a read; wait for it to settle so the next step reads what it returned.
      await catalogue.refresh();
      return { client, token: issued.token };
    },
    async list(client) {
      const res = await client.ask(id(), 'channels.list');
      if (res.error !== undefined) throw new Error(`channels.list refused: ${res.error}`);
      return res.payload as StationChannels;
    },
  };
}

const PROGRAMME = FAKE_CATALOGUE.find((r) => r.casparChannel === 1);
const OURS = FAKE_CATALOGUE.find((r) => r.casparChannel === 2);

describe('the answer — three facts, kept apart, catalogue first', () => {
  it('names our channel and the Playout’s programme channel, and says which one this station operates', async () => {
    const s = await station();
    const { client } = await s.signIn('bothChannels');
    const answer = await s.list(client);

    expect(answer.channels).toEqual([
      // The Playout's programme channel: named, PERMITTED by the grant — and not declared.
      {
        channel: 1,
        named: { id: PROGRAMME?.id, name: PROGRAMME?.name },
        declared: false,
        permitted: true,
        sources: ['catalogue'],
      },
      // Ours: named by the catalogue, and the bank and channel settings list it too.
      {
        channel: 2,
        named: { id: OURS?.id, name: OURS?.name },
        declared: true,
        permitted: true,
        sources: ['catalogue', 'bank', 'channel-settings'],
      },
    ]);
  }, 20_000);

  it('a catalogue row on ANOTHER station’s host joins nothing — control: our host’s row joins', async () => {
    const s = await station();
    s.playout.setChannels([
      { id: 'elsewhere', name: 'جای دیگر', casparHost: '192.0.2.10', casparChannel: 2 },
    ]);
    const { client } = await s.signIn('bothChannels');
    const foreign = await s.list(client);
    // Channel 2 is still listed — by the bank — and the other host's row did not name it.
    expect(foreign.channels.map((c) => [c.channel, c.named, c.sources])).toEqual([
      [2, null, ['bank', 'channel-settings']],
    ]);

    // Control: the same bridge, the catalogue restored — our host's row now names channel 2.
    s.playout.setChannels(FAKE_CATALOGUE);
    s.advance(CATALOGUE_POLL_MS);
    await s.handle.playoutCatalogue?.refresh();
    const joined = await s.list(client);
    expect(joined.channels.find((c) => c.channel === 2)?.named?.name).toBe(OURS?.name);
  }, 20_000);

  it('with auth OFF there is no catalogue read, no `permitted`, and the list is the bank and settings', async () => {
    const handle = track(
      await createBridge({ port: 0, connection: deadConnection(), fixedLayers: BANK }),
      (h) => h.close(),
    );
    expect(handle.playoutCatalogue, 'an auth-OFF bridge built a catalogue reader').toBeNull();
    const client = await openClient(handle);
    const res = await client.ask(id(), 'channels.list');
    expect(res.error).toBeUndefined();
    // The control is the answer itself: the declared channel IS listed, from both old sources.
    expect(res.payload).toEqual({
      channels: [
        { channel: 2, named: null, declared: true, sources: ['bank', 'channel-settings'] },
      ],
    });
  }, 20_000);
});

describe('D4 is read at most every 30 s, with ETag, and fails to ABSENT', () => {
  it('a second read inside 30 s is not made; after it, the ETag comes back as a 304', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    if (catalogue === null) throw new Error('no catalogue');
    const { client } = await s.signIn('bothChannels');

    // POSITIVE CONTROL FIRST — the counter moves: the sign-in's read reached the fake.
    expect(s.playout.requestCounts.channels).toBe(1);
    expect(catalogue.readCount).toBe(1);

    // Inside the floor: asked again, not read.
    s.advance(CATALOGUE_POLL_MS - 1000);
    await catalogue.refresh();
    expect(s.playout.requestCounts.channels, 'read again inside 30 s').toBe(1);

    // Past the floor: read, answered 304 — and the names are still held.
    s.advance(1000);
    await catalogue.refresh();
    expect(s.playout.requestCounts.channels).toBe(2);
    expect((await s.list(client)).channels.find((c) => c.channel === 2)?.named?.name).toBe(
      OURS?.name,
    );
  }, 20_000);

  it('an unreachable Playout makes the catalogue ABSENT — no alarm, no refused verb — control: it was present', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    if (catalogue === null) throw new Error('no catalogue');
    const { client } = await s.signIn('bothChannels');
    // Control: present before the outage.
    expect((await s.list(client)).channels.some((c) => c.named !== null)).toBe(true);

    await s.playout.goOffline();
    s.advance(CATALOGUE_POLL_MS);
    await catalogue.refresh();

    expect(catalogue.rows(), 'a stale catalogue was kept').toBeNull();
    const absent = await s.list(client);
    expect(absent.channels.map((c) => [c.channel, c.named, c.declared])).toEqual([[2, null, true]]);
    // Never a gate on a verb: the same console's clear on its own channel meets exactly what it met
    // before — the handler's own answer (nothing is heard on a dead connection), not a refusal.
    const clear = await client.ask(id(), 'layers.clear', { channel: 2, layer: 20 });
    expect(clear.error).toBeUndefined();
    expect(clear.payload).toEqual({ ok: false, reason: 'foreign' });
  }, 20_000);
});

describe('the bearer — never revoked, never expired, gone at sign-out', () => {
  it('a revoked bearer is never presented — control: the same bearer was, before the revocation', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    const authority = s.handle.playoutAuth;
    if (catalogue === null || authority === null) throw new Error('no Playout link');
    const { token } = await s.signIn('bothChannels');
    // Control: the sign-in's read carried THIS console's token.
    expect(s.playout.channelsBearers).toEqual([token]);

    const jti = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      jti: string;
      exp: number;
    };
    s.playout.revoke(jti.jti, jti.exp);
    await authority.pollRevokedNow();
    expect(authority.isRevoked(jti.jti), 'the bridge never learned of the revocation').toBe(true);

    s.advance(CATALOGUE_POLL_MS);
    await catalogue.refresh();
    expect(s.playout.channelsBearers, 'a revoked bearer was presented to D4').toEqual([token]);
    expect(catalogue.rows()).toBeNull();
  }, 20_000);

  it('an expired bearer is never presented — control: it was, while it held', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    if (catalogue === null) throw new Error('no catalogue');
    const exp = Math.floor(Date.now() / 1000) + 120;
    const { token } = await s.signIn('bothChannels', exp);
    expect(s.playout.channelsBearers).toEqual([token]);

    // Past `exp` and the contract's 60 s tolerance, and past the floor.
    s.advance(200_000);
    await catalogue.refresh();
    expect(s.playout.channelsBearers, 'an expired bearer was presented to D4').toEqual([token]);
    expect(catalogue.rows()).toBeNull();
  }, 20_000);

  it('after sign-out there is no bearer and no read — control: there was one before', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    if (catalogue === null) throw new Error('no catalogue');
    const { client } = await s.signIn('bothChannels');
    expect(s.playout.requestCounts.channels).toBe(1);

    expect((await client.ask(id(), 'auth.sign-out')).error).toBeUndefined();
    s.advance(CATALOGUE_POLL_MS);
    await catalogue.refresh();
    expect(s.playout.requestCounts.channels, 'read on behalf of nobody').toBe(1);
    expect(catalogue.rows()).toBeNull();
  }, 20_000);
});

/*
  ⚠ AUTH OFF GAINS NO PUSH. The console reads `channels.list` once on connect; after that an
  auth-OFF socket is pushed a `channels.changed` only when its answer actually moves — which,
  short of a bank installed live on a bank-less bridge, it never does. The first spelling pushed
  one redundant copy after every connect, on the mode read's settings publish.
*/
describe('an auth-OFF console is pushed nothing its answer did not change', () => {
  it('no channels.changed after connect — control: the same socket DID hear the settings publish', async () => {
    const oscPort = await freeUdpPort();
    const mock = track(
      await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 2 }),
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
      }),
      (h) => h.close(),
    );
    // Connect BEFORE the mode read, so its settings publish lands on this socket.
    const client = await openClient(handle);
    await handle.runtime.whenServerHealthy(HEALTH_MS);
    await awaitChannelModeRead(handle.runtime);
    const heard = (channel: string): number =>
      client.publishes().filter((f) => f.type === 'publish' && f.channel === channel).length;

    // Control FIRST: the capture is live — the mode read's settings publish reached this socket.
    await waitFor(() => heard('channelSettings.changed') > 0, 8000);
    expect(heard(StationChannelsChangedChannel.name), 'an unchanged answer was pushed').toBe(0);
  }, 40_000);
});

describe('a sign-in is always pushed its answer', () => {
  it('a viewer signing in after the catalogue is held gets the names — control: the first console did', async () => {
    const s = await station();
    const pushedName = (c: Client): (string | undefined)[] =>
      c
        .publishes()
        .filter((f) => f.type === 'publish' && f.channel === StationChannelsChangedChannel.name)
        .map((f) =>
          f.type === 'publish'
            ? (f.payload as StationChannels).channels.find((ch) => ch.channel === 2)?.named?.name
            : undefined,
        );
    // The first console's bearer read the catalogue — control: its socket heard the name.
    const first = await s.signIn('bothChannels');
    await waitFor(() => pushedName(first.client).includes(OURS?.name));

    /*
      A viewer's answer is the same signed out as signed in (`permitted` false everywhere), and its
      console's pull before sign-in was refused — so the sign-in push is the only copy it gets. A
      dedupe seeded on connect would swallow it.
    */
    const viewer = await s.signIn('viewer');
    await waitFor(() => pushedName(viewer.client).includes(OURS?.name));
  }, 20_000);
});

describe('the console hears it', () => {
  it('a renamed channel is pushed as channels.changed — control: the sign-in push carried the first name', async () => {
    const s = await station();
    const catalogue = s.handle.playoutCatalogue;
    if (catalogue === null) throw new Error('no catalogue');
    const { client } = await s.signIn('bothChannels');
    const named = (): (string | undefined)[] =>
      client
        .publishes()
        .filter((f) => f.type === 'publish' && f.channel === StationChannelsChangedChannel.name)
        .map((f) =>
          f.type === 'publish'
            ? (f.payload as StationChannels).channels.find((c) => c.channel === 2)?.named?.name
            : undefined,
        );
    await waitFor(() => named().includes(OURS?.name));

    s.playout.setChannels([
      { id: 'fake-cg', name: 'نام تازه', casparHost: '127.0.0.1', casparChannel: 2 },
    ]);
    s.advance(CATALOGUE_POLL_MS);
    await catalogue.refresh();
    await waitFor(() => named().includes('نام تازه'));
  }, 20_000);
});

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

/*
  🔴 PREVIEW CHANNELS `N+1..2N` ARE NEVER ADDRESSED OR PROBED — and neither is a catalogue-only
  channel. The server here runs four channels: 1 (the Playout's programme), 2 (ours), and 3–4
  standing for their previews, which the catalogue does not publish. Nothing in the bridge may
  derive an index past the lists it is given.
*/
describe('nothing past the list is probed', () => {
  it('channels 1, 3 and 4 receive nothing — control: the declared channel 2 IS probed', async () => {
    const oscPort = await freeUdpPort();
    const tracePath = path.join(
      os.tmpdir(),
      `cg-discovery-${String(process.pid)}-${String(Date.now())}.ndjson`,
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
        channels: 4,
        tracePath,
      }),
      (m) => m.stop(),
    );
    const s = await station({
      servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    });
    await s.handle.runtime.whenServerHealthy(HEALTH_MS);
    await awaitChannelModeRead(s.handle.runtime);
    const { client } = await s.signIn('bothChannels');
    // The catalogue has been read and pushed — channel 1 is KNOWN to the bridge now.
    expect((await s.list(client)).channels.map((c) => c.channel)).toEqual([1, 2]);
    await new Promise((r) => setTimeout(r, 600));

    await mock.traceFlush();
    const lines = fs
      .readFileSync(tracePath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { dir: string; line: string })
      .filter((e) => e.dir === 'recv')
      .map((e) => e.line);
    const addressing = (channel: number): string[] =>
      lines.filter((l) =>
        new RegExp(`^[A-Z][A-Z ]*?\\s${String(channel)}(?:-\\d+)?(?:\\s|$)`).test(l),
      );

    // Control FIRST: the declared channel is probed (the mode read), so the trace is live.
    expect(lines).toContain('INFO 2');
    expect(addressing(1), 'the Playout’s programme channel was addressed').toEqual([]);
    expect(addressing(3), 'a preview channel was addressed').toEqual([]);
    expect(addressing(4), 'a preview channel was addressed').toEqual([]);
  }, 40_000);
});
