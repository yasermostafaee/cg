import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  parseWsFrame,
  serializeWsFrame,
  type PgmReturnState,
  type PgmReturnStatus,
  type WsFrame,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { ConsoleHttpServer, isLoopbackPeer } from '../src/console-http-server.js';
import {
  MjpegPartParser,
  PgmProtocolError,
  PgmReturnRelay,
  pgmPort,
  type PgmParseEvent,
  type PgmReturnTuning,
  type PgmViewer,
} from '../src/pgm-return.js';
import {
  FRAME_A,
  FRAME_B,
  PGM_FEED_HEAD,
  jpegWithComment,
  pgmFeedPart,
  startFakePgmFeed,
  type FakePgmFeed,
} from './support/fake-pgm-feed.js';

/**
 * 🔴 `C-016` / `PGM-RETURN-01` §2 — **THE PROGRAMME RETURN, against a fake that reproduces the
 * Playout team's feed byte for byte.** Nothing here connects to a real Playout.
 *
 * Every ABSENCE asserted below has its POSITIVE CONTROL beside it, because "nothing happened" is
 * void until the instrument is proven able to see the thing happen: a fake that never records a
 * connection would pass "no connection while hidden" forever.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

let feeds: FakePgmFeed[] = [];
let relays: PgmReturnRelay[] = [];
let servers: ConsoleHttpServer[] = [];
let consoleDirs: string[] = [];
let bridges: BridgeHandle[] = [];
let sockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of sockets) ws.close();
  sockets = [];
  for (const bridge of bridges) await bridge.close();
  bridges = [];
  for (const relay of relays) relay.dispose();
  relays = [];
  for (const server of servers) await server.stop();
  servers = [];
  for (const feed of feeds) await feed.stop();
  feeds = [];
  for (const dir of consoleDirs) fs.rmSync(dir, { recursive: true, force: true });
  consoleDirs = [];
});

async function feed(options: Parameters<typeof startFakePgmFeed>[0] = {}): Promise<FakePgmFeed> {
  const f = await startFakePgmFeed(options);
  feeds.push(f);
  return f;
}

function relayOn(
  port: number | ((channel: number) => number),
  tuning: Partial<PgmReturnTuning> = {},
  log: string[] = [],
): PgmReturnRelay {
  const relay = new PgmReturnRelay({
    resolveTarget: () => Promise.resolve({ address: '127.0.0.1', hostHeader: 'playout.test' }),
    portFor: typeof port === 'number' ? () => port : port,
    tuning,
    log: (line) => log.push(line),
  });
  relays.push(relay);
  return relay;
}

/** A viewer that keeps every frame it is sent. */
function collector(): PgmViewer & { frames: Buffer[]; closed: boolean } {
  const viewer = {
    frames: [] as Buffer[],
    closed: false,
    send(jpeg: Buffer) {
      viewer.frames.push(jpeg);
    },
    close() {
      viewer.closed = true;
    },
  };
  return viewer;
}

async function waitFor(pred: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline)
      throw new Error(`timed out after ${String(ms)} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function stateOf(relay: PgmReturnRelay, channel: number): PgmReturnState | undefined {
  return relay.status().find((s) => s.channel === channel)?.state;
}

// ── The port rule ──────────────────────────────────────────────────────────────

describe('pgmPort — the one port rule', () => {
  it('never addresses a preview port, for every programme channel 1..20', () => {
    // Control first: the rule is the Playout's, measured on their plant (`[2|:9251]`).
    expect(pgmPort(2)).toBe(9251);
    expect(pgmPort(1)).toBe(9250);
    for (let n = 1; n <= 20; n++) {
      const port = pgmPort(n);
      expect(port >= 9350 && port <= 9369, `channel ${String(n)} → ${String(port)}`).toBe(false);
    }
  });

  /**
   * "The port comes from ONE function … the only place the number is written." A second copy is
   * how a preview port gets typed by hand, so the source trees that could address the feed are
   * swept for any 925x/935x literal, and only `pgmPort`'s own body may carry one.
   */
  it('is the only place a feed port number is written in the product source', () => {
    const repo = path.resolve(here, '../../..');
    const roots = ['tools/caspar-bridge/src', 'apps/runtime/src', 'packages/shared-ipc/src'];
    const hits: { where: string; text: string }[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
          scanned++;
          fs.readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (!/\b9[23]5\d\b/.test(line)) return;
              const where = `${path.relative(repo, full).replace(/\\/g, '/')}:${String(i + 1)}`;
              hits.push({ where, text: line.trim() });
            });
        }
      }
    };
    for (const root of roots) walk(path.join(repo, root));
    // The positive control: the scan read files, and it finds the one rule.
    expect(scanned).toBeGreaterThan(100);
    const isRule = (h: { text: string }): boolean => h.text === 'return 9250 + channel - 1;';
    expect(hits.filter(isRule), 'pgmPort itself').toHaveLength(1);
    // Every other hit must be a comment line, never code.
    const code = hits
      .filter((h) => !isRule(h) && !/^(\*|\/\/|\/\*)/.test(h.text))
      .map((h) => `${h.where}: ${h.text}`);
    expect(code).toEqual([]);
  });
});

// ── The part parser ────────────────────────────────────────────────────────────

describe('MjpegPartParser — framing by Content-Length', () => {
  const stream = (frames: readonly Buffer[]): Buffer =>
    Buffer.concat([Buffer.from(PGM_FEED_HEAD, 'latin1'), ...frames.map(pgmFeedPart)]);

  const framesOf = (events: readonly PgmParseEvent[]): Buffer[] =>
    events.flatMap((e) => (e.kind === 'frame' ? [e.jpeg] : []));

  it('reads the Playout’s head and parts, in one chunk or one byte at a time', () => {
    const bytes = stream([FRAME_A, FRAME_B, FRAME_A]);
    const whole = new MjpegPartParser().push(bytes);
    expect(whole[0]).toEqual({ kind: 'head', status: 200, boundary: 'apasaipgm' });
    expect(framesOf(whole)).toEqual([FRAME_A, FRAME_B, FRAME_A]);

    const parser = new MjpegPartParser();
    const trickled: PgmParseEvent[] = [];
    for (let i = 0; i < bytes.length; i++) trickled.push(...parser.push(bytes.subarray(i, i + 1)));
    expect(framesOf(trickled)).toEqual([FRAME_A, FRAME_B, FRAME_A]);
  });

  it('delivers a JPEG whose data contains the boundary text WHOLE', () => {
    // A valid JPEG with the feed's own boundary — twice, once as a full line — inside its data.
    const planted = jpegWithComment(
      FRAME_B,
      Buffer.from('x--apasaipgm\r\n--apasaipgm\r\nContent-Length: 3\r\n\r\nabc\r\n', 'latin1'),
    );
    expect(planted.includes('--apasaipgm')).toBe(true);
    const events = new MjpegPartParser().push(stream([FRAME_A, planted, FRAME_A]));
    // The control is the ordinary frames either side: all three arrive whole and in order.
    expect(framesOf(events)).toEqual([FRAME_A, planted, FRAME_A]);
  });

  it('refuses a feed that is not the feed, and bounds what it holds', () => {
    expect(() => new MjpegPartParser().push(Buffer.from('HTTP/1.0 404 Not Found\r\n\r\n'))).toThrow(
      PgmProtocolError,
    );
    expect(() =>
      new MjpegPartParser().push(Buffer.from('HTTP/1.0 200 OK\r\nContent-Type: text/html\r\n\r\n')),
    ).toThrow(PgmProtocolError);
    // A part with no Content-Length is refused — the body is never scanned for a boundary.
    expect(() =>
      new MjpegPartParser().push(
        Buffer.concat([
          Buffer.from(PGM_FEED_HEAD),
          Buffer.from('--apasaipgm\r\nContent-Type: image/jpeg\r\n\r\nxyz'),
        ]),
      ),
    ).toThrow(/Content-Length/);
    // A head that never ends is not buffered without limit.
    expect(() => new MjpegPartParser().push(Buffer.alloc(9000, 0x41))).toThrow(PgmProtocolError);
    expect(() =>
      new MjpegPartParser().push(
        Buffer.concat([
          Buffer.from(PGM_FEED_HEAD),
          Buffer.from('--apasaipgm\r\nContent-Length: 99999999\r\n\r\n'),
        ]),
      ),
    ).toThrow(/larger than any real frame/);
  });
});

// ── The relay, against the fake feed ─────────────────────────────────────────────

describe('the relay — a well-behaved client', () => {
  it('sends exactly the one request, and nothing after it', async () => {
    const f = await feed();
    const relay = relayOn(f.port);
    const viewer = collector();
    relay.attach(1, viewer);

    // The positive control: the fake DID receive a request, and frames flowed after it.
    await waitFor(() => f.connections[0]?.requestAt != null, 3000, 'the request');
    await waitFor(() => viewer.frames.length >= 10, 3000, 'ten frames');
    const exact = 'GET / HTTP/1.1\r\nHost: playout.test\r\n\r\n';
    expect(f.connections[0]?.received.toString('latin1')).toBe(exact);

    // …and nothing more was written, however long the connection stays up.
    await new Promise((r) => setTimeout(r, 600));
    expect(viewer.frames.length).toBeGreaterThan(20);
    expect(f.connections).toHaveLength(1);
    expect(f.connections[0]?.received.toString('latin1')).toBe(exact);
  });

  it('pulls nothing while nobody watches, connects when watched, and closes within 2 s of the last viewer', async () => {
    const f = await feed();
    const relay = relayOn(f.port); // the PRODUCT linger (1.5 s)
    await new Promise((r) => setTimeout(r, 400));
    expect(f.connections, 'nothing is watched, so nothing is pulled').toHaveLength(0);

    const viewer = collector();
    const detach = relay.attach(1, viewer);
    await waitFor(() => viewer.frames.length > 0, 3000, 'a frame');
    expect(f.openCount(), 'the positive control: watching connects').toBe(1);

    const hiddenAt = Date.now();
    detach();
    await waitFor(() => f.connections[0]?.closedAt != null, 4000, 'the close');
    const closedAfter = (f.connections[0]?.closedAt ?? 0) - hiddenAt;
    expect(closedAfter).toBeLessThan(2000);
    expect(f.openCount()).toBe(0);
    expect(relay.status()).toEqual([]);
  });

  it('shares ONE upstream between two viewers of a channel; two channels get two', async () => {
    const f = await feed();
    const relay = relayOn(f.port);
    const first = collector();
    const second = collector();
    relay.attach(1, first);
    relay.attach(1, second);
    await waitFor(() => first.frames.length >= 5 && second.frames.length >= 5, 3000, 'frames');
    expect(f.connections).toHaveLength(1);
    // Both viewers are fed from that one connection, the same frames.
    expect(second.frames.slice(-3)).toEqual(first.frames.slice(-3));

    // The positive control: a DIFFERENT channel is a second upstream.
    const other = collector();
    relay.attach(2, other);
    await waitFor(() => other.frames.length > 0, 3000, 'channel 2 frames');
    expect(f.connections).toHaveLength(2);
    expect(f.openCount()).toBe(2);
  });

  it('reports a stall, and clears it when frames resume', async () => {
    const f = await feed();
    const relay = relayOn(f.port, { stallMs: 300, checkEveryMs: 50 });
    const states: string[] = [];
    relay.subscribe((list) => states.push(list.map((s) => s.state).join(',')));
    relay.attach(1, collector());
    await waitFor(() => stateOf(relay, 1) === 'live', 3000, 'live');

    f.pause();
    await waitFor(() => stateOf(relay, 1) === 'stalled', 3000, 'stalled');
    // Still ONE connection: a stall is not a reconnect.
    expect(f.connections).toHaveLength(1);

    f.resume();
    await waitFor(() => stateOf(relay, 1) === 'live', 3000, 'live again');
    expect(states).toContain('stalled');
  });

  it('closes a SILENT connection and dials again — no idle connection is kept', async () => {
    const f = await feed();
    const relay = relayOn(f.port, {
      stallMs: 200,
      deadMs: 500,
      checkEveryMs: 50,
      backoffBaseMs: 100,
    });
    relay.attach(1, collector());
    await waitFor(() => stateOf(relay, 1) === 'live', 3000, 'live');
    f.pause();
    await waitFor(() => f.connections[0]?.closedAt != null, 3000, 'the silent connection closed');
    await waitFor(() => f.connections.length === 2, 3000, 'a redial');
    // At most one upstream at a time, through the redial.
    expect(f.openCount()).toBeLessThanOrEqual(1);
  });

  it('reconnects after a close with a GROWING backoff, never a tight loop', async () => {
    const f = await feed();
    f.closeOnAccept(true);
    const relay = relayOn(f.port, { backoffBaseMs: 100, backoffMaxMs: 800 });
    relay.attach(1, collector());
    await waitFor(() => f.connections.length >= 6, 6000, 'six attempts');
    const at = f.connections.map((c) => c.openedAt);
    const gaps = at.slice(1).map((t, i) => t - (at[i] as number));
    // 100, 200, 400, 800, 800 — measured, with scheduling slack.
    expect(gaps[0]).toBeGreaterThanOrEqual(90);
    for (let i = 1; i <= 3; i++) {
      expect(gaps[i], `gap ${String(i)} grows (${gaps.join(', ')})`).toBeGreaterThan(
        (gaps[i - 1] as number) * 1.5,
      );
    }
    expect(gaps[4]).toBeGreaterThanOrEqual(720);
    expect(gaps[4]).toBeLessThan(1200);
    expect(stateOf(relay, 1)).toBe('connecting');

    // The positive control: when the feed accepts again, the relay goes live.
    f.closeOnAccept(false);
    await waitFor(() => stateOf(relay, 1) === 'live', 3000, 'live after the outage');
  });

  it('reconnects after a core restart closes a live connection', async () => {
    const f = await feed();
    const relay = relayOn(f.port, { backoffBaseMs: 100 });
    const viewer = collector();
    relay.attach(1, viewer);
    await waitFor(() => stateOf(relay, 1) === 'live', 3000, 'live');
    f.closeAll();
    await waitFor(() => f.connections.length === 2, 3000, 'the reconnect');
    const before = viewer.frames.length;
    await waitFor(() => viewer.frames.length > before + 3, 3000, 'frames on the new connection');
  });

  it('does not dial a channel outside the firewall rule, and says why in the log', async () => {
    const f = await feed();
    const log: string[] = [];
    const relay = relayOn(f.port, {}, log);
    relay.attach(21, collector());
    await new Promise((r) => setTimeout(r, 400));
    expect(stateOf(relay, 21)).toBe('unavailable');
    expect(f.connections).toHaveLength(0);
    expect(log.join('\n')).toMatch(/port 9270 is outside .*9250-9269/);

    // The positive control: channel 20, the last in the rule, IS dialled.
    relay.attach(20, collector());
    await waitFor(() => f.connections.length === 1, 3000, 'channel 20 dialled');
  });

  it('dials the RULE port by default — channel 2 on 9251', async () => {
    const f = await feed({ port: pgmPort(2) });
    const relay = new PgmReturnRelay({
      resolveTarget: () => Promise.resolve({ address: '127.0.0.1', hostHeader: '127.0.0.1' }),
      log: () => undefined,
    });
    relays.push(relay);
    const viewer = collector();
    relay.attach(2, viewer);
    await waitFor(() => viewer.frames.length > 0, 3000, 'channel 2 through 9251');
    expect(f.port).toBe(9251);
    expect(f.connections).toHaveLength(1);
  });
});

// ── The route on the console origin ─────────────────────────────────────────────

async function consoleWith(relay: PgmReturnRelay, host = '127.0.0.1'): Promise<ConsoleHttpServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pgm-console-'));
  consoleDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>console</title>');
  const server = new ConsoleHttpServer();
  await server.start({ dir, port: 0, host, pgmRelay: relay });
  servers.push(server);
  return server;
}

/** GET a URL and resolve with the status, headers and the socket, reading nothing further. */
function open(
  url: string,
  localAddress?: string,
): Promise<{ status: number; type: string; res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { ...(localAddress ? { localAddress } : {}), agent: false }, (res) =>
      resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), res, req }),
    );
    req.on('error', reject);
  });
}

describe('the relay route — same-origin, loopback only, bytes untouched', () => {
  it('relays every JPEG byte for byte in a multipart stream', async () => {
    const planted = jpegWithComment(FRAME_B, Buffer.from('--apasaipgm\r\n', 'latin1'));
    const f = await feed({ frames: [FRAME_A, planted] });
    const server = await consoleWith(relayOn(f.port));
    const { status, type, res, req } = await open(`${server.url}/pgm/1`);
    expect(status).toBe(200);
    expect(type).toMatch(/^multipart\/x-mixed-replace; boundary=cgpgm[0-9a-f]{24}$/);
    // Parse the relay's own stream with the same Content-Length reader.
    const parser = new MjpegPartParser();
    parser.push(Buffer.from(`HTTP/1.0 200 OK\r\nContent-Type: ${type}\r\n\r\n`, 'latin1'));
    const frames: Buffer[] = [];
    await new Promise<void>((resolve) => {
      res.on('data', (chunk: Buffer) => {
        for (const e of parser.push(chunk)) if (e.kind === 'frame') frames.push(e.jpeg);
        if (frames.length >= 4) resolve();
      });
    });
    req.destroy();
    expect(frames.every((fr) => fr.equals(FRAME_A) || fr.equals(planted))).toBe(true);
    expect(frames.some((fr) => fr.equals(planted))).toBe(true);
  });

  it('refuses a client that is not on this machine; serves one that is', async () => {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a !== undefined && a.family === 'IPv4' && !a.internal)?.address;
    expect(lan, 'this machine has a non-loopback IPv4 to test from').toBeDefined();
    const f = await feed();
    // Bound on every interface, so the ONLY fence left is the route's own peer check.
    const server = await consoleWith(relayOn(f.port), '0.0.0.0');
    const port = server.port;

    const outside = await open(`http://${lan as string}:${String(port)}/pgm/1`, lan);
    outside.req.destroy();
    expect(outside.status).toBe(403);
    await new Promise((r) => setTimeout(r, 300));
    expect(f.connections, 'a refused client attached nothing').toHaveLength(0);

    // The positive control: loopback is served, and it does attach.
    const inside = await open(`http://127.0.0.1:${String(port)}/pgm/1`);
    expect(inside.status).toBe(200);
    await waitFor(() => f.connections.length === 1, 3000, 'the loopback viewer’s upstream');
    inside.req.destroy();
  });

  it('knows loopback when it sees it', () => {
    expect(isLoopbackPeer('127.0.0.1')).toBe(true);
    expect(isLoopbackPeer('127.4.5.6')).toBe(true);
    expect(isLoopbackPeer('::1')).toBe(true);
    expect(isLoopbackPeer('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackPeer('192.168.21.111')).toBe(false);
    expect(isLoopbackPeer('::ffff:192.168.21.111')).toBe(false);
    expect(isLoopbackPeer('1127.0.0.1')).toBe(false);
    expect(isLoopbackPeer(undefined)).toBe(false);
  });

  it('through createBridge: the state reaches a console as a publish, and answers the read', async () => {
    const f = await feed();
    const bridge = await createBridge({
      port: 0,
      // Auth off: the relay's host is server A's, the address the AMCP session dials.
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      pgmReturn: { portFor: () => f.port },
    });
    bridges.push(bridge);
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(bridge.url);
      sockets.push(socket);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
    const frames: WsFrame[] = [];
    ws.on('message', (data: Buffer) => {
      const frame = parseWsFrame(data.toString());
      if (frame !== null) frames.push(frame);
    });
    const published = (): PgmReturnStatus[][] =>
      frames.flatMap((fr) =>
        fr.type === 'publish' && fr.channel === 'pgmReturn.status-changed'
          ? [fr.payload as PgmReturnStatus[]]
          : [],
      );

    // Nothing watched: nothing pulled, and the read says so.
    ws.send(
      serializeWsFrame({
        type: 'request',
        id: 'a',
        channel: 'pgmReturn.status',
        payload: undefined,
      }),
    );
    await waitFor(() => frames.some((fr) => fr.type === 'response' && fr.id === 'a'), 3000, 'read');
    const first = frames.find((fr) => fr.type === 'response' && fr.id === 'a');
    expect(first?.type === 'response' ? first.payload : null).toEqual([]);
    expect(f.connections).toHaveLength(0);

    // A console watches channel 1 through the console route the CLI wires.
    const server = await consoleWith(bridge.pgmReturn);
    const viewer = await open(`${server.url}/pgm/1`);
    await waitFor(
      () => published().some((list) => list.some((s) => s.channel === 1 && s.state === 'live')),
      4000,
      'a live publish',
    );
    expect(published()[0]).toEqual([{ channel: 1, state: 'connecting' }]);
    expect(f.connections).toHaveLength(1);
    // The request went to the configured host with its name in `Host`.
    expect(f.connections[0]?.received.toString('latin1')).toBe(
      'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',
    );

    ws.send(
      serializeWsFrame({
        type: 'request',
        id: 'b',
        channel: 'pgmReturn.status',
        payload: undefined,
      }),
    );
    await waitFor(() => frames.some((fr) => fr.type === 'response' && fr.id === 'b'), 3000, 'read');
    const second = frames.find((fr) => fr.type === 'response' && fr.id === 'b');
    expect(second?.type === 'response' ? second.payload : null).toEqual([
      { channel: 1, state: 'live' },
    ]);

    // The console leaves: the upstream closes and the list empties.
    viewer.req.destroy();
    await waitFor(() => published().at(-1)?.length === 0, 4000, 'an empty publish');
    expect(f.openCount()).toBe(0);
  });

  it('answers 404 for a path that is not a channel', async () => {
    const f = await feed();
    const server = await consoleWith(relayOn(f.port));
    for (const bad of ['/pgm/', '/pgm/0', '/pgm/01', '/pgm/abc', '/pgm/1/audio.wav']) {
      const r = await open(`${server.url}${bad}`);
      r.req.destroy();
      expect(r.status, bad).toBe(404);
    }
    expect(f.connections).toHaveLength(0);
  });
});
