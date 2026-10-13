import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import {
  defaultFixedLayerBank,
  fixedBankSlots,
  isLayerVisible,
  isLowBankLayer,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import { createBridge } from '../src/index.js';
import { HEALTH_MS, track } from './support/harness.js';

/**
 * 🔴 `RELEASE-091-01` §7 (`B-291`) — **A STATION SET UP BEFORE THE FIVE-ROW DEFAULT OPENS AS 5 + 5.**
 * The owner's installed `0.9.0` came up showing every row: its bank was saved every-row-shown and kept
 * as written. A real bridge on a persisted file, against `@cg/amcp-mock`: once the channel reads, the
 * bank shows templates 99–95 and beds 59–55 — plus a row another system occupies — and the FILE holds
 * it. The unknown case is `default-bank-boot.integration.test.ts`'s (a dead server: unchanged).
 */

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** First-run's bank from before `FIELD-FIXES-01` I, on channel 1: every row of both bands `true`. */
function oldShape(): FixedLayerBank {
  const base = defaultFixedLayerBank();
  const ticked = (bed: boolean): Record<string, boolean> =>
    Object.fromEntries(
      fixedBankSlots(base)
        .filter(({ layer }) => isLowBankLayer(base, layer) === bed)
        .map(({ layer }) => [String(layer), true]),
    );
  return {
    ...base,
    channel: 1,
    visibility: ticked(false),
    low: { ...base.low, visibility: ticked(true) },
  };
}

const shown = (bank: FixedLayerBank): number[] =>
  fixedBankSlots(bank)
    .filter(({ layer }) => isLayerVisible(bank, layer))
    .map(({ layer }) => layer)
    .sort((a, b) => b - a);

it('🔴 an old-shape bank opens as templates 99–95 and beds 59–55, and the file holds it — control: an occupied row 90 stays shown', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bank-bring-in-'));
  const fixedLayersPath = path.join(dir, 'bridge-fixed-layers.json');
  fs.writeFileSync(fixedLayersPath, JSON.stringify(oldShape(), null, 2), 'utf8');

  const oscPort = await freeUdpPort();
  const mock = track(
    await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 1 }),
    (m) => m.stop(),
  );
  // Another system's producer on row 90 BEFORE the bridge starts: the channel reads occupied there.
  const transport = track(new AmcpTransport(), (t) => t.destroy());
  await transport.connect(mock.host, mock.amcpPort);
  const queue = track(new CommandQueue(transport), (q) => q.dispose());
  await queue.enqueue('PLAY 1-90 "someone-elses-clip"');

  const handle = track(
    await createBridge({
      port: 0,
      connection: {
        servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      fixedLayersPath,
      runtimeTuning: { sweepMs: 150, occupancyStaleMs: 800 },
    }),
    (h) => h.close(),
  );
  await handle.runtime.whenServerHealthy(HEALTH_MS);

  const deadline = Date.now() + 10_000;
  let bank = handle.runtime.fixedLayerBanks()[0];
  while (bank !== undefined && shown(bank).length === 30 && Date.now() < deadline) {
    await delay(50);
    bank = handle.runtime.fixedLayerBanks()[0];
  }
  if (bank === undefined) throw new Error('no bank');
  expect(shown(bank)).toEqual([99, 98, 97, 96, 95, 90, 59, 58, 57, 56, 55]);
  // The FILE holds it — the next start opens as 5 + 5, and never brings it in again.
  const onDisk = JSON.parse(fs.readFileSync(fixedLayersPath, 'utf8')) as FixedLayerBank;
  expect(shown({ ...onDisk, low: onDisk.low })).toEqual([
    99, 98, 97, 96, 95, 90, 59, 58, 57, 56, 55,
  ]);
  expect(onDisk.visibility?.['80']).toBe(false);
});
