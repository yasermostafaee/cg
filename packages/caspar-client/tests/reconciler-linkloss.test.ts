import { describe, expect, it } from 'vitest';
import type { Intent, OscEvent } from '@cg/shared-schema';
import { Reconciler } from '../src/index.js';

/**
 * B-086 — honest ON AIR across a CasparCG link-loss. When the link drops, an on-air item must
 * stop asserting the red "● ON AIR" (a claim the wire no longer backs) and read the muted
 * `unverified` ("WAS ON AIR"). On reconnect it restores from resumed OSC, or resets to idle if
 * the layer is empty. The on-air REFUSAL is elsewhere (the bridge) and unchanged.
 */

const ITEM = 'item-1';
const SLOT = { channel: 1, layer: 10, server: 'primary' as const };
const loadIntent: Intent = { kind: 'load', itemId: ITEM, templateId: 'tpl-1', fields: {} };
const producer = (kind: 'html' | 'empty'): OscEvent => ({
  kind: 'osc.layer.foreground.producer',
  channel: 1,
  layer: 10,
  producer: kind,
});

/** An item taken on air with a FRESH OSC observation at `t`. */
function onAir(now: () => number): Reconciler {
  const r = new Reconciler({ now });
  r.applyIntent(loadIntent, 1);
  r.assignSlot(ITEM, SLOT);
  r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
  r.applyAck(2, true);
  r.applyOsc(producer('html'));
  expect(r.get(ITEM)?.status).toBe('on-air');
  return r;
}

describe('Reconciler — B-086 link-loss honesty', () => {
  it('an ON AIR item becomes UNVERIFIED when the link drops — not red, not idle', () => {
    const r = onAir(() => 1000);
    const changed = r.setLinkDown(true);

    expect(r.get(ITEM)?.status).toBe('unverified');
    // The re-publish the event-driven reconciler otherwise never emits.
    expect(changed.map((s) => s.itemId)).toEqual([ITEM]);
    expect(r.isLinkDown).toBe(true);
  });

  it('the stale `playing` FLOOR (which renders identically to on-air) also becomes UNVERIFIED', () => {
    let now = 1000;
    const r = onAir(() => now);
    now = 5000; // OSC truth decays → the ladder falls to the red `playing` floor
    expect(r.get(ITEM)?.status).toBe('playing');

    r.setLinkDown(true);
    expect(r.get(ITEM)?.status).toBe('unverified');
  });

  it('does NOT demote a non-on-air item, and never touches the amber `unconfirmed` (B-044)', () => {
    const r = new Reconciler({ now: () => 1000 });
    // A loaded-not-taken item.
    r.applyIntent(loadIntent, 1);
    // An item whose command timed out → the item-scoped `unconfirmed` (a DIFFERENT condition).
    r.applyIntent({ kind: 'load', itemId: 'item-2', templateId: 'tpl-1', fields: {} }, 2);
    r.applyIntent({ kind: 'update', itemId: 'item-2', fields: { a: '1' }, mergeMode: 'merge' }, 3);
    r.expireIntent(3);
    expect(r.get('item-2')?.status).toBe('unconfirmed');

    r.setLinkDown(true);
    expect(r.get(ITEM)?.status).toBe('loaded'); // untouched
    expect(r.get('item-2')?.status).toBe('unconfirmed'); // still amber ack-timeout, not unverified
  });

  it('restores to ON AIR on reconnect when the producer is still there (resumed OSC)', () => {
    let now = 1000;
    const r = onAir(() => now);
    now = 5000;
    r.setLinkDown(true);
    expect(r.get(ITEM)?.status).toBe('unverified');

    // Reconnect: OSC resumes announcing the still-present producer, then the bridge clears the
    // flag and reconciles occupancy (the layer IS occupied).
    now = 6000;
    r.applyOsc(producer('html'));
    r.setLinkDown(false);
    r.reconcileOnReconnect(new Set(['1:10']));

    expect(r.get(ITEM)?.status).toBe('on-air');
  });

  it('resets to IDLE on reconnect when the layer is empty (producer gone, e.g. restart)', () => {
    let now = 1000;
    const r = onAir(() => now);
    now = 5000;
    r.setLinkDown(true);
    expect(r.get(ITEM)?.status).toBe('unverified');

    // Reconnect but the layer stays SILENT (no OSC for it) → not in the occupied set → reset.
    now = 6000;
    r.setLinkDown(false);
    const changed = r.reconcileOnReconnect(new Set()); // nothing occupied

    expect(r.get(ITEM)?.status).toBe('idle');
    expect(changed.map((s) => s.itemId)).toEqual([ITEM]);
    // A reset item is no longer `played` — reconciling again is a no-op.
    expect(r.reconcileOnReconnect(new Set())).toEqual([]);
  });

  it('setLinkDown is idempotent and returns nothing when the state is unchanged', () => {
    const r = onAir(() => 1000);
    expect(r.setLinkDown(false)).toEqual([]); // already up
    r.setLinkDown(true);
    expect(r.setLinkDown(true)).toEqual([]); // already down
  });
});
