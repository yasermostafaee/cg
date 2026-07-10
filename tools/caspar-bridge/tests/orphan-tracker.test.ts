import { describe, expect, it } from 'vitest';
import { OrphanTracker, type SweptLayer } from '../src/orphan-tracker.js';

/**
 * R-009 — the pure orphan-debounce machine: surface after 2 consecutive
 * sightings, resolve after 1 empty/aged-out sweep, owned keys subtracted,
 * change-only reporting (idle sweeps are silent).
 */

const html = (channel: number, layer: number): SweptLayer => ({ channel, layer, producer: 'html' });
const NONE: ReadonlySet<string> = new Set();

describe('OrphanTracker', () => {
  it('surfaces only after 2 consecutive sightings (debounce-in)', () => {
    const t = new OrphanTracker();
    expect(t.update([html(1, 77)], NONE)).toEqual({ changed: false });
    expect(t.orphans()).toEqual([]);
    const second = t.update([html(1, 77)], NONE);
    expect(second.changed).toBe(true);
    expect(t.orphans()).toMatchObject([{ channel: 1, layer: 77, producer: 'html' }]);
  });

  it('a single-sweep blip never surfaces and never reports change', () => {
    const t = new OrphanTracker();
    expect(t.update([html(1, 77)], NONE).changed).toBe(false);
    expect(t.update([], NONE).changed).toBe(false); // blip gone — sighting dropped
    expect(t.update([html(1, 77)], NONE).changed).toBe(false); // starts over at 1
    expect(t.orphans()).toEqual([]);
  });

  it('resolves after ONE sweep without a sighting (debounce-out)', () => {
    const t = new OrphanTracker();
    t.update([html(1, 77)], NONE);
    t.update([html(1, 77)], NONE);
    expect(t.orphans()).toHaveLength(1);
    const resolved = t.update([], NONE);
    expect(resolved.changed).toBe(true);
    expect(t.orphans()).toEqual([]);
  });

  it('owned layers are subtracted before any sighting is recorded', () => {
    const t = new OrphanTracker();
    const owned = new Set(['1:10']);
    t.update([html(1, 10), html(1, 77)], owned);
    t.update([html(1, 10), html(1, 77)], owned);
    expect(t.orphans()).toMatchObject([{ channel: 1, layer: 77 }]);
  });

  it('reports change ONLY when the surfaced set differs (idle sweeps silent)', () => {
    const t = new OrphanTracker();
    t.update([html(1, 77)], NONE);
    expect(t.update([html(1, 77)], NONE).changed).toBe(true); // surfaced
    expect(t.update([html(1, 77)], NONE).changed).toBe(false); // steady state
    expect(t.update([html(1, 77)], NONE).changed).toBe(false);
  });

  it('`since` is stable across sweeps once surfaced', () => {
    const t = new OrphanTracker();
    t.update([html(1, 77)], NONE);
    t.update([html(1, 77)], NONE);
    const first = t.orphans()[0]?.since;
    t.update([html(1, 77)], NONE);
    expect(t.orphans()[0]?.since).toBe(first);
  });

  it('a producer change on a surfaced orphan reports change', () => {
    const t = new OrphanTracker();
    t.update([html(1, 77)], NONE);
    t.update([html(1, 77)], NONE);
    const changed = t.update([{ channel: 1, layer: 77, producer: 'ffmpeg' }], NONE);
    expect(changed.changed).toBe(true);
    expect(t.orphans()[0]?.producer).toBe('ffmpeg');
  });

  it('reset() clears everything and reports change only if something was surfaced', () => {
    const empty = new OrphanTracker();
    expect(empty.reset().changed).toBe(false);
    const t = new OrphanTracker();
    t.update([html(1, 77)], NONE);
    t.update([html(1, 77)], NONE);
    expect(t.reset().changed).toBe(true);
    expect(t.orphans()).toEqual([]);
  });

  it('sorts surfaced orphans by channel then layer', () => {
    const t = new OrphanTracker();
    const batch = [html(2, 5), html(1, 90), html(1, 12)];
    t.update(batch, NONE);
    t.update(batch, NONE);
    expect(t.orphans().map((o) => `${String(o.channel)}:${String(o.layer)}`)).toEqual([
      '1:12',
      '1:90',
      '2:5',
    ]);
  });
});
