import { describe, expect, it } from 'vitest';
import type { OscEvent } from '@cg/shared-schema';
import { OscChannelTickTap } from '../src/osc/channel-tick-tap.js';

/**
 * 🔴 **`R-058` — "reachable" is not "working", and the trap that makes this hard.**
 *
 * The tap answers one question — _is this channel producing frames?_ — from the one signal on
 * the wire that carries it (`/channel/N/framerate`, emitted on every channel tick).
 *
 * ── WHAT THESE TESTS ARE REALLY GUARDING ────────────────────────────────────
 *
 * Not the arithmetic. The arithmetic is a subtraction. What is guarded is that **silence is
 * never read as evidence**: a channel that has NEVER ticked must be reported as nothing at
 * all, and a "no ticks within N ms" rule applied to such a channel would alarm on every
 * OSC-less install forever — `B-163`'s named trap, and the shape `B-101` shipped (OSC silence
 * read as AMCP death) and `B-053` shipped again (OSC silence read as an empty layer).
 *
 * The tap makes that unrepresentable rather than defended: a channel enters the map only by
 * TICKING. So the assertions below are about the SHAPE of the answer as much as its value.
 */

const tick = (channel: number): OscEvent =>
  ({ kind: 'osc.framerate', channel, num: 50, den: 1 }) as OscEvent;
const producer = (channel: number, layer: number): OscEvent =>
  ({ kind: 'osc.producer', channel, layer, producer: 'html' }) as OscEvent;

const STALE = 3000;

describe('R-058 — OscChannelTickTap: never-ticked vs ticked-and-stopped', () => {
  it('🔴 a channel that has NEVER ticked is ABSENT — not `ticking: false`', () => {
    const tap = new OscChannelTickTap();
    // The whole safety property. `false` here would be an alarm about a channel we have no
    // evidence about at all, which is the trap this class exists to make impossible.
    expect(tap.channels(STALE, 10_000)).toEqual([]);
    expect(tap.lastTickFor(1)).toBeNull();
  });

  it('🔴 an install that sends OSC but never a framerate stays silent, however long we wait', () => {
    const tap = new OscChannelTickTap();
    // Producer events ARE arriving — the server is not deaf — and still no channel is claimed.
    tap.note(producer(1, 10), 1000);
    tap.note(producer(1, 20), 2000);
    expect(tap.channels(STALE, 9_999_999)).toEqual([]);
  });

  it('a channel that ticked recently reads as ticking', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(1), 10_000);
    expect(tap.channels(STALE, 11_000)).toEqual([{ channel: 1, ticking: true }]);
  });

  it('🔴 a channel that ticked and STOPPED reads as not ticking — this is the alarm', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(1), 10_000);
    expect(tap.channels(STALE, 10_000 + STALE + 1)).toEqual([{ channel: 1, ticking: false }]);
  });

  it('the boundary is inclusive — exactly `staleMs` since the last tick is still ticking', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(1), 10_000);
    expect(tap.channels(STALE, 10_000 + STALE)).toEqual([{ channel: 1, ticking: true }]);
  });

  it('a resumed tick clears it', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(1), 10_000);
    expect(tap.channels(STALE, 20_000)[0]?.ticking).toBe(false);
    tap.note(tick(1), 20_100);
    expect(tap.channels(STALE, 20_200)).toEqual([{ channel: 1, ticking: true }]);
  });

  it('channels are independent, and reported in a stable order', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(3), 10_000);
    tap.note(tick(1), 10_000);
    tap.note(tick(2), 1000); // stopped long ago
    expect(tap.channels(STALE, 11_000)).toEqual([
      { channel: 1, ticking: true },
      { channel: 2, ticking: false },
      { channel: 3, ticking: true },
    ]);
  });

  it('🔴 reset returns every channel to NEVER-SEEN, so a reconnect cannot manufacture an alarm', () => {
    const tap = new OscChannelTickTap();
    tap.note(tick(1), 10_000);
    tap.reset();
    // NOT `[{ channel: 1, ticking: false }]` — after a reconnect we have no evidence about
    // channel 1, and reporting it stopped would be an alarm we invented ourselves.
    expect(tap.channels(STALE, 20_000)).toEqual([]);
  });
});
