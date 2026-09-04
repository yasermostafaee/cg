import * as dgram from 'node:dgram';
import { afterEach, expect, it, vi } from 'vitest';
import { outputVerdictOf, type ConnectionConfig, type RunningConsumer } from '@cg/shared-ipc';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * `C-029` — the program-output check, end to end against the amcp-mock, on the plant's own
 * fixture: `casparcg.config` declares a `<decklink>` with `<device>23487013</device>`, the
 * consumer failed at boot, and `INFO 1`'s `<output>` carries only `system-audio` and
 * `screen`. The mock is scripted to answer exactly what the plant answered on 2026-09-04
 * (`outputs.test.ts` pins the bytes); these tests drive the bridge's two reads, its verdict,
 * how the verdict clears, what it does when the server dies, and the creation flag.
 *
 * ⚠ Every INFO here is scripted through ONE handler, because the bare `INFO` is the
 * session handshake's channel list and must keep answering while the two reads are
 * refused or shaped.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

/** The plant's declaration, verbatim in shape: decklink 23487013 + screen + system-audio. */
const PLANT_CONFIG =
  '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n   <channels>\n      <channel>\n' +
  '         <video-mode>1080p5000</video-mode>\n         <consumers>\n            <decklink>\n' +
  '               <device>23487013</device>\n               <embedded-audio>true</embedded-audio>\n' +
  '               <keyer>default</keyer>\n            </decklink>\n            <screen/>\n' +
  '            <system-audio/>\n         </consumers>\n      </channel>\n   </channels>\n' +
  '</configuration>\n';

const MONITORS: RunningConsumer[] = [
  { port: 500, kind: 'system-audio' },
  { port: 600, kind: 'screen' },
];
const WITH_DECKLINK: RunningConsumer[] = [...MONITORS, { port: 23487313, kind: 'decklink' }];

function channelXml(running: readonly RunningConsumer[]): string {
  const ports = running
    .map(
      (r) =>
        `         <port_${String(r.port)}>\n            <consumer>${r.kind}</consumer>\n         </port_${String(r.port)}>\n`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n' +
    `   <output>\n      <port>\n${ports}      </port>\n   </output>\n</channel>\n`
  );
}

interface Script {
  running: RunningConsumer[];
  config: string;
  configSends: number;
  channelSends: number;
}

/** Script the mock's INFO family from a mutable state object the test edits mid-flight. */
function scriptInfo(m: MockHandle, script: Script): void {
  m.setHandler('INFO', (req) => {
    if (req.args.length === 0) {
      return { kind: 'ok-multi', code: 200, verb: 'INFO', lines: ['1 1080p5000 PLAYING'] };
    }
    if (req.args[0]?.toUpperCase() === 'CONFIG') {
      script.configSends += 1;
      return { kind: 'ok-line', code: 201, verb: 'INFO', data: script.config };
    }
    script.channelSends += 1;
    return { kind: 'ok-line', code: 201, verb: 'INFO', data: channelXml(script.running) };
  });
}

async function boot(
  script: Script,
  options: { createMissingConsumers?: boolean; outputRecheckMs?: number } = {},
): Promise<void> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  scriptInfo(mock, script);
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 60,
      outputRecheckMs: options.outputRecheckMs ?? 150,
      ...(options.createMissingConsumers !== undefined
        ? { createMissingConsumers: options.createMissingConsumers }
        : {}),
    },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);
}

const fixture = (): Script => ({
  running: [...MONITORS],
  config: PLANT_CONFIG,
  configSends: 0,
  channelSends: 0,
});

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

it('the fixture: the declared decklink is not running → the health snapshot says MISSING, by device', async () => {
  const script = fixture();
  await boot(script);

  await vi.waitFor(
    () => {
      expect(runtime!.health().primary.outputs?.[0]?.missing).toEqual([
        { kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] },
      ]);
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  const check = runtime!.health().primary.outputs?.[0];
  expect(check?.declared).toEqual([
    { kind: 'decklink', device: '23487013', embeddedAudio: true, keyer: 'default' },
    { kind: 'screen' },
    { kind: 'system-audio' },
  ]);
  expect(check?.running).toEqual(MONITORS);
  expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
  // The declaration was read ONCE for this connection, and stays read.
  await settle(60 * 4);
  expect(script.configSends).toBe(1);
}, 30000);

it('CLEARS without a reconnect: the slow re-read sees the consumer running and the verdict goes ok', async () => {
  const script = fixture();
  await boot(script, { outputRecheckMs: 150 });
  await vi.waitFor(
    () => {
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );

  // A hand-typed `ADD 1 DECKLINK 23487013` in the console, say — the running set gains it.
  script.running = [...WITH_DECKLINK];
  await vi.waitFor(
    () => {
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('ok');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(runtime!.health().primary.outputs?.[0]?.missing).toEqual([]);
}, 30000);

it('🔴 when the server DIES the verdict is KEPT and reads UNVERIFIABLE — never silence', async () => {
  const script = fixture();
  await boot(script);
  await vi.waitFor(
    () => {
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );

  await mock!.stop();
  mock = null;
  await vi.waitFor(
    () => {
      const primary = runtime!.health().primary;
      expect(primary.state).toBe('disconnected');
      const verdict = outputVerdictOf(primary);
      expect(verdict.kind).toBe('unverifiable');
      if (verdict.kind === 'unverifiable') {
        expect(verdict.channels[0]?.missing[0]?.devices).toEqual(['23487013']);
      }
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
}, 30000);

it('a RECONNECT re-reads both halves: a CasparCG restarted after a config fix clears the alarm', async () => {
  const script = fixture();
  await boot(script);
  await vi.waitFor(
    () => {
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(script.configSends).toBe(1);

  // The operator fixed the config and restarted CasparCG: the server comes back with the
  // decklink running. Modelled as the connection dropping and the running set changing.
  script.running = [...WITH_DECKLINK];
  mock!.closeAllAmcpConnections();

  await vi.waitFor(
    () => {
      expect(script.configSends).toBeGreaterThanOrEqual(2);
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('ok');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
}, 30000);

it('an INFO CONFIG that is not a configuration → declared null, verdict UNKNOWN, asked once', async () => {
  const script = fixture();
  script.config = channelXml(MONITORS); // a channel document where a configuration was expected
  await boot(script, { outputRecheckMs: 60_000 });
  await vi.waitFor(
    () => {
      expect(runtime!.health().primary.outputs?.[0]?.declared).toBeNull();
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(outputVerdictOf(runtime!.health().primary).kind).toBe('unknown');
  expect(runtime!.health().primary.outputs?.[0]?.missing).toEqual([]);
  // Latched: asking again would not make it a configuration.
  await settle(60 * 5);
  expect(script.configSends).toBe(1);
}, 30000);

it('🔴 with creation OFF (the default) NO ADD is ever sent, however long the output stays missing', async () => {
  const script = fixture();
  await boot(script);
  const adds: string[] = [];
  mock!.setHandler('ADD', (req) => {
    adds.push(`ADD ${req.args.join(' ')}`);
    return { kind: 'err', code: 403, verb: 'ADD' };
  });
  await vi.waitFor(
    () => {
      expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  await settle(60 * 6);
  expect(adds).toEqual([]);
  expect(runtime!.health().primary.outputs?.[0]?.creation).toBeUndefined();
}, 30000);

it('with creation ON: exactly ONE ADD, the declaration’s own device and flags, and the plant’s 403 is recorded', async () => {
  const script = fixture();
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  scriptInfo(mock, script);
  const adds: string[] = [];
  mock.setHandler('ADD', (req) => {
    adds.push(`ADD ${req.args.join(' ')}`);
    // What the plant answered on 2026-09-04 for a device it does not have.
    return { kind: 'err', code: 403, verb: 'ADD' };
  });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 60,
      outputRecheckMs: 150,
      createMissingConsumers: true,
    },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);

  await vi.waitFor(
    () => {
      expect(runtime!.health().primary.outputs?.[0]?.creation).toMatchObject({
        outcome: 'refused',
        code: 403,
        command: 'ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO',
      });
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(adds).toEqual(['ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO']);
  // Still missing — the server said no — and NOT retried on every re-read.
  expect(outputVerdictOf(runtime!.health().primary).kind).toBe('missing');
  await settle(150 * 4);
  expect(adds).toHaveLength(1);
}, 30000);

it('with creation ON and a server that accepts: the 202 is VERIFIED by a re-read, not believed', async () => {
  const script = fixture();
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  scriptInfo(mock, script);
  mock.setHandler('ADD', () => {
    script.running = [...WITH_DECKLINK];
    return { kind: 'ok', code: 202, verb: 'ADD' };
  });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 60,
      outputRecheckMs: 60_000,
      createMissingConsumers: true,
    },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);

  await vi.waitFor(
    () => {
      const check = runtime!.health().primary.outputs?.[0];
      expect(check?.creation?.outcome).toBe('created');
      expect(check?.missing).toEqual([]);
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(outputVerdictOf(runtime!.health().primary).kind).toBe('ok');
}, 30000);

it('with creation ON but only a MONITOR missing: nothing is sent and the reason is recorded', async () => {
  const script = fixture();
  script.running = [
    { port: 23487313, kind: 'decklink' },
    { port: 500, kind: 'system-audio' },
  ];
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  scriptInfo(mock, script);
  const adds: string[] = [];
  mock.setHandler('ADD', (req) => {
    adds.push(`ADD ${req.args.join(' ')}`);
    return { kind: 'ok', code: 202, verb: 'ADD' };
  });
  runtime = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      sweepMs: 60,
      createMissingConsumers: true,
    },
  );
  runtime.start();
  await runtime.startServing();
  await runtime.whenServerHealthy(HEALTH_MS);

  await vi.waitFor(
    () => {
      expect(runtime!.health().primary.outputs?.[0]?.creation?.outcome).toBe('not-attempted');
    },
    { timeout: HEALTH_MS, interval: 25 },
  );
  expect(adds).toEqual([]);
  expect(runtime!.health().primary.outputs?.[0]?.missing).toEqual([
    { kind: 'screen', declared: 1, running: 0, devices: [] },
  ]);
}, 30000);
