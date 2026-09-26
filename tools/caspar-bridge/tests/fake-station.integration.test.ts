import dgram from 'node:dgram';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { createBridge, realProbes, type BridgeHandle, type CheckProbes } from '../src/index.js';
import { openClient, waitFor, type Client } from './support/auth-harness.js';
import { startFakePgmFeed } from './support/fake-pgm-feed.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { startFakeStation, type FakeStation } from './support/fake-station.js';
import { FURNITURE, standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A1 — **`pnpm dev:station --fake` IS A WHOLE STATION.** The owner ran
 * it, signed in as the fake admin, and the check's AMCP line ended red on "This machine, 127.0.0.1,
 * is waiting for approval in the Playout…": the fake Playout sealed its automatic path on the
 * loopback first contact (its real-rule default), it has no approve button, and there was no
 * CasparCG behind it at all.
 *
 * These specs drive `startFakeStation` — the function the dev station runs — against a real bridge
 * configured the way first-run leaves one: the Playout's address, CasparCG on the Playout's host at
 * the standard port, both channels declared. Only the check's AMCP probe is aimed at the stand-in's
 * ephemeral port (the check addresses the standard 5250, which a suite must not bind).
 */

let handle: BridgeHandle | null = null;
let station: FakeStation | null = null;
let playout: FakePlayout | null = null;
let mock: MockHandle | null = null;
const traces: string[] = [];

afterEach(async () => {
  await handle?.close();
  await station?.stop();
  await playout?.stop();
  await mock?.stop();
  handle = null;
  station = null;
  playout = null;
  mock = null;
  for (const trace of traces.splice(0)) if (fs.existsSync(trace)) fs.rmSync(trace);
});

const MODULES = { startFakePlayout, createMock, startFakePgmFeed };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
  });
}

function tracePath(): string {
  const file = path.join(
    os.tmpdir(),
    `cg-fake-station-${String(process.pid)}-${String(Date.now())}-${String(traces.length)}.ndjson`,
  );
  traces.push(file);
  return file;
}

/** The check's probes, real — except AMCP, aimed at the stand-in's own port (see the header). */
function probesAimedAt(amcpPort: () => number): CheckProbes {
  return {
    ...realProbes(),
    processes: async () => [],
    systemProxy: async () => null,
    portHolder: async () => ({ kind: 'free' }),
    amcp: (host, _port, timeoutMs) => realProbes().amcp(host, amcpPort(), timeoutMs),
  };
}

/** A bridge as first-run leaves it: this Playout, CasparCG on its host, both channels declared. */
async function stationBridge(
  p: FakePlayout,
  amcpPort: number,
  oscPort: number,
): Promise<BridgeHandle> {
  handle = await createBridge({
    port: 0,
    connection: {
      servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
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
    fixedLayers: [standardBank(1), standardBank(2)],
    connectionCheckProbes: probesAimedAt(() => amcpPort),
  });
  return handle;
}

async function amcpLine(
  client: Client,
  id: string,
  p: FakePlayout,
): Promise<{ status: string; text: string }> {
  const res = (
    await client.ask(id, 'setup.check', {
      playoutAddress: p.baseUrl,
      origin: 'http://127.0.0.1:5174',
    })
  ).payload as { lines: { id: string; status: string; text: string }[] };
  const line = res.lines.find((l) => l.id === 'amcp');
  if (line === undefined) throw new Error('the check carries no AMCP line');
  return line;
}

async function linkUp(client: Client): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const health = (await client.ask(`h-${String(Date.now())}`, 'connections.health'))
      .payload as ConnectionHealth;
    if (health.primary.state === 'healthy' || health.primary.state === 'degraded') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the bridge never reached the stand-in');
}

/** Every AMCP line CasparCG's stand-in received, in order. */
async function received(file: string, caspar: MockHandle): Promise<string[]> {
  await caspar.traceFlush();
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

/** A write that addresses `channel` — `CLEAR 2-99`, `MIXER 2-60 VOLUME 1`, `CG 2-99 PLAY 0`… */
const addresses = (line: string, channel: number): boolean =>
  new RegExp(`^[A-Z][A-Z ]*? ${String(channel)}(-\\d+)?(\\s|$)`).test(line);

describe('A1 — `--fake` is a whole station', () => {
  it('after the station-admin signs in the AMCP line is ✓, and a take on channel 1 reaches CasparCG on channel 1 only', async () => {
    const oscPort = await freeUdpPort();
    const trace = tracePath();
    station = await startFakeStation(
      MODULES,
      { amcp: 0, osc: oscPort, pgm: [0, 0] },
      {
        tracePath: trace,
      },
    );
    const p = station.playout;
    const caspar = station.caspar;
    const bridge = await stationBridge(p, caspar.amcpPort, oscPort);
    const client = await openClient(bridge);

    // Before the sign-in the stand-in refuses this machine, as the Playout's firewall would: the
    // bridge's own AMCP connection is turned away.
    await waitFor(() => caspar.refusedConnections >= 1, 8000);
    expect(p.isTrusted('127.0.0.1')).toBe(false);

    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('a1', admin.token)).error).toBeUndefined();
    // The station-admin's D9 read lets this machine in — no approval, nothing pending.
    await waitFor(() => p.isTrusted('127.0.0.1'), 3000);
    expect(p.pendingSources).toEqual([]);
    const line = await amcpLine(client, 'c1', p);
    expect(line.status, line.text).toBe('pass');
    expect(line.text).toMatch(/^CasparCG on 127\.0\.0\.1 answered VERSION: /);

    // The bridge's own link comes up, and a take on channel 1 reaches channel 1 alone.
    await linkUp(client);
    const rt = bridge.runtime;
    rt.templateImport(FURNITURE, HTML);
    const before = (await received(trace, caspar)).length;
    expect(await rt.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {})).toEqual({
      accepted: true,
    });
    expect((await rt.take('logo-1')).accepted).toBe(true);
    await waitFor(() => fs.readFileSync(trace, 'utf8').includes('CG 1-99 PLAY 0'), 5000);
    const after = (await received(trace, caspar)).slice(before);
    expect(after.some((l) => l.startsWith('CG 1-99 PLAY'))).toBe(true);
    expect(after.filter((l) => addresses(l, 2))).toEqual([]);
  });

  it('CONTROL — the fake Playout at its default seals a loopback first contact: the same sign-in leaves this machine PENDING', async () => {
    const oscPort = await freeUdpPort();
    playout = await startFakePlayout();
    const p = playout;
    mock = await createMock({
      host: '127.0.0.1',
      amcpPort: 0,
      oscHost: '127.0.0.1',
      oscPort,
      channels: 2,
      admit: (ip) => p.isTrusted(ip),
    });
    const bridge = await stationBridge(p, mock.amcpPort, oscPort);
    const client = await openClient(bridge);
    const admin = await p.issueToken({ user: 'admin' });
    expect((await client.authenticate('a1', admin.token)).error).toBeUndefined();
    await waitFor(() => p.pendingSources.includes('127.0.0.1'), 3000);
    expect(p.isTrusted('127.0.0.1')).toBe(false);
    expect((await amcpLine(client, 'c1', p)).status).not.toBe('pass');
  });

  it('a programme feed whose port is taken is SAID in one line, and the station runs without it', async () => {
    const taken = net.createServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    const address = taken.address();
    const takenPort = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      station = await startFakeStation(MODULES, {
        amcp: 0,
        osc: await freeUdpPort(),
        pgm: [0, takenPort],
      });
      expect(station.feeds).toHaveLength(1);
      expect(station.notes).toHaveLength(1);
      expect(station.notes[0]).toMatch(/^Channel 2's programme feed did not start \(port \d+/);
    } finally {
      await new Promise<void>((resolve) => taken.close(() => resolve()));
    }
  });
});
