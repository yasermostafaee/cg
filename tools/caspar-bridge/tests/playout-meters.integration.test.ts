import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PgmMeterReadingListSchema,
  type PgmMeterReading,
  type TicketPath,
  type WsFrame,
} from '@cg/shared-ipc';
import { SseParser } from '../src/playout-meters.js';
import { openClient, type Client } from './support/auth-harness.js';
import { startFakePgmFeed } from './support/fake-pgm-feed.js';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from './support/fake-playout.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil, type TwoChannelRig } from './support/two-channel-rig.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PLAYOUT'S METERS, READ ONCE BY CG BRIDGE AND TOLD TO EACH
 * CONSOLE FOR ITS OWN CHANNELS ONLY; THE PROGRAMME SOUND BEHIND ITS OWN TICKET.**
 *
 * Against the fake Playout's `GET /api/cg/meters` (PLAYLIST-AUDIO §2.3) and the fake core's `/audio.wav`.
 * Three consoles sign in with three grants — channel 1, channel 2, both — and the fake sees ONE stream.
 */

let n = 0;
const id = (): string => `mtr-${String(++n)}`;

const LEVELS_1 = {
  dbfs: [-18.2, -18.6, ...Array.from({ length: 14 }, () => -60)],
  loudness: { momentary: -22.4, shortterm: -23.1, limiterGrDb: 0 },
};
const LEVELS_2 = { dbfs: Array.from({ length: 16 }, () => -6), loudness: null };

interface Station {
  readonly rig: TwoChannelRig;
  readonly playout: FakePlayout;
  readonly one: Client;
  readonly two: Client;
  readonly both: Client;
  /** The station admin who signed CG Bridge in. */
  readonly admin: Client;
}

async function signedIn(rig: TwoChannelRig, playout: FakePlayout, user: string): Promise<Client> {
  const client = await openClient(rig.handle);
  const { token } = await playout.issueToken({
    user: user as 'operator' | 'channelTwo' | 'bothChannels' | 'admin',
  });
  expect((await client.authenticate(id(), token)).error).toBeUndefined();
  return client;
}

async function station(extra: Parameters<typeof twoChannelRig>[0] = {}): Promise<Station> {
  // The station's own account holds every programme channel, as the plant's does.
  const playout = track(await startFakePlayout({ grants: { admin: '*' } }), (p) => p.stop());
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-meters-')), (d) => {
    fs.rmSync(d, { recursive: true, force: true });
  });
  playout.setMeterLevels(1, LEVELS_1);
  playout.setMeterLevels(2, LEVELS_2);
  const rig = await twoChannelRig({
    ...extra,
    bridge: {
      playout: {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
      },
      bridgeSessionPath: path.join(dir, 'bridge-session.json'),
      playoutMetersTuning: { backoffBaseMs: 50, backoffMaxMs: 200, lingerMs: 100 },
      ...(extra.bridge ?? {}),
    },
  });
  /*
    Production's shape: a station admin signs CG Bridge in ONCE, and the stream reads with the bridge's OWN
    session from then on — so every channel reaches it, whichever console signed in last (D7).
  */
  const admin = await signedIn(rig, playout, 'admin');
  const signIn = await admin.ask(id(), 'bridgeSession.sign-in', {
    username: FAKE_ADMIN.username,
    password: FAKE_PLAYOUT_PASSWORD,
  });
  expect(signIn.payload).toEqual({ ok: true });
  const one = await signedIn(rig, playout, 'operator');
  const two = await signedIn(rig, playout, 'channelTwo');
  const both = await signedIn(rig, playout, 'bothChannels');
  return { rig, playout, one, two, both, admin };
}

function readings(client: Client): PgmMeterReading[] {
  return client
    .publishes()
    .filter((f): f is Extract<WsFrame, { type: 'publish' }> => f.type === 'publish')
    .filter((f) => f.channel === 'meters.changed')
    .flatMap((f) => PgmMeterReadingListSchema.parse(f.payload));
}

describe('PLAYOUT-FEATURES-01 E — the Playout’s meters, relayed', () => {
  it('🔴 ONE stream, the bearer in the header and never the URL; each console is told its OWN channels only', async () => {
    const { playout, one, two, both } = await station();
    const opened = playout.meterRequests.length;
    await waitUntil(
      () =>
        Promise.resolve(
          readings(one).some((r) => r.kind === 'loudness') &&
            readings(two).some((r) => r.kind === 'audio') &&
            new Set(readings(both).map((r) => r.channel)).size === 2,
        ),
      'readings on every console',
    );
    // ONE stream for every console — their sign-ins opened no other — and no request carries a query at
    // all: no token in any URL, only in the header.
    expect(playout.meterStreams).toBe(1);
    expect(playout.meterRequests.length).toBe(opened);
    expect(opened).toBeGreaterThan(0);
    for (const request of playout.meterRequests) {
      expect(request).toEqual({ url: '/api/cg/meters', bearer: true });
    }

    // The positive control is `both`: it hears both channels. The scoped consoles hear their own only.
    expect(readings(one).every((r) => r.channel === 1)).toBe(true);
    expect(readings(two).every((r) => r.channel === 2)).toBe(true);

    // The Playout's own numbers, relayed as they came (16 buses, 0.1 dB).
    const audio = readings(one).find((r) => r.kind === 'audio');
    expect(audio).toEqual({ kind: 'audio', channel: 1, dbfs: LEVELS_1.dbfs });
    const loud = readings(one).find((r) => r.kind === 'loudness');
    expect(loud).toEqual({ kind: 'loudness', channel: 1, ...LEVELS_1.loudness });
    // Channel 2's loudness is unknown: no `loudness` for it — never a stale or invented one.
    expect(readings(two).some((r) => r.kind === 'loudness')).toBe(false);
  }, 60_000);

  it('the stream closing is answered by connecting again; the core down reads as the floor', async () => {
    const { playout, one } = await station();
    await waitUntil(() => Promise.resolve(readings(one).length > 0), 'first readings');

    playout.closeMeterStreams();
    await waitUntil(
      () => Promise.resolve(playout.meterRequests.length >= 2 && playout.meterStreams === 1),
      'the reconnect',
    );
    const mark = readings(one).length;
    playout.setMeterCoreDown(true);
    await waitUntil(
      () =>
        Promise.resolve(
          readings(one)
            .slice(mark)
            .some((r) => r.kind === 'audio' && r.dbfs.every((v) => v === -60)),
        ),
      'the floor while the core is down',
    );
  }, 60_000);

  it('the last console leaving releases the stream', async () => {
    const { playout, one, two, both, admin } = await station();
    await waitUntil(() => Promise.resolve(playout.meterStreams === 1), 'the stream');
    for (const client of [one, two, both, admin]) client.ws.close();
    await waitUntil(() => Promise.resolve(playout.meterStreams === 0), 'the release');
  }, 60_000);
});

describe('PLAYOUT-FEATURES-01 E — the programme sound behind its own ticket', () => {
  it('🔴 the sound’s ticket opens `/pgm/<n>/sound` only, cross-origin readable; the picture’s does not open it', async () => {
    const feed = track(await startFakePgmFeed(), (f) => f.stop());
    const { rig, one } = await station({ bridge: { pgmReturn: { portFor: () => feed.port } } });
    const base = `http://127.0.0.1:${String(rig.handle.port)}`;

    const audio = (await one.ask(id(), 'pgmReturn.ticket', { channel: 1, stream: 'audio' }))
      .payload as TicketPath;
    expect(audio.path).toMatch(/^\/pgm\/1\/sound\?ticket=[A-Za-z0-9_-]+$/);
    const picture = (await one.ask(id(), 'pgmReturn.ticket', { channel: 1 })).payload as TicketPath;
    expect(picture.path).toMatch(/^\/pgm\/1\?ticket=/);

    // Crossed: each ticket opens its own stream and not the other.
    const pictureTicket = picture.path.split('?')[1] ?? '';
    const audioTicket = audio.path.split('?')[1] ?? '';
    expect((await fetch(`${base}/pgm/1/sound?${pictureTicket}`)).status).toBe(403);
    expect((await fetch(`${base}/pgm/1?${audioTicket}`)).status).toBe(403);
    // Channel 2 is not this console's: no ticket is issued for it.
    expect(
      (await one.ask(id(), 'pgmReturn.ticket', { channel: 2, stream: 'audio' })).error,
    ).toBeDefined();

    // The positive control: the right ticket plays the core's sound, readable from another origin.
    const controller = new AbortController();
    const res = await fetch(`${base}${audio.path}`, { signal: controller.signal });
    expect(res.status).toBe(200);
    // Never `audio/wav` behind a `.wav` path: a download manager's hook would swallow it (`pgmAudioPath`).
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let got = 0;
    while (got < 44 + 3840) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.length;
    }
    expect(got).toBeGreaterThanOrEqual(44 + 3840);
    expect(feed.audioConnections).toHaveLength(1);
    expect(feed.audioConnections[0]?.received.toString('latin1')).toBe(
      'GET /audio.wav HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',
    );
    controller.abort();
  }, 60_000);
});

describe('SseParser — the part of the grammar the Playout uses', () => {
  it('events by blank line, `\\r\\n` or `\\n`, split anywhere; comments skipped; an oversized event refused', () => {
    const seen: [string, string][] = [];
    const parser = new SseParser((event, data) => seen.push([event, data]));
    const text =
      ': apasai meters\r\n\r\nevent: audio\r\ndata: {"a":1}\r\n\r\n: ping\n\nevent: loudness\ndata: {"b":2}\n\n';
    for (const ch of text) expect(parser.push(ch)).toBe(true);
    expect(seen).toEqual([
      ['audio', '{"a":1}'],
      ['loudness', '{"b":2}'],
    ]);
    expect(parser.push(`data: ${'x'.repeat(70_000)}`)).toBe(false);
  });
});

/**
 * 🔴 `RELEASE-0112-01-C` C3 (`R-086`) — **CG BRIDGE SIGNED IN AS `cg-bridge`.** From `2.9.4` the Playout's
 * meters carry `cg-bridge` every CG-licensed programme channel (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md`
 * §3), so a bridge signed in with that account relays them; on `2.9.3` the account's meters are empty.
 */
describe('RELEASE-0112-01-C C3 — CG Bridge signed in as cg-bridge', () => {
  async function bridgeAccountStation(
    version: string,
  ): Promise<{ playout: FakePlayout; both: Client }> {
    const playout = track(await startFakePlayout(), (p) => p.stop());
    playout.setVersion(version);
    const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-meters-bridge-')), (d) => {
      fs.rmSync(d, { recursive: true, force: true });
    });
    playout.setMeterLevels(1, LEVELS_1);
    playout.setMeterLevels(2, LEVELS_2);
    const rig = await twoChannelRig({
      bridge: {
        playout: {
          auth: 'playout',
          issuer: playout.issuer,
          jwksUrl: playout.jwksUrl,
          tokenUrl: playout.tokenUrl,
          refreshUrl: playout.refreshUrl,
          revokedUrl: playout.revokedUrl,
        },
        bridgeSessionPath: path.join(dir, 'bridge-session.json'),
        playoutMetersTuning: { backoffBaseMs: 50, backoffMaxMs: 200, lingerMs: 100 },
      },
    });
    const admin = await signedIn(rig, playout, 'admin');
    const signIn = await admin.ask(id(), 'bridgeSession.sign-in', {
      username: 'cg-bridge',
      password: FAKE_PLAYOUT_PASSWORD,
    });
    expect(signIn.payload).toEqual({ ok: true });
    const both = await signedIn(rig, playout, 'bothChannels');
    return { playout, both };
  }

  it('🔴 on a 2.9.4 engine the meters flow with the cg-bridge token — CONTROL: on 2.9.3 its meters carry nothing', async () => {
    const full = await bridgeAccountStation('2.9.4');
    await waitUntil(
      () => Promise.resolve(new Set(readings(full.both).map((r) => r.channel)).size === 2),
      'readings for both channels through the cg-bridge token',
    );
    expect(full.playout.meterRequests.every((r) => r.bearer)).toBe(true);

    const empty = await bridgeAccountStation('2.9.3');
    await waitUntil(
      () => Promise.resolve(empty.playout.meterStreams >= 1),
      'the stream open on the 2.9.3 engine',
    );
    await new Promise((r) => setTimeout(r, 600));
    expect(readings(empty.both)).toEqual([]);
  }, 60_000);
});
