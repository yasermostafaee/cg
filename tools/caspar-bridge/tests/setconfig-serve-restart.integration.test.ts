import * as dgram from 'node:dgram';
import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { TemplateHttpServer, type TemplateServeOptions } from '../src/template-http-server.js';
import { BOUNDED_STOP_MS, HEALTH_MS, track } from './support/harness.js';

/**
 * fix-setconfig-serve-restart — R-010 regression (operator repro, live on
 * CasparCG 2.5.0): a wrong-OSC-port Apply wedged at the serve teardown past
 * the UI's 8 s timeout, the second Apply ran CONCURRENTLY, read the
 * mid-teardown `listening=false`, skipped the serve restart, and returned
 * ok — after which every Load shipped an unservable BARE template id
 * (404 CG ADD FAILED). One root cause (no setConfig serialization), two
 * failure modes (skipped restart / corrupted session swap), plus the
 * deeper #sendAdd bare-id contract bug. Full diagnosis in the change's
 * design.md.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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

function config(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const SLOT = { channel: 1, layer: 10 }; // lower-third's deterministic allocation

async function boot(options: { templateServer?: TemplateHttpServer } = {}): Promise<{
  goodOsc: number;
  badOsc: number;
}> {
  const goodOsc = await freeUdpPort();
  const badOsc = await freeUdpPort(); // bindable but nothing pushes there — the operator's "wrong value"
  mock = await createMock({ amcpPort: 0, oscPort: goodOsc, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime(config(mock.amcpPort, goodOsc), {}, options);
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(
    { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
    '<!doctype html><html><body>served</body></html>',
  );
  await runtime.whenServerHealthy(HEALTH_MS);
  // Prove the serve path works before the cycle (and leave the mock's GET
  // socket behind, like CEF would).
  expect((await runtime.load('warm', 'lower-third', {})).accepted).toBe(true);
  expect(await mock.waitForCgAddResolution(SLOT)).toBe('resolved');
  expect((await runtime.removeAll()).ok).toBe(true);
  return { goodOsc, badOsc };
}

it('BASELINE sequential operator cycle: bad-OSC apply then good apply → serve listening, Load uses the served URL', async () => {
  const { goodOsc, badOsc } = await boot();

  const first = await runtime!.setConfig(config(mock!.amcpPort, badOsc));
  expect(first.ok).toBe(true); // an unreachable OSC target is honest-not-fatal
  const second = await runtime!.setConfig(config(mock!.amcpPort, goodOsc));
  expect(second.ok).toBe(true);
  await runtime!.whenServerHealthy(HEALTH_MS);

  expect(runtime!.templateServe).not.toBeNull();
  expect((await runtime!.load('item1', 'lower-third', {})).accepted).toBe(true);
  const cg = mock!.lastCgAdd(SLOT);
  expect(cg?.template.startsWith('http://')).toBe(true);
}, 30000);

it('REGRESSION concurrent applies: exactly one executes, the other is refused apply-in-progress; state uncorrupted', async () => {
  const { goodOsc, badOsc } = await boot();

  // The operator's shape: the second Apply issued while the first is still
  // executing (their first wedged past the 8 s UI timeout). Fired in the
  // same tick so the window is deterministic on every Node.
  const firstP = runtime!.setConfig(config(mock!.amcpPort, badOsc));
  const secondP = runtime!.setConfig(config(mock!.amcpPort, goodOsc));
  const [first, second] = await Promise.all([firstP, secondP]);

  // PRE-FIX: both returned ok:true (interleaved teardown/rebuild) — the
  // serve-restart skip (their bare-id log) and/or a dead session swap.
  const okCount = [first, second].filter((r) => r.ok).length;
  expect(okCount).toBe(1);
  const refused = first.ok ? second : first;
  expect(refused.reason).toBe('apply-in-progress');

  // The bridge is NOT corrupted: a follow-up sequential apply of the good
  // config succeeds, the serve is listening, and a Load ships a served URL.
  const third = await runtime!.setConfig(config(mock!.amcpPort, goodOsc));
  expect(third.ok).toBe(true);
  await runtime!.whenServerHealthy(HEALTH_MS);
  expect(runtime!.templateServe).not.toBeNull();
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const cg = mock!.lastCgAdd(SLOT);
  expect(cg?.template.startsWith('http://')).toBe(true);
  expect(await mock!.waitForCgAddResolution(SLOT)).toBe('resolved');
}, 30000);

it('CEF-wedge boundedness: stop() force-destroys held idle/mid-request/preconnect sockets and resolves fast on every Node', async () => {
  const server = track(new TemplateHttpServer(() => '<html>x</html>'), (s) => s.stop());
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  const port = server.port;

  // (a) idle keep-alive socket with a completed request (CEF pool);
  const agent = track(new http.Agent({ keepAlive: true }), (a) => {
    a.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${String(port)}/template/x`, { agent }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
  });
  // (b) a MID-REQUEST socket (partial headers, never completed);
  const midRequest = track(net.connect(port, '127.0.0.1'), (s) => {
    s.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    midRequest.once('connect', resolve);
    midRequest.once('error', reject);
  });
  midRequest.write('GET /template/x HTTP/1.1\r\nHost: wedge\r\n'); // no final CRLF
  // (c) a raw PRECONNECT socket that never sent a byte.
  const preconnect = track(net.connect(port, '127.0.0.1'), (s) => {
    s.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    preconnect.once('connect', resolve);
    preconnect.once('error', reject);
  });

  const t0 = Date.now();
  await server.stop();
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(BOUNDED_STOP_MS); // bounded — the wedge is impossible
  expect(server.listening).toBe(false);
}, 15000);

it('stop() lets an IN-FLIGHT response flush (never severs an active template fetch) yet stays bounded for a stalled client', async () => {
  // A multi-chunk response so the flush is genuinely streamed. In-flight-ness
  // is guaranteed by the FIRST-BYTE BARRIER below, not by size — the old
  // fixed-30ms staging left the request UNPARSED at stop() under CI
  // contention, and the socket (not yet in #busy) was instantly severed:
  // this test's own ECONNRESET failure on the red main runs.
  const bigHtml = `<html><body>${'x'.repeat(512 * 1024)}</body></html>`;
  const server = track(new TemplateHttpServer(() => bigHtml), (s) => s.stop());
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  const port = server.port;

  // (a) an ACTIVE fetch that reads normally — must complete despite stop().
  let firstByte: () => void = () => undefined;
  const firstByteSeen = new Promise<void>((resolve) => {
    firstByte = resolve;
  });
  const fetching = new Promise<number>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${String(port)}/template/x`, (res) => {
      let bytes = 0;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        firstByte();
      });
      res.on('end', () => resolve(bytes));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
  // Deterministic staging: once the client holds response bytes, the server
  // HAS parsed the request and is mid-response — genuinely in flight.
  await firstByteSeen;

  const t0 = Date.now();
  await server.stop();
  const elapsed = Date.now() - t0;
  // The active response flushed (no severed fetch)…
  await expect(fetching).resolves.toBeGreaterThan(512 * 1024);
  // …and teardown stayed bounded (grace, not forever).
  expect(elapsed).toBeLessThan(BOUNDED_STOP_MS);

  // (b) a STALLED client (receives the response start, then never reads
  // again) — the grace deadline force-destroys it; stop() is still bounded.
  const server2 = track(new TemplateHttpServer(() => bigHtml), (s) => s.stop());
  await server2.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  const stalled = track(net.connect(server2.port, '127.0.0.1'), (s) => {
    s.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    stalled.once('connect', resolve);
    stalled.once('error', reject);
  });
  stalled.on('error', () => undefined); // the deadline destroy may RST — expected
  // Deterministic stall: wait for the response to START (request parsed, the
  // socket is genuinely mid-response), then stop reading forever. The old
  // pause-before-request staging could race the parse and "stall" a socket
  // the server never saw a request on.
  const stallStarted = new Promise<void>((resolve) => {
    stalled.once('data', () => {
      stalled.pause(); // never read again — the response backpressures
      resolve();
    });
  });
  stalled.write('GET /template/x HTTP/1.1\r\nHost: stall\r\n\r\n');
  await stallStarted;
  const t1 = Date.now();
  await server2.stop();
  expect(Date.now() - t1).toBeLessThan(BOUNDED_STOP_MS); // grace (500ms), not forever
}, 20000);

it('stop() never severs a request that has ARRIVED but is not yet parsed — the keep-alive next-fetch window', async () => {
  // The CI failure mode distilled (reconnect :133/:243 + the in-flight test's
  // ECONNRESET): a socket joins #busy only when Node fires 'request' (headers
  // parsed), so request bytes still in the kernel buffer at stop() looked
  // "request-less" and were instantly destroyed. Staging is race-free: a
  // completed first request proves the socket is accepted and tracked (an
  // idle keep-alive socket, CEF-pool-shaped); the second request is written
  // and stop() is called in the SAME synchronous tick — no event-loop turn in
  // between, so 'request' cannot have fired yet. stop()'s destroy pass defers
  // one full loop iteration, letting the arrived request join #busy and
  // flush; pre-fix this was a deterministic ECONNRESET.
  const body = '<html><body>parse-window</body></html>';
  const server = track(new TemplateHttpServer(() => body), (s) => s.stop());
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });

  const sock = track(net.connect(server.port, '127.0.0.1'), (s) => {
    s.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('connect', resolve);
    sock.once('error', reject);
  });
  sock.setEncoding('utf-8');
  let received = '';
  sock.on('data', (chunk: string) => {
    received += chunk;
  });
  sock.on('error', () => undefined); // a sever surfaces as a missing body below
  const closed = new Promise<void>((resolve) => sock.on('close', () => resolve()));

  // First request-response cycle: proves the server accepted and tracked the
  // socket; afterwards it sits idle keep-alive, exactly like a CEF pool socket.
  sock.write('GET /template/x HTTP/1.1\r\nHost: t\r\n\r\n');
  await expect
    .poll(() => received.split(body).length - 1, { timeout: 5000 })
    .toBeGreaterThanOrEqual(1);

  // SAME TICK: the next fetch's bytes + stop(). No loop turn in between —
  // the server cannot have parsed the second request when stop() begins.
  sock.write('GET /template/x HTTP/1.1\r\nHost: t\r\nConnection: close\r\n\r\n');
  const t0 = Date.now();
  await server.stop();
  const elapsed = Date.now() - t0;
  await closed;

  // The arrived request flushed a complete second response (no ECONNRESET,
  // no truncation), and teardown stayed bounded.
  expect(received.split(body).length - 1).toBe(2);
  expect(elapsed).toBeLessThan(BOUNDED_STOP_MS);
}, 20000);

/** start() succeeds once (boot), then always throws — the injected bind failure. */
class FailingRestartServer extends TemplateHttpServer {
  #starts = 0;
  override async start(options: TemplateServeOptions): Promise<void> {
    this.#starts += 1;
    if (this.#starts > 1) throw new Error('injected bind failure');
    await super.start(options);
  }
}

it('REGRESSION loud-failure contract: serve down while desired → apply-failed surfaced AND Load refused with template-serve-down, ZERO CG ADD on the wire', async () => {
  const failing = new FailingRestartServer(() => '<!doctype html><html><body>served</body></html>');
  const { goodOsc } = await boot({ templateServer: failing });

  // Any apply now loses the serve: restart + loopback retry both throw.
  const applied = await runtime!.setConfig(config(mock!.amcpPort, goodOsc));
  // PRE-FIX equivalent states returned ok:true with the serve down.
  expect(applied.ok).toBe(false);
  expect(applied.reason).toBe('apply-failed');
  expect(runtime!.templateServe).toBeNull();
  await runtime!.whenServerHealthy(HEALTH_MS);

  // The bare-id contract: the load is REFUSED with a clear reason and no
  // NEW CG ADD reaches the wire (pre-fix: a bare id went out and 404'd).
  // The warm load's served-URL ADD is the only record the mock may hold.
  const before = mock!.lastCgAdd(SLOT);
  const load = await runtime!.load('item3', 'lower-third', {});
  expect(load.accepted).toBe(false);
  const item = runtime!.stackSnapshot().find((i) => i.itemId === 'item3');
  expect(item?.errorCode).toBe('template-serve-down');
  const after = mock!.lastCgAdd(SLOT);
  expect(after?.template).toBe(before?.template); // no new ADD…
  expect(after?.template.startsWith('http://')).toBe(true); // …and never a bare id
}, 30000);

/**
 * §8 — THE ERROR-NAMING SWEEP, at the site where a wrapper replaced the cause.
 *
 * `take()`'s B-039 pre-roll calls `#sendAdd`, which used to answer a bare
 * `boolean` — so BOTH of its failures arrived as `false` and were re-labelled
 * `amcp-error`. That name is a claim: it says CasparCG was involved. When the
 * BRIDGE's own template server is down, CasparCG was never contacted at all, and
 * the operator reads the toast and walks to the playout machine.
 *
 * This is the `mute-failed` shape exactly — one wrong word that cost this project
 * an investigation into mute scope and 2.3.2-versus-2.5.0 audio. A wrapper may add
 * context; it may not replace the cause.
 */
it('§8 — a take whose pre-roll ADD fails names template-serve-down, never amcp-error', async () => {
  const failing = new FailingRestartServer(() => '<!doctype html><html><body>served</body></html>');
  const { goodOsc } = await boot({ templateServer: failing });

  // A real, served load — then CLEAR it, so the producer is gone and the next
  // take must re-ADD (the B-039 pre-roll, which is the path under test).
  expect((await runtime!.load('item-preroll', 'lower-third', {})).accepted).toBe(true);
  expect(await mock!.waitForCgAddResolution(SLOT)).toBe('resolved');
  expect((await runtime!.out('item-preroll')).accepted).toBe(true);

  // Now lose the serve, exactly as the loud-failure spec above does.
  expect((await runtime!.setConfig(config(mock!.amcpPort, goodOsc))).ok).toBe(false);
  expect(runtime!.templateServe).toBeNull();
  await runtime!.whenServerHealthy(HEALTH_MS);

  const took = await runtime!.take('item-preroll');
  expect(took.accepted).toBe(false);
  // THE ASSERTION. `amcp-error` would send the operator to the playout server for
  // a fault on this machine.
  expect(took.errorCode).toBe('template-serve-down');
  expect(took.errorCode).not.toBe('amcp-error');
  // …and the item's own reconciled reason agrees, so the row and the toast
  // cannot name two different faults for one cause.
  expect(runtime!.stackSnapshot().find((i) => i.itemId === 'item-preroll')?.errorCode).toBe(
    'template-serve-down',
  );
}, 30000);

/**
 * The same rule at the CHANNEL boundary: `load()` knew the reason and answered
 * only `{ accepted: false }`, so the reason existed on the item but never reached
 * the caller that raises the toast.
 */
it('§8 — load() returns the reason it already knew, not just a refusal', async () => {
  const failing = new FailingRestartServer(() => '<!doctype html><html><body>served</body></html>');
  const { goodOsc } = await boot({ templateServer: failing });
  expect((await runtime!.setConfig(config(mock!.amcpPort, goodOsc))).ok).toBe(false);
  await runtime!.whenServerHealthy(HEALTH_MS);

  const load = await runtime!.load('item-load-reason', 'lower-third', {});
  expect(load.accepted).toBe(false);
  expect(load.errorCode).toBe('template-serve-down');
}, 30000);
