import * as dgram from 'node:dgram';
import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { TemplateHttpServer, type TemplateServeOptions } from '../src/template-http-server.js';

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
  await runtime.whenServerHealthy(6000);
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
  await runtime!.whenServerHealthy(6000);

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
  await runtime!.whenServerHealthy(6000);
  expect(runtime!.templateServe).not.toBeNull();
  expect((await runtime!.load('item2', 'lower-third', {})).accepted).toBe(true);
  const cg = mock!.lastCgAdd(SLOT);
  expect(cg?.template.startsWith('http://')).toBe(true);
  expect(await mock!.waitForCgAddResolution(SLOT)).toBe('resolved');
}, 30000);

it('CEF-wedge boundedness: stop() force-destroys held idle/mid-request/preconnect sockets and resolves fast on every Node', async () => {
  const server = new TemplateHttpServer(() => '<html>x</html>');
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  const port = server.port;

  // (a) idle keep-alive socket with a completed request (CEF pool);
  const agent = new http.Agent({ keepAlive: true });
  await new Promise<void>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${String(port)}/template/x`, { agent }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
  });
  // (b) a MID-REQUEST socket (partial headers, never completed);
  const midRequest = net.connect(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    midRequest.once('connect', resolve);
    midRequest.once('error', reject);
  });
  midRequest.write('GET /template/x HTTP/1.1\r\nHost: wedge\r\n'); // no final CRLF
  // (c) a raw PRECONNECT socket that never sent a byte.
  const preconnect = net.connect(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    preconnect.once('connect', resolve);
    preconnect.once('error', reject);
  });

  const t0 = Date.now();
  await server.stop();
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(1000); // bounded — the wedge is impossible
  expect(server.listening).toBe(false);

  agent.destroy();
  midRequest.destroy();
  preconnect.destroy();
}, 15000);

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
  await runtime!.whenServerHealthy(6000);

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
