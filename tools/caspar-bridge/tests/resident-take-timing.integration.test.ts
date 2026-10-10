import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { readCgControl, TEMPLATE_TIMING_VERSION } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';

/**
 * 🔴 `LOGO-LOOP-01` (`B-322`) — **A PASS TIMING SET WHILE A ROW IS STOPPED REACHES THE NEXT TAKE,
 * ON BOTH ROUTES INTO AIR.**
 *
 * The owner's logo (`loop-cycle`), 2026-10-10: on air he set a count of one more; it ran it and
 * closed. Stopped, he set `Until stop`, pressed `Update`, then `Play` — and it played one pass and
 * closed. Off air the verb records and sends nothing (golden rule 10) on the promise that the next
 * take carries it, and that was true of ONE route only:
 *
 *  - after `out` the producer is gone, the take re-ADDs, and `#sendAdd`'s payload carries `timing`;
 *  - after `stop` the producer is RESIDENT, the take sends `#tellPageTake`'s `CG UPDATE` and a
 *    `CG PLAY`, and that `CG UPDATE` carried the token and the look and no `timing`.
 *
 * Measured on the AMCP trace, never on the bridge's record: the record said `infinite` the whole
 * time. That the PAGE then honours the member is `packages/template-runtime`'s half
 * (`take-tell-is-inert.test.ts`, `B-323`).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

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
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** The owner's logo: a template that genuinely loops, so pass timing is admitted. */
const LOOPER: TemplateInfo = {
  templateId: 'looper',
  templateType: 'looper',
  fields: [],
  playout: { v: TEMPLATE_TIMING_VERSION, mode: 'loop-cycle', holdSource: 'timed', loops: true },
};

/** The plant's news ticker: `auto-out`, so a recorded count must never cross. */
const TICKER: TemplateInfo = {
  templateId: 'ticker',
  templateType: 'ticker',
  fields: [],
  playout: {
    v: TEMPLATE_TIMING_VERSION,
    mode: 'auto-out',
    holdSource: 'content-driven',
    loops: true,
    repeat: 'infinite',
  },
};

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-residenttiming-${String(process.pid)}-${String(Date.now())}-${String(
      Math.round(performance.now() * 1000),
    )}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, {
    layerPolicy: TEST_LAYER_POLICY,
    sweepMs: 150,
  } as never);
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(LOOPER, '<!doctype html><html></html>');
  r.templateImport(TICKER, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  // A negative observation is only valid from a proven-quiescent wire (flake family 3).
  await awaitChannelModeRead(r);
  return r;
}

async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return readWireLines(tracePath);
}

const since = async (before: number): Promise<string[]> => (await recvLines()).slice(before);
const matching = (lines: readonly string[], re: RegExp): string[] =>
  lines.filter((l) => re.test(l));

const ADD = /^CG \d+-\d+ ADD /;
const UPDATE = /^CG \d+-\d+ UPDATE /;
const PLAY = /^CG \d+-\d+ PLAY /;

/** The `__cg` control object one AMCP line carried, or undefined if it carried none. */
function controlOf(line: string | undefined): Record<string, unknown> | undefined {
  if (line === undefined) return undefined;
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line.trim());
  if (quoted?.[1] === undefined) return undefined;
  const json = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return readCgControl(JSON.parse(json) as unknown) as unknown as Record<string, unknown>;
}

/**
 * The take's wire, measured: what it sent, and the ONE `CG UPDATE` that precedes its `CG PLAY`.
 * Asserts the resident shape itself — no `CG ADD`, one tell, one `CG PLAY`, the tell first — so
 * a case cannot pass by having taken the other route.
 */
async function residentTake(r: CasparRuntime, itemId: string): Promise<string> {
  const before = (await recvLines()).length;
  expect((await r.take(itemId)).accepted).toBe(true);
  const take = await since(before);
  expect(matching(take, ADD), 'the take re-ADDed — this is not the resident route').toEqual([]);
  const plays = matching(take, PLAY);
  const tells = matching(take, UPDATE);
  expect(plays, 'the take did not send exactly one CG PLAY').toHaveLength(1);
  expect(tells, 'the resident take did not send exactly one tell').toHaveLength(1);
  expect(
    take.indexOf(tells[0] as string),
    'the tell landed after the PLAY — the page snapshots its count at play()',
  ).toBeLessThan(take.indexOf(plays[0] as string));
  return tells[0] as string;
}

async function stopped(r: CasparRuntime, itemId: string): Promise<void> {
  expect((await r.stopItem(itemId)).accepted).toBe(true);
}

describe('🔴 B-322 — the resident take carries the recorded pass timing', () => {
  it("the owner's sequence: count 1 on air → stop → Until stop → take", async () => {
    const r = await boot();
    await r.load('logo', 'looper', {});
    expect((await r.take('logo')).accepted).toBe(true);
    expect((await r.setPassTiming('logo', { passes: 1 })).ok).toBe(true);
    await stopped(r, 'logo');

    // Off air: recorded, and ZERO AMCP — golden rule 10 is unchanged by this fix.
    const beforeSet = (await recvLines()).length;
    expect((await r.setPassTiming('logo', { passes: 'infinite' })).ok).toBe(true);
    expect(
      matching(await since(beforeSet), /^(CG|MIXER|PLAY|LOADBG|LOAD|CLEAR) /),
      'an off-air Update reached the wire',
    ).toEqual([]);

    const tell = await residentTake(r, 'logo');
    const control = controlOf(tell);
    expect(
      control?.['timing'],
      `the resident take told the page no timing — it re-runs the stale count. The tell: ${tell}`,
    ).toEqual({ passes: 'infinite' });
    expect(control?.['take'], 'the token no longer rides the tell').toMatch(/^[0-9a-f]{32}$/);
  });

  it('the gap rides too — both members of the recorded timing', async () => {
    const r = await boot();
    await r.load('logo', 'looper', {});
    expect((await r.take('logo')).accepted).toBe(true);
    await stopped(r, 'logo');
    expect((await r.setPassTiming('logo', { passes: 3, delayMs: 800 })).ok).toBe(true);

    expect(controlOf(await residentTake(r, 'logo'))?.['timing']).toEqual({
      passes: 3,
      delayMs: 800,
    });
  });

  it('a count set after LOAD and before the first take rides that take too', async () => {
    // The same hole on the FIRST take: `load` ADDs, so the take finds the producer resident and
    // sends the tell, not an ADD. A count recorded between the two reached nothing.
    const r = await boot();
    await r.load('logo', 'looper', {});
    expect((await r.setPassTiming('logo', { passes: 2 })).ok).toBe(true);

    expect(controlOf(await residentTake(r, 'logo'))?.['timing']).toEqual({ passes: 2 });
  });

  it('the OTHER route still carries it: out → Until stop → take re-ADDs with timing', async () => {
    // Pinned so the two routes cannot drift apart again: the re-ADD is `#sendAdd`'s payload,
    // the tell is `#tellPageTake`'s, and both are built by one helper.
    const r = await boot();
    await r.load('logo', 'looper', {});
    expect((await r.take('logo')).accepted).toBe(true);
    expect((await r.setPassTiming('logo', { passes: 1 })).ok).toBe(true);
    expect((await r.out('logo')).accepted).toBe(true);
    expect((await r.setPassTiming('logo', { passes: 'infinite' })).ok).toBe(true);

    const before = (await recvLines()).length;
    expect((await r.take('logo')).accepted).toBe(true);
    const take = await since(before);

    const adds = matching(take, ADD);
    expect(adds, 'the take after out did not rebuild the page').toHaveLength(1);
    expect(controlOf(adds[0])?.['timing']).toEqual({ passes: 'infinite' });
    expect(matching(take, PLAY), 'the take did not send exactly one CG PLAY').toHaveLength(1);
  });

  it("a row with NO override sends today's tell, byte for byte", async () => {
    const r = await boot();
    await r.load('logo', 'looper', {});
    expect((await r.take('logo')).accepted).toBe(true);
    await stopped(r, 'logo');

    const tell = await residentTake(r, 'logo');
    // The exact shape every 0.11.4 take after a stop sent: the token and nothing else.
    expect(tell.trim()).toMatch(
      /^CG \d+-\d+ UPDATE 0 "\{\\"__cg\\":\{\\"take\\":\\"[0-9a-f]{32}\\"\}\}"$/,
    );
  });

  it('a template that does not admit pass timing is told none, even with one recorded', async () => {
    const r = await boot();
    await r.load('tick', 'ticker', {});
    expect((await r.take('tick')).accepted).toBe(true);
    // Accepted and recorded (`PASSES-CYCLE-ONLY-26`) — and it must not cross on either route.
    expect((await r.setPassTiming('tick', { passes: 2 })).ok).toBe(true);
    await stopped(r, 'tick');

    const control = controlOf(await residentTake(r, 'tick'));
    expect(control?.['timing'], "the ticker's tell carried a count for its blinking dot").toBe(
      undefined,
    );
    expect(control?.['take'], 'the gate took the token with it').toMatch(/^[0-9a-f]{32}$/);
  });
});
