import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  fixedBankSlots,
  type ConnectionConfig,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle, type BridgeOptions } from '../../src/index.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './harness.js';

/**
 * 🔴 `MULTI-CHANNEL-01` — **A STATION THAT DECLARES TWO CHANNELS, ON A LOOPBACK FAKE THAT SERVES
 * THEM**, with every AMCP line the fake received readable back. The one rig every
 * channel-independence spec stands on, so none of them can measure the wire a weaker way than the
 * others: a spec that asks "did anything reach channel 2" reads the SAME trace, filtered by the
 * SAME addressing rule, as every other.
 *
 * Loopback only: the fake binds an ephemeral AMCP port and an ephemeral OSC port on 127.0.0.1, and
 * the bridge is handed that connection explicitly, so nothing here can reach a real server.
 */

/** The standard bank on a channel — templates 80–99, beds 50–59 — with every row shown. */
export function standardBank(channel: number): FixedLayerBank {
  const shown = (from: number, to: number): Record<string, boolean> => {
    const v: Record<string, boolean> = {};
    for (let l = from; l <= to; l++) v[String(l)] = true;
    return v;
  };
  return {
    channel,
    start: 80,
    count: 20,
    visibility: shown(80, 99),
    low: { start: 50, count: 10, visibility: shown(50, 59) },
  };
}

export const FURNITURE: TemplateInfo = { templateId: 'logo', templateType: 'logo', fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';

export const SWEEP_MS = 150;
export const STALE_MS = 800;

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

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(
  cond: () => boolean | Promise<boolean>,
  what: string,
  ms = 8000,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

export interface TwoChannelRig {
  readonly mock: MockHandle;
  readonly handle: BridgeHandle;
  readonly connection: ConnectionConfig;
  /** Every line the fake RECEIVED, in order. */
  lines(): Promise<string[]>;
}

/**
 * Boot the fake (`channels` of them) and a bridge declaring `banks`, wait for health and the
 * channel mode read, register the furniture template, and — unless told not to — wait for the
 * connect-time volume blanket to finish on EVERY declared row, so no later window can mistake a
 * blanket straggler for a command under test (`one-channel-station`'s measured lesson).
 */
export async function twoChannelRig(
  opts: {
    /** The banks the bridge boots with — explicitly, or (with {@link fromFile}) as the file says. */
    banks?: readonly FixedLayerBank[];
    /** Boot from this persisted fixed-layers file instead of an explicit bank list. */
    fromFile?: string;
    channels?: number;
    bridge?: Partial<BridgeOptions>;
    awaitBlanket?: boolean;
  } = {},
): Promise<TwoChannelRig> {
  const banks = opts.banks ?? [standardBank(1), standardBank(2)];
  const oscPort = await freeUdpPort();
  const tracePath = path.join(
    os.tmpdir(),
    `cg-twochannel-${String(process.pid)}-${String(Date.now())}-${String(Math.trunc(performance.now()))}.ndjson`,
  );
  track(tracePath, (p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
  const mock = track(
    await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: opts.channels ?? 3,
      tracePath,
    }),
    (m) => m.stop(),
  );
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const handle = track(
    await createBridge({
      port: 0,
      connection,
      ...(opts.fromFile !== undefined
        ? { fixedLayersPath: opts.fromFile }
        : { fixedLayers: banks }),
      runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
      ...(opts.bridge ?? {}),
    }),
    (h) => h.close(),
  );
  await handle.runtime.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(handle.runtime);
  handle.runtime.templateImport(FURNITURE, HTML);
  const lines = async (): Promise<string[]> => {
    await mock.traceFlush();
    if (!fs.existsSync(tracePath)) return [];
    return fs
      .readFileSync(tracePath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { dir: string; line: string })
      .filter((e) => e.dir === 'recv')
      .map((e) => e.line);
  };
  if (opts.awaitBlanket !== false) {
    await waitUntil(async () => {
      const seen = await lines();
      return banks.every((bank) =>
        fixedBankSlots(bank).every((s) =>
          seen.includes(`MIXER ${String(s.channel)}-${String(s.layer)} VOLUME 1`),
        ),
      );
    }, 'the boot volume blanket on every declared row');
  }
  return { mock, handle, connection, lines };
}

/** Every line whose TARGET is on `channel` (`CLEAR 2-99`, `INFO 2`, `MIXER 2-99 VOLUME 0`). */
export function addressing(lines: readonly string[], channel: number): string[] {
  const targeted = new RegExp(`^[A-Z][A-Z ]*?\\s${String(channel)}(?:-\\d+)?(?:\\s|$)`);
  return lines.filter((l) => targeted.test(l));
}

/**
 * The lines a window added, with the mode and output READS left out: `INFO <n>` is the bridge
 * looking, on its own schedule, and it writes nothing.
 */
export function writes(lines: readonly string[]): string[] {
  return lines.filter((l) => !l.startsWith('INFO'));
}
