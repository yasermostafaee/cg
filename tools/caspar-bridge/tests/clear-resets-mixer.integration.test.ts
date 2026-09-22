import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue, readBandVolumes } from '@cg/caspar-client';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `BRIDGE-TRUTH-01` §2 / `B-253` — **`CLEAR` LEAVES THE MIXER; OUR CLEAR NOW TAKES IT WITH IT.**
 *
 * ── WHAT THE DEFECT IS, CORRECTED (`REPLY 1` R3) ─────────────────────────────
 *
 * A load stops after its muted `CG ADD` (`MIXER VOLUME 0` → `CG ADD`), and a `CLEAR` destroys the
 * producer and keeps the mixer — so a cleared row's layer stays at `VOLUME 0`. Our OWN next take
 * is audible regardless: it re-asserts `VOLUME 1` on every take (R-022). What the residue
 * silences is a producer that does NOT come through our take — a hand-typed `PLAY`, the
 * Playout's own automation, anything. So the property is tested with exactly that: a raw `PLAY`
 * from another client after our clear, and the layer's volume read back over the wire.
 *
 * ⚠ The test the prompt first specified — "a take on a loaded-then-cleared layer is audible" —
 * is VACUOUS for the reason above: it passes with or without the fix. It is not written.
 *
 * The residue here comes from the one production path that stops after `CG ADD` on a bank row:
 * a restore whose layer was found empty (`#decidePendingRestores` re-ADDs it, and the row comes
 * back `loaded`). The operator's LOAD sends nothing on the wire at all.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;
let foreign: AmcpTransport | null = null;

const HTML = '<!doctype html><html><body>row</body></html>';
/** The declared bank: channel 1, operator rows 70–73, beds 50–58. */
const BANK = { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 4 };
const FIXED_SLOTS = [70, 71, 72, 73].map((layer) => ({ channel: 1, layer }));
const ROW = 72;
/** Outside every range this station declares. */
const OUTSIDE = 40;
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};

afterEach(async () => {
  foreign?.destroy();
  foreign = null;
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
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

async function waitFor(cond: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

async function wire(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-mixer-clear-${String(process.pid)}-${String(Date.now())}-${String(Math.trunc(performance.now()))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      sweepMs: 150,
      occupancyStaleMs: 800,
      fixedSlots: FIXED_SLOTS,
      fixedBank: BANK,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  /*
    ⚠ WAIT FOR R-022's BOOT BLANKET before building any state. `#reassertDeclaredVolumes` sets
    every declared row to `VOLUME 1` on the first sweep after the link comes up; landing AFTER
    the muted re-ADD below, it would erase the very residue these tests measure — and did, under
    the gate's load, in the first spelling of this file.
  */
  await waitFor(
    async () => (await wire()).includes(`MIXER 1-${String(ROW)} VOLUME 1`),
    'the boot-time volume re-assert',
  );
  return r;
}

/** A layer's transform volume, read over the WIRE with the band reader — never `INFO`. */
async function volumeAt(layer: number): Promise<number> {
  if (mock === null) throw new Error('no mock');
  const { volumes } = await readBandVolumes({
    host: mock.host,
    port: mock.amcpPort,
    channel: 1,
    layers: [layer],
  });
  const reading = volumes[0];
  if (reading === undefined || !('volume' in reading)) {
    throw new Error(`no volume for 1-${String(layer)}: ${JSON.stringify(reading)}`);
  }
  return reading.volume;
}

/** A producer from ANOTHER client — not our take, so nothing of ours re-asserts a volume. */
async function foreignPlay(line: string): Promise<void> {
  if (mock === null) throw new Error('no mock');
  if (foreign === null) {
    foreign = new AmcpTransport();
    await foreign.connect(mock.host, mock.amcpPort);
  }
  await new CommandQueue(foreign).enqueue(line);
}

/** A restored LOADED row on a bank layer the server reports empty → re-ADDed, muted. */
async function aMutedLoadedRow(r: CasparRuntime): Promise<void> {
  const item: RetainedStackItem = {
    itemId: 'item1',
    templateId: 'lower-third',
    fields: {},
    state: 'loaded',
    slot: { channel: 1, layer: ROW, server: 'primary' },
  };
  await r.restore([item]);
  await waitFor(
    async () => (await wire()).some((l) => l.startsWith(`CG 1-${String(ROW)} ADD`)),
    'the restore re-ADD',
  );
}

describe('B-253 — our clear takes the mixer residue with the producer', () => {
  it('🔴 after our clear, a producer that does not come through our take is AUDIBLE', async () => {
    const r = await boot();
    await aMutedLoadedRow(r);
    // Precondition, measured over the wire — the residue exists before the clear. Without it
    // the reading below would be 1 for the wrong reason.
    expect(await volumeAt(ROW)).toBe(0);

    expect((await r.out('item1')).accepted).toBe(true);
    await foreignPlay(`PLAY 1-${String(ROW)} "someone-else" HTML`);

    // THE PROPERTY: 0 before the fix, 1 after it.
    expect(await volumeAt(ROW)).toBe(1);
  });

  it('the reset rides the wire right after our CLEAR, on a layer in our band', async () => {
    const r = await boot();
    await aMutedLoadedRow(r);
    const from = (await wire()).length;
    expect((await r.out('item1')).accepted).toBe(true);
    const lines = (await wire()).slice(from);
    const clear = lines.indexOf(`CLEAR 1-${String(ROW)}`);
    // Positive control — our CLEAR is on the wire, so the instrument saw this exchange.
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(lines.indexOf(`MIXER 1-${String(ROW)} CLEAR`)).toBeGreaterThan(clear);
  });

  it('guard 2 — a layer OUTSIDE our band is cleared and its mixer is left alone', async () => {
    const r = await boot();
    await foreignPlay(`PLAY 1-${String(OUTSIDE)} "someone-else" HTML`);
    const from = (await wire()).length;
    // `clearLayer` acts only on a layer OSC has seen carrying `html`; retry until it has.
    await waitFor(async () => (await r.clearLayer(1, OUTSIDE)).ok, 'the orphan to be observed');
    const lines = (await wire()).slice(from);
    // Positive control — the CLEAR went, so the absence below is about the reset alone.
    expect(lines).toContain(`CLEAR 1-${String(OUTSIDE)}`);
    expect(lines.filter((l) => l.startsWith(`MIXER 1-${String(OUTSIDE)} `))).toEqual([]);
  });

  it('guard 1 — a CLEAR that did not land sends no reset', async () => {
    const r = await boot();
    await aMutedLoadedRow(r);
    mock?.setHandler('CLEAR', () => ({ kind: 'err', code: 404, verb: 'CLEAR' }));
    const from = (await wire()).length;
    await r.out('item1');
    const lines = (await wire()).slice(from);
    // Positive control — the CLEAR was sent and refused.
    expect(lines).toContain(`CLEAR 1-${String(ROW)}`);
    expect(lines.filter((l) => l === `MIXER 1-${String(ROW)} CLEAR`)).toEqual([]);
    // …and the producer's mute is untouched, read over the wire.
    expect(await volumeAt(ROW)).toBe(0);
  });
});
