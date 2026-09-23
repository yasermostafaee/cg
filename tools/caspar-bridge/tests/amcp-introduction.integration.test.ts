import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AUTH_STATION_NOT_SET_UP, type ConnectionHealth } from '@cg/shared-ipc';
import {
  createBridge,
  probeAmcp,
  realProbes,
  writePlayoutAddress,
  type BridgeHandle,
  type CheckProbes,
} from '../src/index.js';
import { pinnedIPv4 } from '../src/playout-http.js';
import { deadConnection, expectRefusedWith, openClient, waitFor } from './support/auth-harness.js';
import {
  startFakePlayout,
  type FakePlayout,
  type FakePlayoutOptions,
} from './support/fake-playout.js';

/**
 * 🔴 `DESKTOP-APPS-01-C` — **THE PLAYOUT'S REVISED 2.8.54 AMCP RULE, AND WHAT THE BRIDGE DOES.**
 *
 *   C8 — the fake keeps the Playout's allow list as the revised rule does: only D9 introduces; the
 *        first machine is let in automatically once, then the path is sealed; everyone after is
 *        PENDING until the administrator approves; an operator's first contact seals it too.
 *   C4 — a station-admin's sign-in is followed by a D9 read at once, with that admin's token.
 *   C5 — before the issuer is adopted, a refused sign-in's token never reaches D4, D8 or D9.
 *   C6 — the HTTP reads and the AMCP socket leave from the same IPv4.
 *   C7 — after the window, the check names the in-app approval and this machine's IPv4.
 *
 * Everything runs on loopback. The real Playout seals its automatic path on a LOOPBACK first
 * contact, so suites that exercise the automatic path start the fake with `sealOnLoopback: false`
 * — the stand-in for a bridge on its own LAN address.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;
let amcp: MockHandle | null = null;
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await handle?.close();
  await playout?.stop();
  await amcp?.stop();
  for (const close of closers.splice(0)) await close();
  handle = null;
  playout = null;
  amcp = null;
});

/** A raw GET, so a test sends exactly the headers — and the source address — it means to. */
function get(url: string, headers: Record<string, string>, localAddress?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'GET', headers, ...(localAddress !== undefined ? { localAddress } : {}) },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

async function fake(options: FakePlayoutOptions = {}): Promise<FakePlayout> {
  playout = await startFakePlayout(options);
  return playout;
}

describe('C8 — the fake Playout keeps the revised allow list', () => {
  it('ONLY D9 introduces: a station-admin’s D4 and D8 reads introduce nothing; control: its D9 read does', async () => {
    const p = await fake({ sealOnLoopback: false });
    const admin = await p.issueToken({ user: 'admin' });
    expect(await get(p.channelsUrl, bearer(admin.token))).toBe(200);
    expect(await get(p.meUrl, bearer(admin.token))).toBe(200);
    // Both reached the Playout and were answered — and introduced nothing, sealed nothing.
    expect(p.trustedSources).toEqual([]);
    expect(p.pendingSources).toEqual([]);
    expect(p.sealed).toBe(false);
    // CONTROL — the same token, on D9.
    expect(await get(p.revokedUrl, bearer(admin.token))).toBe(200);
    expect(p.trustedSources).toEqual(['127.0.0.1']);
  });

  it('the FIRST machine is let in once; the path is then SEALED and the next machine is PENDING until approved', async () => {
    const p = await fake({ sealOnLoopback: false });
    const admin = await p.issueToken({ user: 'admin' });
    expect(await get(p.revokedUrl, bearer(admin.token), '127.0.0.1')).toBe(200);
    expect(p.trustedSources).toEqual(['127.0.0.1']);
    expect(p.sealed).toBe(true);
    // A second machine — here a second loopback address — is not let in automatically…
    expect(await get(p.revokedUrl, bearer(admin.token), '127.0.0.2')).toBe(200);
    expect(p.isTrusted('127.0.0.2')).toBe(false);
    expect(p.pendingSources).toEqual(['127.0.0.2']);
    // …until the administrator approves it (CONTROL: approval is what lets it in).
    p.approve('127.0.0.2');
    expect(p.isTrusted('127.0.0.2')).toBe(true);
    expect(p.pendingSources).toEqual([]);
  });

  it('an OPERATOR’s first contact seals the path and is pending; a station-admin after it is pending too', async () => {
    const p = await fake({ sealOnLoopback: false });
    const operator = await p.issueToken({ user: 'operator' });
    const admin = await p.issueToken({ user: 'admin' });
    expect(await get(p.revokedUrl, bearer(operator.token))).toBe(200);
    expect(p.sealed).toBe(true);
    expect(p.pendingSources).toEqual(['127.0.0.1']);
    // The automatic slot is gone: the station-admin's read does not let this machine in.
    expect(await get(p.revokedUrl, bearer(admin.token))).toBe(200);
    expect(p.isTrusted('127.0.0.1')).toBe(false);
  });

  it('the role is read from the ACCOUNT, not the token: an operator’s token claiming station-admin does not let in', async () => {
    const p = await fake({ sealOnLoopback: false });
    const forged = await p.issueToken({
      user: 'operator',
      roles: ['station-admin', 'operator', 'viewer'],
    });
    expect(await get(p.revokedUrl, bearer(forged.token))).toBe(200);
    expect(p.trustedSources).toEqual([]);
    expect(p.pendingSources).toEqual(['127.0.0.1']);
  });

  it('a request with an Origin (a browser) and a revoked token introduce nothing; a loopback first contact seals by default', async () => {
    const p = await fake({ sealOnLoopback: false });
    const admin = await p.issueToken({ user: 'admin' });
    const revoked = await p.issueToken({ user: 'admin' });
    p.revoke(revoked.jti, Math.floor(Date.now() / 1000) + 3600);
    expect(
      await get(p.revokedUrl, { ...bearer(admin.token), origin: 'http://127.0.0.1:5174' }),
    ).toBe(200);
    expect(await get(p.revokedUrl, bearer(revoked.token))).toBe(200);
    expect(p.sealed).toBe(false);
    expect(p.trustedSources).toEqual([]);
    await p.stop();

    // The real Playout's default: a LOOPBACK bridge seals the automatic path and waits.
    const q = await fake();
    const admin2 = await q.issueToken({ user: 'admin' });
    expect(await get(q.revokedUrl, bearer(admin2.token))).toBe(200);
    expect(q.sealed).toBe(true);
    expect(q.pendingSources).toEqual(['127.0.0.1']);
  });

  it('no expiry: a machine let in stays in, whatever its token does afterwards', async () => {
    const p = await fake({ sealOnLoopback: false });
    const admin = await p.issueToken({ user: 'admin' });
    expect(await get(p.revokedUrl, bearer(admin.token))).toBe(200);
    p.revoke(admin.jti, Math.floor(Date.now() / 1000) + 3600);
    const operator = await p.issueToken({ user: 'operator' });
    expect(await get(p.revokedUrl, bearer(operator.token))).toBe(200);
    expect(p.isTrusted('127.0.0.1')).toBe(true);
  });

  it('the AMCP mock admits exactly the allow list', async () => {
    const p = await fake();
    amcp = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      admit: (ip) => p.isTrusted(ip),
    });
    expect((await probeAmcp('127.0.0.1', amcp.amcpPort, 2000)).kind).toBe('refused');
    p.approve('127.0.0.1');
    expect((await probeAmcp('127.0.0.1', amcp.amcpPort, 2000)).kind).toBe('answered');
  });
});

/**
 * The connection check's probes, real except for the Windows-only readers — and AMCP aimed at the
 * mock's own port (the check addresses the standard 5250).
 */
function checkProbes(): CheckProbes {
  return {
    ...realProbes(),
    processes: async () => [],
    systemProxy: async () => null,
    portHolder: async () => ({ kind: 'free' }),
    localAddresses: () => [],
    resolve: async () => ['10.0.0.1'],
    amcp: (host, _p, t) => realProbes().amcp(host, amcp?.amcpPort ?? 0, t),
  };
}

/** A bridge configured by explicit issuer, on a loopback AMCP mock gated by the fake's list. */
async function gatedBridge(
  options: FakePlayoutOptions,
): Promise<{ p: FakePlayout; bridge: BridgeHandle }> {
  const p = await fake(options);
  amcp = await createMock({
    amcpPort: 0,
    oscPort: 0,
    disableOsc: true,
    admit: (ip) => p.isTrusted(ip),
  });
  handle = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort: amcp.amcpPort, oscPort: 0 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    },
    playout: {
      auth: 'playout',
      issuer: p.issuer,
      jwksUrl: p.jwksUrl,
      tokenUrl: p.tokenUrl,
      refreshUrl: p.refreshUrl,
      revokedUrl: p.revokedUrl,
    },
    connectionCheckOptions: { amcpTrustWindowMs: 1500 },
    connectionCheckProbes: checkProbes(),
  });
  return { p, bridge: handle };
}

describe('C4 — the introducing read is D9, at once, with the station-admin’s own token', () => {
  it('an operator signed in: WAITING; a station-admin signs in: D9 at once with its token, and the link comes up', async () => {
    const { p, bridge } = await gatedBridge({ sealOnLoopback: false });
    const operatorClient = await openClient(bridge);
    const operator = await p.issueToken({ user: 'operator' });
    expect((await operatorClient.authenticate('o1', operator.token)).error).toBeUndefined();
    const health = async (id: string): Promise<ConnectionHealth> =>
      (await operatorClient.ask(id, 'connections.health')).payload as ConnectionHealth;
    await waitFor(() => (amcp?.refusedConnections ?? 0) >= 2, 8000);
    expect((await health('o2')).amcpAwaitsSignIn).toBe(true);

    // The operator's own D9 read already sealed the automatic path — as the real Playout would.
    // (It is the bridge's regular 60 s poll, with the operator as the only bearer.)
    const d9 = (): typeof p.requestLog => p.requestLog.filter((r) => r.path === '/api/cg/revoked');
    // Wait for the Playout's DECISION, not the log line: a request is logged on arrival and
    // judged only after its token verifies.
    await waitFor(() => p.sealed);
    expect(d9()[0]?.headers.authorization).toBe(`Bearer ${operator.token}`);

    const admin = await p.issueToken({ user: 'admin' });
    const before = d9().length;
    const adminClient = await openClient(bridge);
    expect((await adminClient.authenticate('a1', admin.token)).error).toBeUndefined();
    // A D9 read at once — inside the 60 s cycle — carrying THIS admin's token.
    await waitFor(() => d9().length > before, 3000);
    expect(d9()[d9().length - 1]?.headers.authorization).toBe(`Bearer ${admin.token}`);
    expect(d9()[d9().length - 1]?.headers.origin).toBeUndefined();
    expect((await health('o3')).amcpAwaitsSignIn).toBeUndefined();
    // This machine is PENDING (the path was sealed); the administrator approves it…
    await waitFor(() => p.pendingSources.includes('127.0.0.1'));
    expect(p.pendingSources).toEqual(['127.0.0.1']);
    p.approve('127.0.0.1');
    // …and the link comes up.
    const started = Date.now();
    let state = '';
    while (Date.now() - started < 15_000) {
      state = (await health(`h${String(Date.now())}`)).primary.state;
      if (state === 'healthy' || state === 'degraded') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(['healthy', 'degraded']).toContain(state);
  });

  it('on a fresh Playout the station-admin’s D9 lets this machine in with no approval (the automatic slot)', async () => {
    const { p, bridge } = await gatedBridge({ sealOnLoopback: false });
    const admin = await p.issueToken({ user: 'admin' });
    const client = await openClient(bridge);
    expect((await client.authenticate('f1', admin.token)).error).toBeUndefined();
    await waitFor(() => p.isTrusted('127.0.0.1'), 3000);
    expect(p.trustedSources).toEqual(['127.0.0.1']);
    expect(p.pendingSources).toEqual([]);
  });
});

function tmpConfig(): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cg-introduction-')),
    'bridge-playout.json',
  );
}

describe('C5 — before adoption, nothing but a station-admin reaches the Playout', () => {
  it('a refused operator sign-in sends its token to no D4, D8 or D9, and seals nothing; control: the station-admin’s D9 is sent', async () => {
    const p = await fake({ sealOnLoopback: false });
    const configPath = tmpConfig();
    writePlayoutAddress(configPath, p.baseUrl);
    handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      playoutConfigPath: configPath,
    });
    const client = await openClient(handle);
    const operator = await p.issueToken({ user: 'operator', issuer: 'urn:apasai:playout' });
    expectRefusedWith(
      (await client.authenticate('c1', operator.token)).error,
      AUTH_STATION_NOT_SET_UP,
      'an operator before adoption',
    );
    // Drive every reader that could present a bearer, now.
    await handle.playoutAuth?.pollRevokedNow();
    await handle.playoutCatalogue?.refresh();
    const withOperator = p.requestLog.filter(
      (r) => r.headers.authorization === `Bearer ${operator.token}`,
    );
    expect(withOperator).toEqual([]);
    expect(p.sealed).toBe(false);

    // CONTROL — the instrument is live: a station-admin adopts, and its D9 is on the log.
    const admin = await p.issueToken({ user: 'admin', issuer: 'urn:apasai:playout' });
    expect((await client.authenticate('c2', admin.token)).error).toBeUndefined();
    await waitFor(() =>
      p.requestLog.some(
        (r) => r.path === '/api/cg/revoked' && r.headers.authorization === `Bearer ${admin.token}`,
      ),
    );
    // …and its decision (made after the token verifies, so waited for rather than assumed).
    await waitFor(() => p.isTrusted('127.0.0.1'));
    expect(p.trustedSources).toEqual(['127.0.0.1']);
  });
});

describe('C6 — one IPv4 for the HTTP reads and for AMCP', () => {
  it('an IPv4 literal passes through unchanged, with no lookup; an IPv6 literal has no IPv4', async () => {
    expect(await pinnedIPv4('192.0.2.7')).toBe('192.0.2.7');
    expect(await pinnedIPv4('::1')).toBeNull();
  });

  it('a Playout named `localhost` (both families): the D9 read and the AMCP connection come from the same IPv4', async () => {
    // Both servers listen dual-stack, so an IPv6 client WOULD get in — the test sees which it used.
    const p = await fake({ sealOnLoopback: false, listenHost: '::' });
    const port = Number(new URL(p.baseUrl).port);
    const amcpSources: string[] = [];
    const amcpServer = net.createServer((socket) => {
      amcpSources.push((socket.remoteAddress ?? '').replace(/^::ffff:/, ''));
      socket.destroy();
    });
    await new Promise<void>((resolve) => amcpServer.listen(0, '::', resolve));
    closers.push(() => new Promise((resolve) => amcpServer.close(() => resolve())));
    const amcpPort = (amcpServer.address() as net.AddressInfo).port;
    const configPath = tmpConfig();
    writePlayoutAddress(configPath, `http://localhost:${String(port)}`);
    handle = await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: 'localhost', amcpPort, oscPort: 0 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      },
      playoutConfigPath: configPath,
    });
    const client = await openClient(handle);
    const admin = await p.issueToken({ user: 'admin', issuer: 'urn:apasai:playout' });
    expect((await client.authenticate('i1', admin.token)).error).toBeUndefined();
    await waitFor(() => p.requestLog.some((r) => r.path === '/api/cg/revoked'), 4000);
    await waitFor(() => amcpSources.length > 0, 8000);

    const httpSources = new Set(p.requestLog.map((r) => r.source));
    expect([...httpSources]).toEqual(['127.0.0.1']);
    expect(new Set(amcpSources)).toEqual(new Set(['127.0.0.1']));
  });
});

describe('C7 — after the window, the check names the in-app approval and this machine’s IPv4', () => {
  it('pending: the approval sentence; control: once approved, the line passes', async () => {
    // The real default: a loopback bridge's introduction seals the path and waits as PENDING.
    const { p, bridge } = await gatedBridge({});
    const client = await openClient(bridge);
    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('k1', admin.token)).error).toBeUndefined();
    await waitFor(() => p.pendingSources.includes('127.0.0.1'), 3000);
    const amcpLine = async (
      id: string,
    ): Promise<{ status: string; text: string; command?: string }> => {
      const res = (
        await client.ask(id, 'setup.check', {
          playoutAddress: p.baseUrl,
          casparHost: '127.0.0.1',
          origin: 'http://127.0.0.1:5174',
        })
      ).payload as { lines: { id: string; status: string; text: string; command?: string }[] };
      const found = res.lines.find((l) => l.id === 'amcp');
      if (found === undefined) throw new Error('no amcp line');
      return found;
    };
    // Inside the window it still waits — for the Playout, not for the sign-in.
    expect((await amcpLine('k2')).text).toMatch(/waiting for the Playout to let this machine in/);
    await new Promise((r) => setTimeout(r, 1600));
    const pending = await amcpLine('k3');
    expect(pending.status).toBe('fail');
    expect(pending.text).toMatch(
      /^This machine, \d+\.\d+\.\d+\.\d+, is waiting for approval in the Playout, at /,
    );
    expect(pending.text).toContain('If it is not listed there');
    // C7 — no script, ever: the line carries no command.
    expect(pending.command).toBeUndefined();

    // CONTROL — the administrator approves this machine: the same check now passes.
    p.approve('127.0.0.1');
    const approved = await amcpLine('k4');
    expect(approved.status).toBe('pass');
    expect(approved.text).toMatch(/^CasparCG on 127\.0\.0\.1 answered VERSION: /);
  });
});

describe('B1 carried forward — a bridge that does not authenticate never waits for a sign-in', () => {
  it('CONTROL — no amcpAwaitsSignIn', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);
    await new Promise((r) => setTimeout(r, 300));
    const health = (await client.ask('c1', 'connections.health')).payload as ConnectionHealth;
    expect(health.primary.state).not.toBe('healthy');
    expect(health.amcpAwaitsSignIn).toBeUndefined();
  });

  it('B1.4 — every request the bridge sent the Playout carries no Origin; each read carries its bearer', async () => {
    const { p, bridge } = await gatedBridge({ sealOnLoopback: false });
    const client = await openClient(bridge);
    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('p1', admin.token)).error).toBeUndefined();
    await waitFor(
      () =>
        p.requestCounts.channels >= 1 && p.requestCounts.jwks >= 1 && p.requestCounts.revoked >= 1,
      4000,
    );
    const reads = p.requestLog.filter((r) => r.path !== '/.well-known/jwks.json');
    expect(p.requestLog.filter((r) => r.headers.origin !== undefined)).toEqual([]);
    for (const r of reads) expect(r.headers.authorization).toMatch(/^Bearer /);
    expect(new Set(p.requestLog.map((r) => r.source))).toEqual(new Set(['127.0.0.1']));
  });
});
