import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PgmMeterReadingListSchema,
  type ConnectionCheckResult,
  type PgmMeterReading,
  type WsFrame,
} from '@cg/shared-ipc';
import { realProbes, type CheckProbes } from '../src/index.js';
import { openClient, type Client } from './support/auth-harness.js';
import {
  FAKE_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
  type FakePlayout,
} from './support/fake-playout.js';
import { track } from './support/harness.js';
import { delay, twoChannelRig, waitUntil, type TwoChannelRig } from './support/two-channel-rig.js';

/**
 * 🔴 `B-327` (`SERVERS-SIMPLIFY-01` T6) — **THE OWNER'S STATE: A CHECK THAT READ GREEN WHILE THE METERS WERE SILENT.**
 *
 * Station setup's server A named his own PC (`.93`) against a Playout whose `casparHost` is `127.0.0.1`. Every line
 * of the check passed, and the meters, the sources and the grants joined nothing, because each is joined by an exact
 * host. Here the check answers whether A joins the Playout's — through the SAME `hostIsOurs` the meters read — and
 * the write `Use the Playout's` makes brings the meters back. Both placements of CG Bridge, because the right A is
 * opposite in each. `192.0.2.x` (RFC 5737) stands for the station's addresses; nothing connects to a real station.
 */

let n = 0;
const id = (): string => `join-${String(++n)}`;
const CONSOLE = 'http://127.0.0.1:5174';
const LEVELS = { dbfs: Array.from({ length: 16 }, () => -18), loudness: null };

const quietProbes = (): CheckProbes => ({
  ...realProbes(),
  processes: async () => [],
  systemProxy: async () => null,
  portHolder: async () => ({ kind: 'free' }),
  adapters: () => [],
});

interface Station {
  readonly rig: TwoChannelRig;
  readonly playout: FakePlayout;
  readonly admin: Client;
}

/** A Playout station; `address` set = CG Bridge on a separate server, its Playout at that address. */
async function station(address?: string): Promise<Station> {
  const playout = track(await startFakePlayout({ grants: { admin: '*' } }), (p) => p.stop());
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-join-')), (d) => {
    fs.rmSync(d, { recursive: true, force: true });
  });
  playout.setMeterLevels(1, LEVELS);
  const rig = await twoChannelRig({
    bridge: {
      playout: {
        auth: 'playout',
        ...(address !== undefined ? { address } : {}),
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
        // Read from the fake through explicit endpoints, which win over the address's.
        channelsUrl: playout.channelsUrl,
        inputsUrl: playout.inputsUrl,
        mediaUrl: playout.mediaUrl,
      },
      bridgeSessionPath: path.join(dir, 'bridge-session.json'),
      playoutMetersTuning: { backoffBaseMs: 50, backoffMaxMs: 200, lingerMs: 100 },
      connectionCheckProbes: quietProbes(),
    },
  });
  const admin = await openClient(rig.handle);
  const { token } = await playout.issueToken({ user: 'admin' });
  expect((await admin.authenticate(id(), token)).error).toBeUndefined();
  const signIn = await admin.ask(id(), 'bridgeSession.sign-in', {
    username: FAKE_ADMIN.username,
    password: FAKE_PLAYOUT_PASSWORD,
  });
  expect(signIn.payload).toEqual({ ok: true });
  await waitUntil(() => (rig.handle.playoutCatalogue?.rows() ?? null) !== null, 'the D4 list');
  return { rig, playout, admin };
}

function readings(client: Client): PgmMeterReading[] {
  return client
    .publishes()
    .filter((f): f is Extract<WsFrame, { type: 'publish' }> => f.type === 'publish')
    .filter((f) => f.channel === 'meters.changed')
    .flatMap((f) => PgmMeterReadingListSchema.parse(f.payload));
}

/** `connections.set-config` with server A at `host` — what `Use the Playout's` sends. */
async function setServerA(s: Station, host: string): Promise<void> {
  const current = s.rig.handle.runtime.config();
  const res = await s.admin.ask(id(), 'connections.set-config', {
    ...current,
    servers: { ...current.servers, A: { ...current.servers.A, host } },
  });
  expect(res.error, `server A = ${host} was refused`).toBeUndefined();
}

async function check(s: Station): Promise<ConnectionCheckResult> {
  const res = await s.admin.ask(id(), 'setup.check', {
    playoutAddress: new URL(s.playout.tokenUrl).origin,
    casparHost: s.rig.handle.runtime.config().servers.A.host,
    origin: CONSOLE,
  });
  expect(res.error).toBeUndefined();
  return res.payload as ConnectionCheckResult;
}

/** Readings arriving after `mark`: none for `ms` while the fake's stream is open (the positive control). */
async function silentFor(s: Station, mark: number, ms: number): Promise<void> {
  const requests = s.playout.meterRequests.length;
  await delay(ms);
  expect(s.playout.meterStreams, 'the instrument: the Playout is still sending').toBe(1);
  expect(s.playout.meterRequests.length, 'the stream was not reopened').toBe(requests);
  expect(readings(s.admin).slice(mark)).toEqual([]);
}

describe('B-327 — placement 1: CG Bridge on the Playout’s machine', () => {
  it('🔴 the owner’s state: A = his own PC — the meters are silent, the check names both hosts; `127.0.0.1` restores them', async () => {
    const s = await station();
    // The positive control first: A = 127.0.0.1 (the rig's) joins, the meters flow.
    await waitUntil(() => readings(s.admin).length > 0, 'readings while A joins');
    const joined = await check(s);
    expect(joined.casparJoin).toEqual({
      casparHost: '127.0.0.1',
      playoutCasparHost: '127.0.0.1',
      joins: true,
    });
    // Naming the CasparCG host no longer costs the station its own lines (the route's two questions).
    const ids = joined.lines.map((l) => l.id);
    for (const line of ['bridge-session', 'license', 'channels']) expect(ids).toContain(line);

    // The owner's state.
    await setServerA(s, '192.0.2.93');
    await delay(300); // a reading in flight across the apply
    const mark = readings(s.admin).length;
    await silentFor(s, mark, 800);
    expect((await check(s)).casparJoin).toEqual({
      casparHost: '192.0.2.93',
      playoutCasparHost: '127.0.0.1',
      joins: false,
    });

    // `Use the Playout's`: the derived host, and the meters return.
    await setServerA(s, '127.0.0.1');
    await waitUntil(() => readings(s.admin).length > mark, 'readings after the repair');
  }, 60_000);
});

describe('B-327 — placement 2: CG Bridge on a separate server', () => {
  it('🔴 A = 127.0.0.1 joins NOTHING here — the check says the Playout’s is its address; writing it restores the meters', async () => {
    const s = await station('http://192.0.2.32:8080');
    const mark = readings(s.admin).length;
    await waitUntil(() => s.playout.meterStreams === 1, 'the stream');
    await silentFor(s, mark, 800);
    expect((await check(s)).casparJoin).toEqual({
      casparHost: '127.0.0.1',
      playoutCasparHost: '192.0.2.32',
      joins: false,
    });

    await setServerA(s, '192.0.2.32');
    await waitUntil(() => readings(s.admin).length > mark, 'readings after the repair');
  }, 60_000);
});

describe('B-327 — the join is told to a signed-in asker only', () => {
  it('a check before any sign-in carries no `casparJoin`; control: the same check signed in does', async () => {
    const s = await station();
    const anon = await openClient(s.rig.handle);
    const res = await anon.ask(id(), 'setup.check', {
      playoutAddress: new URL(s.playout.tokenUrl).origin,
      origin: CONSOLE,
    });
    expect(res.error).toBeUndefined();
    expect((res.payload as ConnectionCheckResult).casparJoin).toBeUndefined();
    expect((await check(s)).casparJoin?.joins).toBe(true);
  }, 60_000);
});
