import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { readCgControl } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q9 — **A ROW'S TEMPLATE-SOUND MUTE, ON THE WIRE.** A configuration verb
 * (golden rule 10): off air it sends NOTHING and the next take carries it; on air one `CG UPDATE`
 * carries only `__cg.sound`. Every assertion is on the AMCP trace — a map that holds the mute and
 * never sends it is the failure this exists to prevent. That the PAGE obeys the member is
 * `template-runtime`'s `cg-control-sound.test.ts`.
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

const AZAN: TemplateInfo = { templateId: 'azan', templateType: 'azan', fields: [], hasSound: true };

async function boot(): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-soundwire-${String(process.pid)}-${String(Date.now())}-${String(
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
  r.templateImport(AZAN, '<!doctype html><html></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  return r;
}

async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return readWireLines(tracePath);
}

const since = async (before: number): Promise<string[]> => (await recvLines()).slice(before);

/** The `__cg` control of the LAST `CG … <verb>` in a trace slice, or undefined. */
function lastControl(
  lines: readonly string[],
  verb: 'ADD' | 'UPDATE',
): Record<string, unknown> | undefined {
  const line = [...lines].reverse().find((l) => new RegExp(`CG \\d+-\\d+ ${verb} `).test(l));
  if (line === undefined) return undefined;
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line.trim());
  if (quoted?.[1] === undefined) return undefined;
  const json = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try {
    return readCgControl(JSON.parse(json) as unknown) as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const published = (r: CasparRuntime, itemId: string) =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.soundMuted;

describe('🔴 Q9 — a row muted OFF AIR: nothing on the wire, and the take carries it', () => {
  it('records, publishes, sends nothing; both routes into air then carry __cg.sound muted', async () => {
    const r = await boot();
    // The load pre-rolls the page (its `CG ADD`), so the first take is the RESIDENT route.
    await r.load('row-1', 'azan', {});
    const before = (await recvLines()).length;
    expect(await r.setSoundMuted('row-1', true)).toEqual({ ok: true });
    expect(published(r, 'row-1')).toBe(true);
    expect(
      (await since(before)).filter((l) => /^(CG|PLAY|MIXER)/.test(l.trim())),
      'an off-air mute reached the wire',
    ).toEqual([]);

    // Resident route: the tell before the `CG PLAY` carries it.
    let atTake = (await recvLines()).length;
    expect((await r.take('row-1')).accepted).toBe(true);
    expect(lastControl(await since(atTake), 'UPDATE')?.['sound']).toEqual({ muted: true });

    // ADD route: out, then take — the rebuilt page's `CG ADD` carries it.
    expect((await r.out('row-1')).accepted).toBe(true);
    atTake = (await recvLines()).length;
    expect((await r.take('row-1')).accepted).toBe(true);
    const add = lastControl(await since(atTake), 'ADD');
    expect(add, 'no ADD was sent — nothing below is measured').toBeDefined();
    expect(add?.['sound']).toEqual({ muted: true });
  });

  it('a row never muted carries no sound member: its wire is what it was', async () => {
    const r = await boot();
    await r.load('row-1', 'azan', {});
    expect((await r.take('row-1')).accepted).toBe(true);
    expect((await r.out('row-1')).accepted).toBe(true);
    const before = (await recvLines()).length;
    expect((await r.take('row-1')).accepted).toBe(true);
    const control = lastControl(await since(before), 'ADD');
    expect(control, 'no ADD was sent — nothing below is measured').toBeDefined();
    expect(control?.['sound']).toBeUndefined();
    expect(published(r, 'row-1')).toBeUndefined();
  });
});

describe('🔴 Q9 — a row ON AIR: one CG UPDATE carrying only the mute', () => {
  it('mute, then unmute, each one UPDATE with __cg.sound and nothing else', async () => {
    const r = await boot();
    await r.load('row-1', 'azan', {});
    expect((await r.take('row-1')).accepted).toBe(true);

    let before = (await recvLines()).length;
    expect(await r.setSoundMuted('row-1', true)).toEqual({ ok: true });
    let lines = await since(before);
    expect(lines.filter((l) => /CG \d+-\d+ (PLAY|ADD)/.test(l))).toEqual([]);
    expect(lastControl(lines, 'UPDATE')).toEqual({ sound: { muted: true } });
    expect(published(r, 'row-1')).toBe(true);

    before = (await recvLines()).length;
    expect(await r.setSoundMuted('row-1', false)).toEqual({ ok: true });
    lines = await since(before);
    expect(lastControl(lines, 'UPDATE')).toEqual({ sound: { muted: false } });
    expect(published(r, 'row-1')).toBe(false);
  });

  it('stopped, muted, taken again: the resident page is told the mute before its PLAY', async () => {
    const r = await boot();
    await r.load('row-1', 'azan', {});
    expect((await r.take('row-1')).accepted).toBe(true);
    await r.stopItem('row-1');
    expect(await r.setSoundMuted('row-1', true)).toEqual({ ok: true });
    const before = (await recvLines()).length;
    expect((await r.take('row-1')).accepted).toBe(true);
    const lines = await since(before);
    // The resident route: a tell (`CG UPDATE`) before the `CG PLAY`, carrying the mute.
    expect(lastControl(lines, 'UPDATE')?.['sound']).toEqual({ muted: true });
  });

  it('an unknown row is refused and records nothing', async () => {
    const r = await boot();
    expect(await r.setSoundMuted('nobody', true)).toMatchObject({
      ok: false,
      reason: 'unknown-item',
    });
  });
});
