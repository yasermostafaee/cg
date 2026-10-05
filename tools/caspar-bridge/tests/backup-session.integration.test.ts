import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { BackupChannelsState, EngineSessions } from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import { loadBridgeSession } from '../src/bridge-session.js';
import { createBridge, type BridgeHandle, type BridgeOptions } from '../src/bridge.js';
import { openClient, waitFor, type Client } from './support/auth-harness.js';
import { FAKE_ADMIN, startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { HEALTH_MS, awaitChannelModeRead, track } from './support/harness.js';
import { pairBackupCatalogue, pairPrimaryCatalogue } from './support/fake-station.js';
import { FURNITURE, standardBank } from './support/two-channel-rig.js';
import { recvLines } from './support/wire-trace.js';

/**
 * 🔴 `RELEASE-0112-01` Parts A–C (`R-085`, `B-313`) — **A FAKE ENGINE PAIR, THROUGH A REAL CG BRIDGE.**
 *
 * Two fake engines with DIFFERENT signing keys and DIFFERENT passwords, each verifying every bearer against
 * its OWN key (`verifyBearers`) — so the primary's token is `401` on the backup, as on the real pair
 * (`PLAYOUT-CG-RESPONSE-0110-111-v1.md` §2) — and each with its own CasparCG stand-in. CG Bridge signs in on
 * each engine with that engine's own password, over the socket, from a station admin's console.
 */

const PASS_A = 'test-only-engine-a-not-a-secret';
const PASS_B = 'test-only-engine-b-not-a-secret';

/** A line that writes to a layer (anything else a bridge sends a core is a read or its OSC request). */
const LAYER_WRITE = /^(CG|PLAY|LOADBG|LOAD|STOP|CLEAR|MIXER|CALL|PAUSE|RESUME|SWAP)\b/;

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

function scratch(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-backup-session-'));
  track(d, (p) => {
    fs.rmSync(p, { recursive: true, force: true });
  });
  return d;
}

interface Core {
  readonly mock: MockHandle;
  readonly oscPort: number;
  /** AMCP connections the core has admitted — one per bridge connection. */
  connections(): number;
  lines(): Promise<string[]>;
}

async function core(): Promise<Core> {
  const oscPort = await freeUdpPort();
  const trace = path.join(scratch(), 'trace.ndjson');
  let admitted = 0;
  const mock = track(
    await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: 2,
      tracePath: trace,
      admit: () => {
        admitted += 1;
        return true;
      },
    }),
    (m) => m.stop(),
  );
  return {
    mock,
    oscPort,
    connections: () => admitted,
    lines: async () => {
      await mock.traceFlush();
      return fs.existsSync(trace) ? recvLines(trace) : [];
    },
  };
}

interface Pair {
  readonly a: FakePlayout;
  readonly b: FakePlayout;
  readonly coreA: Core;
  readonly coreB: Core;
  readonly handle: BridgeHandle;
  readonly dir: string;
}

const engineTimings: Pick<BridgeOptions, 'backupEngineOptions' | 'playoutVersionOptions'> = {
  backupEngineOptions: { versionOptions: { pollMs: 200 }, licenseOptions: { tickMs: 50 } },
  playoutVersionOptions: { pollMs: 200 },
};

async function engines(): Promise<{ a: FakePlayout; b: FakePlayout }> {
  const a = track(await startFakePlayout({ password: PASS_A, verifyBearers: true }), (p) =>
    p.stop(),
  );
  const b = track(await startFakePlayout({ password: PASS_B, verifyBearers: true }), (p) =>
    p.stop(),
  );
  return { a, b };
}

async function bridgeOn(
  e: { a: FakePlayout; b: FakePlayout },
  cores: { coreA: Core; coreB: Core },
  dir: string,
  extra: Partial<BridgeOptions> = {},
  how: {
    /** The test closes this bridge itself (a restart); teardown must not close it again. */
    readonly closedByTest?: boolean;
    /** Server B is expected HELD (`B-313`): wait for server A alone. */
    readonly backupHeld?: boolean;
  } = {},
): Promise<BridgeHandle> {
  const made = await createBridge({
    port: 0,
    connection: {
      servers: {
        A: { host: '127.0.0.1', amcpPort: cores.coreA.mock.amcpPort, oscPort: cores.coreA.oscPort },
        B: { host: '127.0.0.1', amcpPort: cores.coreB.mock.amcpPort, oscPort: cores.coreB.oscPort },
      },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    fixedLayers: [standardBank(1)],
    playout: {
      auth: 'playout',
      issuer: e.a.issuer,
      jwksUrl: e.a.jwksUrl,
      tokenUrl: e.a.tokenUrl,
      refreshUrl: e.a.refreshUrl,
      revokedUrl: e.a.revokedUrl,
    },
    bridgeSessionPath: path.join(dir, 'bridge-session.json'),
    backupPlayoutAddress: e.b.baseUrl,
    ...engineTimings,
    ...extra,
  });
  const handle = how.closedByTest === true ? made : track(made, (h) => h.close());
  if (how.backupHeld === true) {
    await until(
      async () => handle.runtime.health().primary.state === 'healthy',
      'server A healthy',
      HEALTH_MS,
    );
  } else {
    await handle.runtime.whenServerHealthy(HEALTH_MS);
  }
  await awaitChannelModeRead(handle.runtime);
  handle.runtime.templateImport(FURNITURE, '<!doctype html><html><body>logo</body></html>');
  return handle;
}

async function pair(): Promise<Pair> {
  const e = await engines();
  const coreA = await core();
  const coreB = await core();
  const dir = scratch();
  const handle = await bridgeOn(e, { coreA, coreB }, dir);
  return { ...e, coreA, coreB, handle, dir };
}

let n = 0;
const id = (): string => `q-${String(++n)}`;

/** A station admin's console, signed in at the PRIMARY engine (consoles sign in there). */
async function adminConsole(p: { a: FakePlayout; handle: BridgeHandle }): Promise<Client> {
  const client = await openClient(p.handle);
  const { token } = await p.a.issueToken({ user: 'admin' });
  expect((await client.authenticate(id(), token)).error).toBeUndefined();
  return client;
}

const enginesOf = async (c: Client): Promise<EngineSessions> =>
  (await c.ask(id(), 'bridgeSession.engines')).payload as EngineSessions;

/** Poll an async condition until it holds; throws naming `what` when it never does. */
async function until(cond: () => Promise<boolean>, what: string, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Each engine's lines once neither is still `waiting` for its first answer. */
async function settledEngines(c: Client): Promise<EngineSessions> {
  let now = await enginesOf(c);
  await until(async () => {
    now = await enginesOf(c);
    return now.primary.state !== 'waiting' && now.backup?.state !== 'waiting';
  }, 'both engines to answer their first refresh');
  return now;
}

/** The `iss` of every bearer an engine received — the instrument for "whose token was this". */
function issuersSeenBy(engine: FakePlayout): string[] {
  return engine.requestLog.flatMap((r) => {
    const auth = r.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return [];
    const [, payload] = auth.slice('Bearer '.length).split('.');
    try {
      const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as {
        iss?: string;
      };
      return [claims.iss ?? '?'];
    } catch {
      return ['?'];
    }
  });
}

async function take(handle: BridgeHandle, row: string): Promise<void> {
  expect(await handle.runtime.loadFixed({ channel: 1, layer: 99 }, row, 'logo', {})).toEqual({
    accepted: true,
  });
  expect((await handle.runtime.take(row)).accepted).toBe(true);
}

describe('🔴 R-085 — one Playout session per engine, each with its own account', () => {
  it('each engine signs in with ITS OWN password — the other’s is refused — and every request carries that engine’s own token, never the other’s', async () => {
    const p = await pair();
    const admin = await adminConsole(p);

    expect(
      (await admin.ask(id(), 'bridgeSession.sign-in', { username: 'cg-admin', password: PASS_A }))
        .payload,
    ).toEqual({ ok: true });
    // CONTROL — the backup refuses the PRIMARY's password: each engine keeps its own.
    expect(
      (
        await admin.ask(id(), 'bridgeSession.backup.sign-in', {
          username: 'cg-admin',
          password: PASS_A,
        })
      ).payload,
    ).toEqual({ ok: false, failure: 'invalid_credentials' });
    expect(
      (
        await admin.ask(id(), 'bridgeSession.backup.sign-in', {
          username: 'cg-admin',
          password: PASS_B,
        })
      ).payload,
    ).toEqual({ ok: true });

    // Each engine's line, signed in, with its account and its address.
    await waitFor(() => p.b.requestLog.some((r) => r.path === '/api/cg/channels'), 8_000);
    const both = await enginesOf(admin);
    expect(both.primary).toMatchObject({
      engine: 'primary',
      state: 'signed-in',
      name: FAKE_ADMIN.name,
    });
    expect(both.backup).toMatchObject({
      engine: 'backup',
      state: 'signed-in',
      name: FAKE_ADMIN.name,
      address: p.b.baseUrl,
      version: '2.9.2',
    });

    // 🔴 THE INSTRUMENT — whose token each engine received. The backup's reads (D4, the license, the
    // introducing D9) carried the BACKUP's token; the primary saw only its own.
    await waitFor(
      () =>
        p.b.requestLog.some((r) => r.path === '/api/cg/revoked') &&
        p.b.requestLog.some((r) => r.path === '/api/cg/license'),
      8_000,
    );
    const atB = issuersSeenBy(p.b);
    const atA = issuersSeenBy(p.a);
    expect(atB.length, 'the backup was read with a bearer at all').toBeGreaterThan(0);
    expect(new Set(atB)).toEqual(new Set([p.b.issuer]));
    expect(new Set(atA)).toEqual(new Set([p.a.issuer]));
    // …and neither engine refused a token as another engine's.
    expect(p.a.foreignRefusals).toBe(0);
    expect(p.b.foreignRefusals).toBe(0);

    // Two files, two families, the backup's bound to its engine.
    const primaryRecord = loadBridgeSession(path.join(p.dir, 'bridge-session.json')).record;
    const backupRecord = loadBridgeSession(path.join(p.dir, 'bridge-session-backup.json')).record;
    expect(primaryRecord?.refreshToken).toBeDefined();
    expect(backupRecord?.address).toBe(p.b.baseUrl);
    expect(backupRecord?.refreshToken).not.toBe(primaryRecord?.refreshToken);
    expect(primaryRecord?.address).toBeUndefined();

    // The record names the server, and never a password.
    const rows = (await admin.ask(id(), 'audit.recent', { limit: 50 })).payload as AuditEntry[];
    expect(
      rows
        .filter((r) => r.action === 'bridge-sign-in')
        .map((r) => [r.outcome, r.server ?? 'primary']),
    ).toEqual(
      expect.arrayContaining([
        ['ok', 'primary'],
        ['failed', 'backup'],
        ['ok', 'backup'],
      ]),
    );
    expect(JSON.stringify(rows)).not.toContain(PASS_A);
    expect(JSON.stringify(rows)).not.toContain(PASS_B);
  }, 40_000);

  it('🔴 a reuse revocation on the BACKUP loses the backup’s session alone — the primary’s and every console untouched; and the reverse', async () => {
    // Sign both in once, then put a SPENT refresh token in one engine's file and start again.
    for (const spentOn of ['backup', 'primary'] as const) {
      const e = await engines();
      const coreA = await core();
      const coreB = await core();
      const dir = scratch();
      const first = await bridgeOn(e, { coreA, coreB }, dir, {}, { closedByTest: true });
      const admin = await adminConsole({ a: e.a, handle: first });
      await admin.ask(id(), 'bridgeSession.sign-in', { username: 'cg-admin', password: PASS_A });
      await admin.ask(id(), 'bridgeSession.backup.sign-in', {
        username: 'cg-admin',
        password: PASS_B,
      });
      await first.close();

      const file = path.join(
        dir,
        spentOn === 'backup' ? 'bridge-session-backup.json' : 'bridge-session.json',
      );
      const engine = spentOn === 'backup' ? e.b : e.a;
      const record = loadBridgeSession(file).record;
      expect(record, spentOn).not.toBeNull();
      // Spend it at its own engine, so the bridge's next D2 presents a used token (a reuse).
      const spent = await fetch(engine.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: record?.refreshToken }),
      });
      expect(spent.status, `spending the ${spentOn}'s token`).toBe(200);

      const again = await bridgeOn(e, { coreA, coreB }, dir, {}, { closedByTest: true });
      const watcher = await adminConsole({ a: e.a, handle: again });
      const now = await settledEngines(watcher);
      if (spentOn === 'backup') {
        expect(now.backup?.state).toBe('needs-admin');
        expect(now.primary.state).toBe('signed-in');
      } else {
        expect(now.primary.state).toBe('needs-admin');
        expect(now.backup?.state).toBe('signed-in');
      }
      // The other engine never saw the spent token, and no console was signed out.
      expect(watcher.ws.readyState).toBe(watcher.ws.OPEN);
      expect((spentOn === 'backup' ? e.a : e.b).theftTrips).toBe(0);
      await again.close();
    }
  }, 90_000);

  it('🔴 the backup answers `403 cg_not_licensed`: its line says so in words — and a take on the primary is sent as before', async () => {
    const p = await pair();
    const admin = await adminConsole(p);
    await admin.ask(id(), 'bridgeSession.sign-in', { username: 'cg-admin', password: PASS_A });
    const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';
    p.b.setCgNotLicensed(message);
    expect(
      (
        await admin.ask(id(), 'bridgeSession.backup.sign-in', {
          username: 'cg-admin',
          password: PASS_B,
        })
      ).payload,
    ).toEqual({ ok: false, failure: 'cg_not_licensed', message });
    const now = await enginesOf(admin);
    expect(now.backup?.state).toBe('not-licensed');
    expect(now.primary.state).toBe('signed-in');

    // The primary takes exactly as before: its CG ADD and PLAY reach server A.
    const before = (await p.coreA.lines()).length;
    await take(p.handle, 'logo-1');
    const sent = (await p.coreA.lines()).slice(before);
    expect(sent.some((l) => l.startsWith('CG 1-99 ADD'))).toBe(true);
    expect(sent).toContain('CG 1-99 PLAY 0');
  }, 40_000);

  it('🔴 the backup engine unreachable: its line says so — the primary’s session and a take on it are untouched', async () => {
    const p = await pair();
    const admin = await adminConsole(p);
    await admin.ask(id(), 'bridgeSession.sign-in', { username: 'cg-admin', password: PASS_A });
    await p.b.goOffline();
    let now = await enginesOf(admin);
    await until(async () => {
      now = await enginesOf(admin);
      return now.backup?.state === 'unreachable';
    }, 'the backup line to read unreachable');
    expect(now.backup?.state).toBe('unreachable');
    expect(now.primary.state).toBe('signed-in');
    const before = (await p.coreA.lines()).length;
    await take(p.handle, 'logo-2');
    expect((await p.coreA.lines()).slice(before)).toContain('CG 1-99 PLAY 0');
  }, 40_000);
});

describe('🔴 B-313 — never a second sender on the backup core', () => {
  async function secondBridgeOn(
    coreB: Core,
    opts: { drives: 'nothing' | number },
  ): Promise<BridgeHandle> {
    return track(
      await createBridge({
        port: 0,
        connection: {
          servers: {
            A: { host: '127.0.0.1', amcpPort: coreB.mock.amcpPort, oscPort: await freeUdpPort() },
          },
          strategy: 'mirror-sync',
          autoFailoverEnabled: false,
        },
        ...(opts.drives === 'nothing'
          ? { firstRun: true }
          : { fixedLayers: [standardBank(opts.drives)] }),
      }),
      (h) => h.close(),
    );
  }

  const portOf = (h: BridgeHandle): number => Number(new URL(h.url).port);

  /**
   * Every command THIS bridge sent server B, from its own AMCP log (`<at> B <host> <ms>ms >> <line> << …`) —
   * core B's own trace also holds the other bridge's lines.
   */
  async function sentToB(handle: BridgeHandle, logFile: string): Promise<string[]> {
    await handle.amcpLog?.flush();
    return fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((l) => / B 127\.0\.0\.1:/.test(l))
      .map((l) => / >> (.*) << /.exec(l)?.[1] ?? '')
      .filter((l) => l !== '');
  }

  /** The channel a line names (`CG 2-99 PLAY 0` → 2), or `null` for a line that names none. */
  const namesChannel = (line: string): number | null => {
    const m =
      /^(?:CG|PLAY|LOAD|LOADBG|STOP|CLEAR|PAUSE|RESUME|CALL|MIXER|INFO) (\d+)(?:-\d+)?(?:\s|$)/.exec(
        line,
      );
    return m === null ? null : Number(m[1]);
  };

  async function signInBoth(admin: Client): Promise<void> {
    expect(
      (await admin.ask(id(), 'bridgeSession.sign-in', { username: 'cg-admin', password: PASS_A }))
        .payload,
    ).toEqual({ ok: true });
    expect(
      (
        await admin.ask(id(), 'bridgeSession.backup.sign-in', {
          username: 'cg-admin',
          password: PASS_B,
        })
      ).payload,
    ).toEqual({ ok: true });
  }

  async function mappedTo(admin: Client, onB: number): Promise<void> {
    await until(
      async () => {
        const state = (await admin.ask(id(), 'backupChannels.state'))
          .payload as BackupChannelsState;
        const line = state.backup?.channels.find((c) => c.channel === 1);
        return line?.state === 'mapped' && line.backupChannel === onB;
      },
      `the station's CH 1 mapped to the backup core's ${String(onB)}`,
    );
  }

  it('a CG Bridge on the backup engine’s machine that drives OUR mirror channel there holds this bridge’s mirror: not one layer write — server A untouched', async () => {
    const coreA = await core();
    const coreB = await core();
    // The other bridge drives the backup core's channel 2 — the mirror of OUR channel 1.
    const other = await secondBridgeOn(coreB, { drives: 2 });
    await waitFor(() => coreB.connections() === 1, 8_000);
    const logFile = path.join(scratch(), 'amcp.log');
    const e = await engines();
    e.a.setChannels(pairPrimaryCatalogue(e.b.baseUrl));
    e.b.setChannels(pairBackupCatalogue(e.a.baseUrl));
    const handle = await bridgeOn(
      e,
      { coreA, coreB },
      scratch(),
      { coreGuardPort: portOf(other), amcpLogPath: logFile },
      { backupHeld: true },
    );
    const admin = await adminConsole({ a: e.a, handle });
    await signInBoth(admin);
    await mappedTo(admin, 2);
    // ⚠ Our channel on that core is 2 only once the mapping exists; the guard then reads the other
    // bridge's channels and finds ours among them.
    await until(
      async () => (await enginesOf(admin)).backup?.state === 'core-held',
      'the guard’s verdict: core-held',
    );
    expect(handle.runtime.serverBHeld()).toBe(true);
    // Give a mirror every chance to happen: a take on A.
    await take(handle, 'logo-3');
    await new Promise((r) => setTimeout(r, 500));
    const toB = await sentToB(handle, logFile);
    expect(toB.length, 'the instrument sees this bridge’s reads to server B').toBeGreaterThan(0);
    expect(
      toB.filter((l) => LAYER_WRITE.test(l)),
      'no layer write went to server B',
    ).toEqual([]);
    // Server A is untouched: the take is on it.
    expect(await coreA.lines()).toContain('CG 1-99 PLAY 0');
    // Every surface says it.
    const health = (await (
      await fetch(`http://127.0.0.1:${String(portOf(handle))}/health`)
    ).json()) as {
      problems: { code: string; message: string }[];
    };
    expect(health.problems.map((x) => x.code)).toContain('core-held');
    expect((await enginesOf(admin)).backup).toMatchObject({
      state: 'core-held',
      message: `127.0.0.1:${String(portOf(other))}`,
    });
  }, 60_000);

  it('🔴 RELEASE-0113-01 — a CG Bridge driving the backup core’s OWN programme channel (1) holds nobody: our mirror reaches channel 2, and nothing reaches 1', async () => {
    const coreA = await core();
    const coreB = await core();
    const other = await secondBridgeOn(coreB, { drives: 1 });
    await waitFor(() => coreB.connections() === 1, 8_000);
    const e = await engines();
    e.a.setChannels(pairPrimaryCatalogue(e.b.baseUrl));
    e.b.setChannels(pairBackupCatalogue(e.a.baseUrl));
    const logFile = path.join(scratch(), 'amcp.log');
    const handle = await bridgeOn(e, { coreA, coreB }, scratch(), {
      coreGuardPort: portOf(other),
      amcpLogPath: logFile,
    });
    const admin = await adminConsole({ a: e.a, handle });
    await signInBoth(admin);
    await mappedTo(admin, 2);
    await until(
      async () => handle.runtime.health().backup?.state === 'healthy',
      'server B healthy',
    );
    // Give the guard its reading with our channel 2 in force: the other bridge's 1 is not ours.
    await new Promise((r) => setTimeout(r, 400));
    expect(handle.runtime.serverBHeld()).toBe(false);
    expect((await enginesOf(admin)).backup?.state).not.toBe('core-held');
    await take(handle, 'logo-5');
    await until(
      async () => (await sentToB(handle, logFile)).includes('CG 2-99 PLAY 0'),
      'the mirror on the backup core’s channel 2',
    );
    // 🔴 Every line this bridge sent the backup core that names a channel names 2 — never its own 1.
    const named = new Set(
      (await sentToB(handle, logFile)).map(namesChannel).filter((c): c is number => c !== null),
    );
    expect([...named]).toEqual([2]);
  }, 60_000);

  it('CONTROL — an IDLE bridge there (first-run, no channel) holds nobody: this bridge mirrors to the backup core’s channel 2; and the idle bridge itself writes no layer', async () => {
    const coreA = await core();
    const coreB = await core();
    const idle = await secondBridgeOn(coreB, { drives: 'nothing' });
    await waitFor(() => coreB.connections() === 1, 8_000);
    await new Promise((r) => setTimeout(r, 600));
    // 🔴 The idle bridge's own AMCP: reads only — no layer write at all.
    const idleLines = await coreB.lines();
    expect(idleLines.length, 'the instrument sees the idle bridge’s lines').toBeGreaterThan(0);
    expect(idleLines.filter((l) => LAYER_WRITE.test(l))).toEqual([]);

    const e = await engines();
    e.a.setChannels(pairPrimaryCatalogue(e.b.baseUrl));
    e.b.setChannels(pairBackupCatalogue(e.a.baseUrl));
    const handle = await bridgeOn(e, { coreA, coreB }, scratch(), {
      coreGuardPort: portOf(idle),
    });
    const admin = await adminConsole({ a: e.a, handle });
    await signInBoth(admin);
    await mappedTo(admin, 2);
    await waitFor(() => coreB.connections() === 2, 8_000);
    expect(handle.runtime.serverBHeld()).toBe(false);
    await until(
      async () => handle.runtime.health().backup?.state === 'healthy',
      'server B healthy',
    );
    const before = (await coreB.lines()).length;
    await take(handle, 'logo-4');
    await until(
      async () => (await coreB.lines()).slice(before).includes('CG 2-99 PLAY 0'),
      'the mirror on the backup core',
    );
    expect((await coreB.lines()).slice(before), 'the mirror reached the backup core').toContain(
      'CG 2-99 PLAY 0',
    );
  }, 60_000);
});
