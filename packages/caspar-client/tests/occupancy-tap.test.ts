import { describe, expect, it } from 'vitest';
import { OscOccupancyTap } from '../src/osc/occupancy-tap.js';

/**
 * R-009 — the passive occupancy tap: records only foreground.producer,
 * excludes empty and stale entries from occupied(), resets cleanly, and
 * stays bounded. Freshness is the load-bearing rule: real CasparCG goes
 * SILENT for a CLEARed layer (B-053), so ageing-out IS the empty signal.
 */

const producer = (channel: number, layer: number, name: string) =>
  ({ kind: 'osc.layer.foreground.producer', channel, layer, producer: name }) as const;

describe('OscOccupancyTap', () => {
  it('records producer events and reports fresh non-empty layers', () => {
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 60, 'html'), 1000);
    tap.note(producer(2, 5, 'ffmpeg'), 1200);
    const occ = tap.occupied(2500, 2000);
    expect(occ).toHaveLength(2);
    expect(occ).toContainEqual({ channel: 1, layer: 60, producer: 'html', at: 1000 });
    expect(occ).toContainEqual({ channel: 2, layer: 5, producer: 'ffmpeg', at: 1200 });
  });

  it('ignores non-producer events entirely', () => {
    const tap = new OscOccupancyTap();
    tap.note({ kind: 'osc.layer.foreground.paused', channel: 1, layer: 60, paused: false }, 1000);
    tap.note({ kind: 'osc.framerate', channel: 1, num: 50, den: 1 }, 1000);
    expect(tap.size).toBe(0);
  });

  it('an empty producer is not occupied (the mock reports-empty path)', () => {
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 60, 'html'), 1000);
    tap.note(producer(1, 60, 'empty'), 1500);
    expect(tap.occupied(10_000, 2000)).toEqual([]);
  });

  it('a stale entry is not occupied (the real-CasparCG goes-silent-on-CLEAR path)', () => {
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 60, 'html'), 1000);
    expect(tap.occupied(2500, 3000)).toHaveLength(1); // 2000ms old — fresh
    expect(tap.occupied(2500, 4000)).toEqual([]); // 3000ms old — aged out
  });

  it('the latest observation wins and refreshes the timestamp', () => {
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 60, 'html'), 1000);
    tap.note(producer(1, 60, 'html'), 5000);
    expect(tap.occupied(2500, 7000)).toEqual([
      { channel: 1, layer: 60, producer: 'html', at: 5000 },
    ]);
  });

  it('reset() forgets everything (reconnect ghosts die with the cycle)', () => {
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 60, 'html'), 1000);
    tap.reset();
    expect(tap.size).toBe(0);
    expect(tap.occupied(1_000_000, 1001)).toEqual([]);
  });

  it('stays bounded: the oldest entry is pruned past the soft cap', () => {
    const tap = new OscOccupancyTap();
    for (let i = 0; i < 2200; i++) {
      tap.note(producer(1, i, 'html'), i);
    }
    expect(tap.size).toBeLessThanOrEqual(2048);
    // The oldest entries (lowest timestamps) were the ones evicted.
    const occupied = tap.occupied(Number.MAX_SAFE_INTEGER, 2200);
    expect(occupied.some((o) => o.layer === 0)).toBe(false);
    expect(occupied.some((o) => o.layer === 2199)).toBe(true);
  });
});

/**
 * The blind-tap distinction. An empty entry map has TWO meanings — "every layer
 * is empty" and "I have never heard from this server" — and they demand opposite
 * actions from anything that acts on emptiness. Conflating them took a live
 * graphic off air (PR #353's hardware probe): a bridge restart against an
 * OSC-blind install read a LIVE layer as unoccupied and re-ADDed over it.
 */
describe('OscOccupancyTap — is it hearing OSC right now?', () => {
  it('starts blind: a tap that never heard a packet is not fresh', () => {
    const tap = new OscOccupancyTap();
    expect(tap.hasFreshOsc(2500, 2000)).toBe(false);
    expect(tap.lastOscTrafficAt).toBeNull();
    expect(tap.occupied(2500, 2000)).toEqual([]);
  });

  it('OSC TRAFFIC alone makes it fresh, even when no layer reports a producer', () => {
    // This is the case that makes traffic (not producer events) the right
    // signal: a healthy server whose layers are all empty emits only
    // channel-level messages (framerate, mixer) — verified on CasparCG 2.3.2.
    // Keying on producer events would make that indistinguishable from a blind
    // tap and would break the legitimate "layers really are empty" re-ADD path.
    const tap = new OscOccupancyTap();
    tap.noteTraffic(1000);
    expect(tap.hasFreshOsc(2500, 2000)).toBe(true);
    expect(tap.occupied(2500, 2000)).toEqual([]); // heard the server; nothing is on
  });

  it('note() does NOT imply traffic — only noteTraffic() does', () => {
    // The two signals are deliberately independent: `note()` records WHAT a
    // layer reports, `noteTraffic()` records THAT we are hearing the server.
    // The transport calls both per packet (transport.ts), which is the only
    // reason a real producer observation coincides with freshness — the tap
    // itself does not couple them, and this pins that.
    const tap = new OscOccupancyTap();
    tap.note(producer(1, 45, 'html'), 1000);
    expect(tap.hasFreshOsc(2500, 2000)).toBe(false);
    expect(tap.occupied(2500, 2000)).toHaveLength(1);

    tap.noteTraffic(1000);
    expect(tap.hasFreshOsc(2500, 2000)).toBe(true);
  });

  it('freshness DECAYS on the same window as occupied() — no sticky "heard once" bit', () => {
    // A one-shot flag would go permanently true on a single packet while the
    // entry map kept ageing out, so a tap that heard OSC once and then went
    // deaf would report "heard" while reporting every layer empty — re-arming
    // the re-ADD-over-a-live-producer this exists to prevent. Both decay together.
    const tap = new OscOccupancyTap();
    tap.noteTraffic(1000);
    tap.note(producer(1, 45, 'html'), 1000);

    expect(tap.hasFreshOsc(2500, 3000)).toBe(true); // 2000ms old — still hearing
    expect(tap.occupied(2500, 3000)).toHaveLength(1);

    expect(tap.hasFreshOsc(2500, 4000)).toBe(false); // 3000ms — went deaf
    expect(tap.occupied(2500, 4000)).toEqual([]); // …and the entry aged out WITH it
  });

  it('reset() clears it WITH the entries — a reconnect never inherits stale freshness', () => {
    // The signal answers "am I hearing THIS session's server?". Carrying it across
    // a resync would vouch for a server we have not heard from yet, which is the
    // false confidence it exists to prevent.
    const tap = new OscOccupancyTap();
    tap.noteTraffic(1000);
    tap.note(producer(1, 45, 'html'), 1000);
    expect(tap.hasFreshOsc(2500, 2000)).toBe(true);

    tap.reset();
    expect(tap.hasFreshOsc(2500, 2000)).toBe(false);
    expect(tap.lastOscTrafficAt).toBeNull();
    expect(tap.size).toBe(0);
    expect(tap.occupied(2500, 2000)).toEqual([]);

    // …and it goes fresh again once the new session is actually heard from.
    tap.noteTraffic(2000);
    expect(tap.hasFreshOsc(2500, 2000)).toBe(true);
  });
});
