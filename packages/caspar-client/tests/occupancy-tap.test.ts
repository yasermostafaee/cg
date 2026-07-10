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
