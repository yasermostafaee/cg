import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `CHANNEL-RESOLUTION-01` — **A BRIDGE CONFIGURED FOR CHANNEL N ADDRESSES NO OTHER
 * CHANNEL, FROM BOOT THROUGH CONNECT THROUGH RESTORE.**
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 *
 * On 2026-09-22 a recon bridge configured for channel 2 seated six template producers
 * onto **channel 1 of a partner's live programme output**. Measured at their wire:
 * six `MIXER 1-L VOLUME 0` and six `CG 1-L ADD … 0 …` on layers 59 and 95–99, all on
 * one timestamp, with no `CG PLAY` — and, on the same connection, the connect-time
 * unity sweep going correctly to channel 2. Two paths, two different answers to
 * "which channel am I on".
 *
 * The connect path reads the STATION's configuration (`fixedBankSlots(this.#fixedBank)`
 * → `{ channel: bank.channel, layer }`). The restore path read the CLIENT's memory
 * (`#slotForRestore` → `{ channel: item.slot.channel, layer: item.slot.layer }`) and
 * compared it to nothing. A console tab left open from a session against a DIFFERENT
 * station — one whose bank was channel 1 — reconnected to the bridge's WebSocket port,
 * replayed its retained stack, and the bridge honoured coordinates naming somebody
 * else's output.
 *
 * `LayerManager.reserve()` is where the trust was granted, and its docstring said why:
 * _"the coordinate came from this allocator in a previous process, and honouring it is
 * the whole point."_ Nothing enforces that premise. The coordinate came from a browser.
 *
 * ── WHY THE PROPERTY IS STATED AT THE WIRE, AND AS AN ABSENCE ────────────────
 *
 * The fence that already existed — the LayerManager's fixed-slot set — is keyed on the
 * FULL coordinate, so an off-bank channel does not fail it, it FALLS OUT OF IT: a
 * coordinate on the declared channel meets `bindFixed`, and a coordinate on any other
 * channel skipped that door and met `reserve()`, which checks the layer and never the
 * channel. The safety property was inverted — the further off-bank a client's coordinate,
 * the fewer checks it met — so an assertion about the skip reason alone could pass over
 * a bridge that still wrote to the channel. What matters is what reached CasparCG, and
 * it is read from the mock's own NDJSON trace for the reason the neighbouring restore
 * suites give: the failure being prevented is a broadcast one, and internal bookkeeping
 * can read correct over a blind mechanism.
 *
 * ⚠ **The retained layer here is 72 — a layer the bank DOES declare — on channel 1,
 * which it does not.** That is the sharpest form of the incident (their channel 1
 * carried our bank's own layer numbers) and it is deliberately not a layer the bank
 * would reject anyway: a test that moved both coordinates could pass on the layer alone
 * while the channel stayed unfenced.
 *
 * ⚠ **Test 2 is the positive control and is not optional.** "Nothing addressed channel
 * 1" is void until the same harness is shown to emit at all; without it a restore that
 * silently did nothing would satisfy test 1 completely.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

/** The declared bank: CHANNEL 2, operator rows 70–73, beds 50–58. */
const BANK = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 2, layer: 70 },
  { channel: 2, layer: 71 },
  { channel: 2, layer: 72 },
  { channel: 2, layer: 73 },
];
const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};

afterEach(async () => {
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

async function waitFor(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** The mock's NDJSON wire trace: recv'd AMCP lines, in arrival order. */
async function recvLines(): Promise<string[]> {
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

/**
 * Every AMCP line whose TARGET names `channel`, in both spellings a target has.
 *
 * `CG 1-72 ADD`, `MIXER 1-72 VOLUME` and `CLEAR 1-72` carry `<channel>-<layer>`;
 * `CLEAR 1` and `MIXER 1 COMMIT` are channel-wide and carry the channel alone.
 * Matching only the first spelling would pass over the worse of the two — the same
 * reason `fixed-restore-branch`'s `clearLines` matches on the verb rather than on one
 * target — and matching on a bare `1` anywhere in the line would catch every `CG … ADD 0`
 * flag and every layer number on another channel.
 *
 * Deliberately verb-agnostic: the property is "nothing at all", not "no `CG ADD`", and a
 * list of verbs is one new verb away from being a lie about what was checked.
 */
async function linesAddressingChannel(channel: number): Promise<string[]> {
  const ch = String(channel);
  const targeted = new RegExp(`^[A-Z][A-Z ]*?\\s${ch}(?:-\\d+)?(?:\\s|$)`);
  return (await recvLines()).filter((l) => targeted.test(l));
}

/** Every layer a `CG … ADD` addressed, in order — the re-ADD half of the decision. */
async function cgAddTargets(): Promise<string[]> {
  return (await recvLines())
    .map((l) => /^CG (\d+-\d+) ADD\b/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] as string);
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/**
 * Boot a runtime whose declared bank is CHANNEL 2, against a mock serving two channels.
 *
 * Two channels, not one, because the hazard needs channel 1 to be a real thing the mock
 * would answer for: a bridge that addressed a channel the mock does not serve could look
 * clean for the wrong reason.
 */
async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-chanfence-${String(process.pid)}-${String(Date.now())}-${String(
      Math.trunc(performance.now()),
    )}.ndjson`,
  );
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    channels: 2,
    tracePath,
  });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      sweepMs: SWEEP_MS,
      occupancyStaleMs: STALE_MS,
      fixedSlots: FIXED_SLOTS,
      fixedBank: BANK,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

const retainedOn = (channel: number, layer: number, itemId = 'item1'): RetainedStackItem[] => [
  {
    itemId,
    templateId: 'lower-third',
    fields: { headline: 'سلام' },
    state: 'on-air',
    slot: { channel, layer, server: 'primary' },
  },
];

// ── 1 ────────────────────────────────────────────────────────────────────────
it('a retained coordinate on a FOREIGN channel reaches the wire not at all', async () => {
  const r = await boot();

  // The client replays a row it remembers on 1-72. Layer 72 IS a declared row of this
  // bank; channel 1 is not this bank's channel. The row must not come back, and — the
  // property that matters — nothing may be sent to channel 1 on its behalf.
  const result = await r.restore(retainedOn(1, 72));

  // Let the deferred adopt-vs-re-ADD decision have every chance to run: it is driven by
  // the occupancy sweep, so an assertion taken immediately after `restore()` returns
  // would pass before the wire traffic it is looking for could exist.
  await delay(SWEEP_MS * 4);

  // 🔴 THE WIRE FIRST, and the order is deliberate. The bookkeeping below is a
  // consequence worth pinning, but it is not the property: a fix that reported the row
  // as skipped while still muting and ADDing on channel 1 would satisfy every
  // assertion about `result` and none of the reason this test exists.
  expect(await linesAddressingChannel(1)).toEqual([]);
  expect(await cgAddTargets()).toEqual([]);

  expect(result.restored).toBe(0);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]?.itemId).toBe('item1');
}, 40_000);

// ── 2 — THE POSITIVE CONTROL ─────────────────────────────────────────────────
it('the same restore on the bank’s OWN channel comes back and re-ADDs — the control', async () => {
  const r = await boot();

  expect(await r.restore(retainedOn(2, 72))).toEqual({ restored: 1, skipped: [], migrated: [] });

  await waitFor(async () => (await cgAddTargets()).length > 0, 'the re-ADD to reach the wire');

  // The instrument is live: this harness DOES capture a `CG ADD`, on the declared
  // channel, which is what makes test 1's empty list a measurement rather than a silence.
  expect(await cgAddTargets()).toEqual(['2-72']);
  expect(await linesAddressingChannel(1)).toEqual([]);
}, 40_000);
