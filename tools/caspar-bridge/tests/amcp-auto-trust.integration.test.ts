import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionCheckLine, ConnectionHealth } from '@cg/shared-ipc';
import {
  createBridge,
  probeAmcp,
  realProbes,
  runConnectionCheck,
  type BridgeHandle,
  type CheckProbes,
} from '../src/index.js';
import { deadConnection, openClient, waitFor } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `DESKTOP-APPS-01-B` — **PLAYOUT 2.8.54: AMCP OPENS ON A STATION-ADMIN'S SERVER-SIDE READ.**
 *
 *   B3 — the fake Playout trusts exactly what 2.8.54 trusts, and its fake AMCP refuses the rest;
 *   B1 — the bridge waits (never an alarm) until a station-admin signs in, then reads D4 at once
 *        with THAT admin's token, and the link comes up;
 *   B1.4 — every request it sends the Playout carries no `Origin`, and does carry its bearer.
 *
 * Everything is on loopback: the fake Playout, the AMCP mock, the bridge. The source address the
 * Playout trusts is therefore `127.0.0.1`, which is what the mock's admission rule reads.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;
let amcp: MockHandle | null = null;

afterEach(async () => {
  await handle?.close();
  await playout?.stop();
  await amcp?.stop();
  handle = null;
  playout = null;
  amcp = null;
});

/** A raw GET, so a test can send exactly the headers it means to — an `Origin` included. */
function get(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('B3 — the fake Playout trusts what 2.8.54 trusts, and nothing else', () => {
  it('an operator token, a browser request, a revoked token and auto-trust OFF trust nothing; a station-admin server-side read does', async () => {
    playout = await startFakePlayout();
    const fake = playout;
    amcp = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      admit: (ip) => fake.isTrusted(ip),
    });
    const version = (): Promise<string> =>
      probeAmcp('127.0.0.1', amcp?.amcpPort ?? 0, 2000).then((o) => o.kind);

    // Untrusted, the mock's AMCP refuses this machine.
    expect(await version()).toBe('refused');

    const operator = await fake.issueToken({ user: 'operator' });
    const admin = await fake.issueToken({ user: 'admin' });
    const revoked = await fake.issueToken({ user: 'admin' });
    fake.revoke(revoked.jti, Math.floor(Date.now() / 1000) + 3600);

    // An operator's server-side read — a valid token, the wrong role.
    expect(await get(fake.channelsUrl, { authorization: `Bearer ${operator.token}` })).toBe(200);
    // A station-admin's token from a BROWSER — it carries an Origin.
    expect(
      await get(fake.channelsUrl, {
        authorization: `Bearer ${admin.token}`,
        origin: 'http://127.0.0.1:5174',
      }),
    ).toBe(200);
    // A station-admin token that has been revoked (D9's own list).
    expect(await get(fake.revokedUrl, { authorization: `Bearer ${revoked.token}` })).toBe(200);
    // Auto-trust turned off by the Playout's administrator.
    fake.setAutoTrust(false);
    expect(await get(fake.channelsUrl, { authorization: `Bearer ${admin.token}` })).toBe(200);
    // Every one of those reached the Playout and was answered — and trusted nothing.
    expect(fake.trustedSources).toEqual([]);
    expect(await version()).toBe('refused');

    // CONTROL — the same admin token, server-side, with auto-trust on: this machine is trusted…
    fake.setAutoTrust(true);
    expect(await get(fake.channelsUrl, { authorization: `Bearer ${admin.token}` })).toBe(200);
    expect(fake.trustedSources).toEqual(['127.0.0.1']);
    // …and AMCP answers it.
    expect(await version()).toBe('answered');
  });

  it('D9 is a door too: a station-admin server-side revocation read trusts the source', async () => {
    playout = await startFakePlayout();
    const admin = await playout.issueToken({ user: 'admin' });
    expect(playout.isTrusted('127.0.0.1')).toBe(false);
    expect(await get(playout.revokedUrl, { authorization: `Bearer ${admin.token}` })).toBe(200);
    expect(playout.isTrusted('127.0.0.1')).toBe(true);
  });
});

describe('B2 — the check’s AMCP line against the fake Playout and the fake AMCP', () => {
  it('waiting before any station-admin sign-in; not trusted when auto-trust is off; OK once a station-admin read trusts this machine', async () => {
    playout = await startFakePlayout();
    const fake = playout;
    amcp = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      admit: (ip) => fake.isTrusted(ip),
    });
    const port = amcp.amcpPort;
    const probes: CheckProbes = {
      ...realProbes(),
      processes: async () => [],
      systemProxy: async () => null,
      portHolder: async () => ({ kind: 'free' }),
      localAddresses: () => [],
      resolve: async (host) => [host],
      // The mock stands on its own port; the check addresses the standard one.
      amcp: (host, _p, t) => realProbes().amcp(host, port, t),
    };
    const amcpLine = async (judged: boolean): Promise<ConnectionCheckLine> => {
      const { lines } = await runConnectionCheck(
        { playoutAddress: fake.baseUrl, origin: 'http://127.0.0.1:5174' },
        probes,
        {
          ports: { console: 5174, control: 5280, templates: 7911, osc: 6250 },
          amcpJudged: judged,
          amcpTrustWindowMs: 900,
          amcpRetryMs: 300,
        },
      );
      const found = lines.find((l) => l.id === 'amcp');
      if (found === undefined) throw new Error('no amcp line');
      return found;
    };
    const admin = await fake.issueToken({ user: 'admin' });

    // 1 · before any station-admin sign-in: WAITING, neutral.
    expect(await amcpLine(false)).toEqual({
      id: 'amcp',
      status: 'wait',
      text: 'CasparCG on 127.0.0.1: waiting for sign-in.',
    });

    // 2 · a station-admin signed in, but the Playout's auto-trust is OFF: judged, not trusted.
    fake.setAutoTrust(false);
    expect(await get(fake.channelsUrl, { authorization: `Bearer ${admin.token}` })).toBe(200);
    const refused = await amcpLine(true);
    expect(refused.status).toBe('fail');
    expect(refused.text).toMatch(
      /^The Playout did not trust this machine: 127\.0\.0\.1 still refuses/,
    );
    expect(refused.command).toMatch(/^\.\\secure-ports\.ps1 -AllowAmcpFrom /);
    expect(amcp.refusedConnections).toBeGreaterThanOrEqual(2); // the check really asked, repeatedly

    // 3 · CONTROL — auto-trust on, the same station-admin read: the line passes.
    fake.setAutoTrust(true);
    expect(await get(fake.channelsUrl, { authorization: `Bearer ${admin.token}` })).toBe(200);
    const ok = await amcpLine(true);
    expect(ok.status).toBe('pass');
    expect(ok.text).toMatch(/^CasparCG on 127\.0\.0\.1 answered VERSION: /);
  });
});

async function trustGatedBridge(): Promise<{ fake: FakePlayout; mock: MockHandle }> {
  playout = await startFakePlayout();
  const fake = playout;
  amcp = await createMock({
    amcpPort: 0,
    oscPort: 0,
    disableOsc: true,
    admit: (ip) => fake.isTrusted(ip),
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
      issuer: fake.issuer,
      jwksUrl: fake.jwksUrl,
      tokenUrl: fake.tokenUrl,
      refreshUrl: fake.refreshUrl,
      revokedUrl: fake.revokedUrl,
    },
  });
  return { fake, mock: amcp };
}

describe('B1 — the bridge waits for a station-admin, then AMCP comes up', () => {
  it('an operator signed in: still WAITING, and AMCP still refused; a station-admin signs in: one D4 read at once with that token, and the link comes up', async () => {
    const { fake, mock } = await trustGatedBridge();
    const bridge = handle as BridgeHandle;

    const operatorClient = await openClient(bridge);
    const operator = await fake.issueToken({ user: 'operator' });
    expect((await operatorClient.authenticate('o1', operator.token)).error).toBeUndefined();
    const health = async (id: string): Promise<ConnectionHealth> =>
      (await operatorClient.ask(id, 'connections.health')).payload as ConnectionHealth;

    // The operator's sign-in read D4 with the operator's token (the catalogue's usual read)…
    await waitFor(() => fake.requestCounts.channels >= 1);
    // …the bridge keeps dialing and is refused (the instrument is live)…
    await waitFor(() => mock.refusedConnections >= 2, 8000);
    // …and all that is WAITING, not an alarm, because no station-admin has signed in.
    const waiting = await health('o2');
    expect(waiting.amcpAwaitsSignIn).toBe(true);
    expect(waiting.primary.state).not.toBe('healthy');
    expect(fake.trustedSources).toEqual([]);

    // A station-admin signs in — within the 30 s floor of the operator's D4 read.
    const readsBefore = fake.requestCounts.channels;
    const admin = await fake.issueToken({ user: 'admin' });
    const adminClient = await openClient(bridge);
    expect((await adminClient.authenticate('a1', admin.token)).error).toBeUndefined();

    // B1.2 — one D4 read at once, carrying THIS admin's token, although the floor had not passed.
    await waitFor(() => fake.requestCounts.channels > readsBefore, 3000);
    const d4 = fake.requestLog.filter((r) => r.path === '/api/cg/channels');
    expect(d4[d4.length - 1]?.headers.authorization).toBe(`Bearer ${admin.token}`);
    expect(fake.trustedSources).toEqual(['127.0.0.1']);
    // The waiting fact is gone at once: from here a failure would be judged as one.
    expect((await health('o3')).amcpAwaitsSignIn).toBeUndefined();

    // B1.3 — the link comes up, well inside the window.
    const started = Date.now();
    let state = '';
    while (Date.now() - started < 15_000) {
      state = (await health(`h${String(Date.now())}`)).primary.state;
      if (state === 'healthy' || state === 'degraded') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(['healthy', 'degraded']).toContain(state);
  });

  it('B1.4 — every request the bridge sent the Playout carries no Origin; each read carries its bearer', async () => {
    const { fake } = await trustGatedBridge();
    const client = await openClient(handle as BridgeHandle);
    const admin = await fake.issueToken({ user: 'admin' });
    expect((await client.authenticate('p1', admin.token)).error).toBeUndefined();
    await waitFor(() => fake.requestCounts.channels >= 1 && fake.requestCounts.jwks >= 1, 4000);
    await handle?.playoutAuth?.pollRevokedNow();

    const byPath = (p: string): typeof fake.requestLog =>
      fake.requestLog.filter((r) => r.path === p);
    // The instrument saw all three reads — the key set, the catalogue and the revocation list.
    expect(byPath('/.well-known/jwks.json').length).toBeGreaterThanOrEqual(1);
    expect(byPath('/api/cg/channels').length).toBeGreaterThanOrEqual(1);
    expect(byPath('/api/cg/revoked').length).toBeGreaterThanOrEqual(1);
    // The absence: no request from the bridge carried an Origin…
    expect(fake.requestLog.filter((r) => r.headers.origin !== undefined)).toEqual([]);
    // …and its control, on the SAME capture: the header the bridge does send is there.
    for (const read of [...byPath('/api/cg/channels'), ...byPath('/api/cg/revoked')]) {
      expect(read.headers.authorization).toMatch(/^Bearer /);
    }
    // Straight from this machine: no proxy put itself in the path.
    expect(new Set(fake.requestLog.map((r) => r.source))).toEqual(new Set(['127.0.0.1']));
    expect(fake.requestLog.filter((r) => r.headers.via !== undefined)).toEqual([]);
  });

  it('CONTROL — a bridge that does not authenticate never says it is waiting for a sign-in', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);
    await new Promise((r) => setTimeout(r, 300));
    const health = (await client.ask('c1', 'connections.health')).payload as ConnectionHealth;
    // The link is down (the positive half)…
    expect(health.primary.state).not.toBe('healthy');
    // …and nothing claims it is waiting for anybody.
    expect(health.amcpAwaitsSignIn).toBeUndefined();
  });
});
