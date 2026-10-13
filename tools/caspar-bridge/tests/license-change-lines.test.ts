import { describe, expect, it } from 'vitest';
import { PlayoutCatalogue } from '../src/playout-catalogue.js';
import { PlayoutLicenseReader } from '../src/playout-license.js';

/**
 * 🔴 `DONGLE-RECOVER-01` A2 — **AN OUTAGE DOCUMENTS ITSELF.** The owner's 2026-10-11 dongle test left
 * no record of when the bridge saw the license change: the reader only published. Each reader now
 * prints ONE line per change of what a take reads — the license's fields, and D4's per-channel
 * `playlist` / `cgLicensed` — and NOTHING while it does not change. Both halves are pinned: a line
 * per change, and zero lines across many unchanged reads (the control that the reader did read).
 */

/** A fetch that answers each call with the next scripted body (`'fail'` — unreachable). */
function scripted(bodies: readonly (unknown | 'fail')[]): {
  fetchImpl: typeof fetch;
  calls: () => number;
} {
  let n = 0;
  const fetchImpl = ((): Promise<Response> => {
    const body = bodies[Math.min(n, bodies.length - 1)];
    n += 1;
    if (body === 'fail') return Promise.reject(new Error('ECONNREFUSED'));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
  return { fetchImpl, calls: () => n };
}

/** `count` reads, the clock moved past the reader's floor after each one. */
async function readEach(
  count: number,
  read: () => Promise<void>,
  advance: () => void,
): Promise<void> {
  for (let left = count; left > 0; left -= 1) {
    await read();
    advance();
  }
}

const LICENSED = { licensed: true, reason: null, playoutState: 'valid', maxChannels: null };
const MISSING = {
  licensed: false,
  reason: 'missing',
  message: 'دانگلِ لایسنسِ Playout خوانده نمی‌شود.',
  playoutState: 'missing',
  maxChannels: null,
};

describe('DONGLE-RECOVER-01 A2 — the license line', () => {
  it('prints one line per change, with the time and the fields a take reads — none for repeats; control: every read happened', async () => {
    let now = Date.parse('2026-10-11T06:30:00.000Z');
    const lines: string[] = [];
    const answers = [LICENSED, LICENSED, MISSING, MISSING, MISSING, LICENSED, LICENSED];
    const { fetchImpl, calls } = scripted(answers);
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl,
      now: () => now,
      log: (line) => lines.push(line),
    });
    await readEach(
      answers.length,
      () => reader.refresh(),
      () => (now += 61_000),
    );
    expect(calls(), 'CONTROL — every scripted read was made').toBe(answers.length);
    expect(lines).toEqual([
      'Playout license: licensed=true reason=- playoutState=valid graceUntil=- maxChannels=- (read 2026-10-11T06:30:00.000Z)',
      'Playout license: licensed=false reason=missing playoutState=missing graceUntil=- maxChannels=- (read 2026-10-11T06:32:02.000Z)',
      'Playout license: licensed=true reason=- playoutState=valid graceUntil=- maxChannels=- (read 2026-10-11T06:35:05.000Z)',
    ]);
    // No token and no Playout sentence ever reach the log.
    expect(lines.join('\n')).not.toMatch(/tok|دانگل/);
  });

  it('prints nothing across many unchanged reads, nor for an unreachable Playout (the value is kept) — control: the reads happened', async () => {
    let now = 0;
    const lines: string[] = [];
    const answers = [LICENSED, 'fail', LICENSED, 'fail', 'fail', LICENSED, LICENSED, LICENSED];
    const { fetchImpl, calls } = scripted(answers);
    const reader = new PlayoutLicenseReader('http://playout.invalid/api/cg/license', () => 'tok', {
      fetchImpl,
      now: () => now,
      log: (line) => lines.push(line),
    });
    await readEach(
      answers.length,
      () => reader.refresh(),
      () => (now += 61_000),
    );
    expect(calls()).toBe(answers.length);
    expect(lines).toHaveLength(1);
    expect(reader.license()?.licensed).toBe(true);
  });
});

const row = (playlist: string | undefined, cgLicensed: boolean | undefined) => ({
  id: 'ch-1',
  name: 'شبکه ۱',
  casparHost: '127.0.0.1',
  casparChannel: 1,
  ...(playlist !== undefined ? { playlist } : {}),
  ...(cgLicensed !== undefined ? { cgLicensed } : {}),
});

describe('DONGLE-RECOVER-01 A2 — D4’s per-channel license words', () => {
  it('prints one line when a channel’s `playlist` or `cgLicensed` changes — none when only other fields move, none across a failed read', async () => {
    let now = Date.parse('2026-10-11T06:40:00.000Z');
    const lines: string[] = [];
    const answers = [
      { channels: [row('playing', true)] },
      // Another field moves: no line.
      { channels: [{ ...row('playing', true), videoMode: '1080i5000' }] },
      { channels: [{ ...row('unlicensed', true), videoMode: '1080i5000' }] },
      // Unreachable: D4 goes ABSENT — not a license change.
      'fail',
      { channels: [{ ...row('unlicensed', true), videoMode: '1080i5000' }] },
      { channels: [{ ...row('unlicensed', false), videoMode: '1080i5000' }] },
      { channels: [{ ...row('playing', true), videoMode: '1080i5000' }] },
    ];
    const { fetchImpl, calls } = scripted(answers);
    const catalogue = new PlayoutCatalogue('http://playout.invalid/api/cg/channels', () => 'tok', {
      fetchImpl,
      now: () => now,
      log: (line) => lines.push(line),
    });
    await readEach(
      answers.length,
      () => catalogue.refresh(),
      () => (now += 6_000),
    );
    expect(calls(), 'CONTROL — every scripted read was made').toBe(answers.length);
    expect(lines).toEqual([
      'Playout channel 127.0.0.1 1: playlist=playing cgLicensed=true (read 2026-10-11T06:40:00.000Z)',
      'Playout channel 127.0.0.1 1: playlist=unlicensed cgLicensed=true (read 2026-10-11T06:40:12.000Z)',
      'Playout channel 127.0.0.1 1: playlist=unlicensed cgLicensed=false (read 2026-10-11T06:40:30.000Z)',
      'Playout channel 127.0.0.1 1: playlist=playing cgLicensed=true (read 2026-10-11T06:40:36.000Z)',
    ]);
  });

  it('prints nothing across many unchanged reads — control: the reads happened', async () => {
    let now = 0;
    const lines: string[] = [];
    const answers = Array.from({ length: 12 }, () => ({ channels: [row('playing', true)] }));
    const { fetchImpl, calls } = scripted(answers);
    const catalogue = new PlayoutCatalogue('http://playout.invalid/api/cg/channels', () => 'tok', {
      fetchImpl,
      now: () => now,
      log: (line) => lines.push(line),
    });
    await readEach(
      answers.length,
      () => catalogue.refresh(),
      () => (now += 6_000),
    );
    expect(calls()).toBe(12);
    expect(lines).toHaveLength(1);
  });
});
