import { describe, expect, it, vi } from 'vitest';
import type { Intent, OscEvent, StackItemState } from '@cg/shared-schema';
import { Reconciler } from '../src/index.js';

const itemId = (n: number): string => `item-${String(n)}`;
const templateId = 'tpl-1';

function loadIntent(n: number, fields: Record<string, string> = {}): Intent {
  return { kind: 'load', itemId: itemId(n), templateId, fields };
}

describe('Reconciler — load + take + out lifecycle', () => {
  it('load() creates an item in idle/loaded state with intent visible', () => {
    const r = new Reconciler();
    const s = r.applyIntent(loadIntent(1, { title: 'hello' }), 1);
    expect(s).toMatchObject({ itemId: 'item-1', status: 'loaded', pending: false });
  });

  it('take() flips intent to playing and marks pending until confirmation', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    const s = r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    // Optimistic UI: status shows 'playing' immediately, pending=true until
    // AMCP ack or OSC truth confirms.
    expect(s).toMatchObject({ status: 'playing', pending: true });
  });

  it('ack(ok) bumps acked status; OSC truth overrides when fresh', () => {
    const now = vi.fn(() => 1000);
    const r = new Reconciler({ now });
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);

    r.applyAck(2, true);
    expect(r.get(itemId(1))).toMatchObject({ status: 'playing', pending: false });

    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    const osc: OscEvent = {
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    };
    r.applyOsc(osc);
    expect(r.get(itemId(1))).toMatchObject({ status: 'on-air', pending: false });
  });

  it("ack(err) marks the item 'error' with the supplied code", () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyAck(1, false, 'amcp-500');
    expect(r.get(itemId(1))).toMatchObject({ status: 'error', errorCode: 'amcp-500' });
  });

  it('out() flips intent to exiting; remove() removes the item', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 2);
    expect(r.get(itemId(1))).toMatchObject({ status: 'exiting' });
    r.applyIntent({ kind: 'remove', itemId: itemId(1) }, 3);
    expect(r.get(itemId(1))).toBeNull();
  });

  it('out({ immediate: true }) jumps straight to idle', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'out', itemId: itemId(1), immediate: true }, 2);
    expect(r.get(itemId(1))).toMatchObject({ status: 'idle' });
  });

  it('update merge replaces fields by mergeMode=replace', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1, { a: '1', b: '2' }), 1);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '9' }, mergeMode: 'merge' }, 2);
    expect(r.get(itemId(1))?.fields).toEqual({ a: '9', b: '2' });

    r.applyIntent(
      { kind: 'update', itemId: itemId(1), fields: { a: '7' }, mergeMode: 'replace' },
      3,
    );
    expect(r.get(itemId(1))?.fields).toEqual({ a: '7' });
  });
});

describe('Reconciler — merge rule', () => {
  it('prefers fresh OSC truth over the ack', () => {
    let now = 1000;
    const r = new Reconciler({ now: () => now });
    r.applyIntent(loadIntent(1), 1);
    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.applyAck(2, true);
    r.applyOsc({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'html',
    });
    expect(r.get(itemId(1))?.status).toBe('on-air');
    // Move time forward past the TTL — truth becomes stale and we fall back to ack.
    now = 3000;
    expect(r.get(itemId(1))?.status).toBe('playing');
  });

  it('falls back through truth → ack → intent', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    expect(r.get(itemId(1))?.status).toBe('loaded');
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    expect(r.get(itemId(1))?.status).toBe('playing');
    r.applyAck(2, true);
    expect(r.get(itemId(1))).toMatchObject({ status: 'playing', pending: false });
  });
});

describe('Reconciler — divergence detection', () => {
  it("emits 'item-divergent' when pending stays unresolved past the threshold", () => {
    let now = 1000;
    const r = new Reconciler({ divergentAfterMs: 100, now: () => now });
    const events: { itemId: string; intent: string; reconciled: string }[] = [];
    r.on('item-divergent', (info) => events.push(info));

    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);

    // The take's ack never arrives. pendingSince was set at intent time (1000).
    now = 1500;
    r.applyAck(99, false); // unrelated seq — no item, no change, no emit

    // Divergence emits on an item-changed, so drive one that does NOT settle
    // the intent: the layer reports its producer EMPTY while we intended to
    // play — intent and truth have genuinely diverged (1500 - 1000 > 100).
    //
    // B-070 — this used to be triggered with `r.applyAck(2, false)` purely as
    // "any change". A failed ack no longer works as that trigger, because it
    // now SETTLES the intent: an errored command is a known, terminal failure
    // (surfaced as `error` + `errorCode`), not a silent divergence. Leaving it
    // non-terminal is exactly the zombie `pending` B-070 removed.
    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    const contradicts: OscEvent = {
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'empty',
    };
    r.applyOsc(contradicts);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ itemId: itemId(1), intent: 'playing' });
  });

  it('B-070 — an ERRORED command is a settled failure, NOT a divergence', () => {
    let now = 1000;
    const r = new Reconciler({ divergentAfterMs: 100, now: () => now });
    const events: { itemId: string }[] = [];
    r.on('item-divergent', (info) => events.push(info));

    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    now = 1500;
    r.applyAck(2, false, 'amcp-error');

    // The operator SEES the error; the item is settled and no longer pending,
    // so the divergence alarm (for SILENTLY unconfirmed intents) stays quiet.
    expect(r.get(itemId(1))).toMatchObject({ status: 'error', pending: false });
    expect(events).toEqual([]);
  });
});

describe('Reconciler — resync coordination', () => {
  it('queues non-immediate intents while suspended and drains on endResync', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.beginResync();
    const queued = r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    expect(queued).toBeNull();
    expect(r.queueDepth).toBe(1);

    r.endResync();
    expect(r.queueDepth).toBe(0);
    expect(r.get(itemId(1))?.status).toBe('playing');
  });

  it('passes immediate intents through even during resync', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.beginResync();
    // remove is immediate
    r.applyIntent({ kind: 'remove', itemId: itemId(1) }, 2);
    expect(r.get(itemId(1))).toBeNull();
  });

  it('beginResync returns the snapshot of allocated slots', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    const snapshot = r.beginResync();
    expect(snapshot).toEqual([
      {
        itemId: 'item-1',
        slot: { channel: 1, layer: 10, server: 'primary' },
        intent: 'playing',
      },
    ]);
  });
});

describe('Reconciler — unexpected-onair detection', () => {
  it("emits when OSC reports occupancy on a slot we don't own", () => {
    const r = new Reconciler();
    const events: { slot: { channel: number; layer: number } }[] = [];
    r.on('unexpected-onair', (info) => events.push(info));
    r.applyOsc({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 95,
      producer: 'html',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.slot).toMatchObject({ channel: 1, layer: 95 });
  });

  it('does not emit unexpected-onair for empty producers', () => {
    const r = new Reconciler();
    let fired = false;
    r.on('unexpected-onair', () => (fired = true));
    r.applyOsc({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 95,
      producer: 'empty',
    });
    expect(fired).toBe(false);
  });
});

describe('Reconciler — snapshot + slot index', () => {
  it('snapshot lists all items', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent(loadIntent(2), 2);
    expect(r.snapshot()).toHaveLength(2);
  });

  it('assignSlot rebinding moves the slot index', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    r.assignSlot(itemId(1), { channel: 1, layer: 11, server: 'primary' });
    // Old slot is now free; OSC on layer 10 doesn't route to item 1.
    let stateOnLayer10: StackItemState | null = null;
    r.on('item-changed', (s) => {
      if (s.slot?.layer === 10) stateOnLayer10 = s;
    });
    r.applyOsc({
      kind: 'osc.layer.foreground.producer',
      channel: 1,
      layer: 10,
      producer: 'empty',
    });
    expect(stateOnLayer10).toBeNull();
  });
});

describe('Reconciler — null/no-op paths', () => {
  it('ack for unknown seq returns null without emitting', () => {
    const r = new Reconciler();
    expect(r.applyAck(999, true)).toBeNull();
  });

  it('take/out/update/remove for unknown itemId returns null', () => {
    const r = new Reconciler();
    expect(r.applyIntent({ kind: 'take', itemId: 'ghost' }, 1)).toBeNull();
    expect(r.applyIntent({ kind: 'out', itemId: 'ghost' }, 2)).toBeNull();
    expect(
      r.applyIntent({ kind: 'update', itemId: 'ghost', fields: {}, mergeMode: 'merge' }, 3),
    ).toBeNull();
    expect(r.applyIntent({ kind: 'remove', itemId: 'ghost' }, 4)).toBeNull();
  });

  it('lifecycle intents (failover/reconnect) are accepted but no-op per item', () => {
    const r = new Reconciler();
    expect(r.applyIntent({ kind: 'failover', reason: 'manual' }, 1)).toBeNull();
    expect(r.applyIntent({ kind: 'reconnect' }, 2)).toBeNull();
  });
});

describe('Reconciler — B-044 pending-intent completion (settle on ack, expire on timeout)', () => {
  /** Load + take + OK ack → the item rests acked-'playing' (renders ON AIR). */
  function onAirItem(r: Reconciler): void {
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.applyAck(2, true);
  }

  it('an in-flight update shows updating+pending (the previous ack no longer masks it)', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating', pending: true });
  });

  it('an OK ack settles updating back to the underlying playing state — never resting on updating', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    const s = r.applyAck(3, true);
    expect(s).toMatchObject({ status: 'playing', pending: false });
    expect(s?.errorCode).toBeUndefined();
  });

  it('an OK ack settles exiting to idle (the single CLEAR completes the out)', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    expect(r.get(itemId(1))).toMatchObject({ status: 'exiting', pending: true });
    expect(r.applyAck(3, true)).toMatchObject({ status: 'idle', pending: false });
  });

  it('back-to-back updates settle only on the LATEST ack; a stale ack never mutates state', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '2' }, mergeMode: 'merge' }, 4);
    // Stale ack for the superseded update: ignored, item stays in flight.
    expect(r.applyAck(3, true)).toBeNull();
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating', pending: true });
    // The latest update's ack settles to the ORIGINAL underlying state.
    expect(r.applyAck(4, true)).toMatchObject({ status: 'playing', pending: false });
  });

  it('a NAK routes to error (with code) instead of settling', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    expect(r.applyAck(3, false, 'amcp-403')).toMatchObject({
      status: 'error',
      errorCode: 'amcp-403',
    });
  });

  it('expireIntent lands an unacked update in unconfirmed — resting, pending=false, acked cleared', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    const s = r.expireIntent(3);
    expect(s).toMatchObject({ status: 'unconfirmed', pending: false, errorCode: 'unconfirmed' });
  });

  it('expireIntent works for an unacked out too', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    expect(r.expireIntent(3)).toMatchObject({ status: 'unconfirmed', pending: false });
  });

  it('a late OK ack after expiry settles honestly (the ack DID arrive)', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    r.expireIntent(3);
    expect(r.applyAck(3, true)).toMatchObject({ status: 'playing', pending: false });
  });

  it('expireIntent is a no-op once the ack settled the intent or a newer intent superseded it', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    r.applyAck(3, true);
    expect(r.expireIntent(3)).toBeNull(); // settled — nothing to expire
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '2' }, mergeMode: 'merge' }, 4);
    expect(r.expireIntent(3)).toBeNull(); // superseded — seq 4 owns the item
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating' });
  });

  it('a new operator intent overwrites unconfirmed', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 3);
    r.expireIntent(3);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '2' }, mergeMode: 'merge' }, 4);
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating', pending: true });
    // …and its ack settles to the last known underlying state.
    expect(r.applyAck(4, true)).toMatchObject({ status: 'playing', pending: false });
  });

  it('load ack is identity; take acks settle playing (mid-flight shows pending TAKING — the ack-invalidation refinement)', () => {
    const now = vi.fn(() => 1000);
    const r = new Reconciler({ now });
    r.applyIntent(loadIntent(1), 1);
    expect(r.applyAck(1, true)).toMatchObject({ status: 'loaded', pending: false });
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    expect(r.get(itemId(1))).toMatchObject({ status: 'playing', pending: true });
    expect(r.applyAck(2, true)).toMatchObject({ status: 'playing', pending: false });
  });
});

describe('Reconciler — B-053 producer existence is not play evidence', () => {
  const htmlOsc = (layer = 10): OscEvent => ({
    kind: 'osc.layer.foreground.producer',
    channel: 1,
    layer,
    producer: 'html',
  });
  const emptyOsc = (layer = 10): OscEvent => ({
    kind: 'osc.layer.foreground.producer',
    channel: 1,
    layer,
    producer: 'empty',
  });

  /** Load + OK ack + slot bound — the state right before the ADD's OSC report. */
  function loadedItem(r: Reconciler, layer = 10): void {
    r.applyIntent(loadIntent(1), 1);
    r.applyAck(1, true);
    r.assignSlot(itemId(1), { channel: 1, layer, server: 'primary' });
  }

  it("the first producer report on a load-only item reads 'loaded' (READY), never 'on-air' — and the published sequence proves it", () => {
    const now = 1000;
    const r = new Reconciler({ now: () => now });
    const published: string[] = [];
    r.on('item-changed', (s) => published.push(s.status));
    loadedItem(r);

    // CG ADD stage-played the hidden page; OSC reports producer='html'.
    const [state] = r.applyOsc(htmlOsc());
    expect(state).toMatchObject({ status: 'loaded', pending: false });
    expect(published).not.toContain('on-air');
    expect(published.at(-1)).toBe('loaded');
  });

  it("the badge does not revert-and-stick: still 'loaded' after truthTtlMs with NO further event", () => {
    let now = 1000;
    const r = new Reconciler({ now: () => now });
    loadedItem(r);
    r.applyOsc(htmlOsc());
    expect(r.get(itemId(1))?.status).toBe('loaded');

    // The pre-fix bug: published 'on-air', then the TTL decayed with no
    // re-publish — the sticky false badge. Post-fix the fresh-truth value
    // EQUALS the decayed value, so reads agree before and after.
    now = 2500; // past the 1s TTL
    expect(r.get(itemId(1))).toMatchObject({ status: 'loaded', pending: false });
  });

  it("a take within the fresh-observation window reads 'on-air' immediately (optimistic confirm preserved)", () => {
    let now = 1000;
    const r = new Reconciler({ now: () => now });
    loadedItem(r);
    r.applyOsc(htmlOsc());
    expect(r.get(itemId(1))?.status).toBe('loaded');

    now = 1500; // observation still fresh
    const s = r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    // The SAME observation now carries play evidence and confirms the take.
    expect(s).toMatchObject({ status: 'on-air', pending: false });
  });

  it("a resync re-observation derives per item: loaded-not-taken reads 'loaded', taken reads 'on-air'", () => {
    const r = new Reconciler();
    // item-1: loaded only, on layer 10.
    r.applyIntent(loadIntent(1), 1);
    r.applyAck(1, true);
    r.assignSlot(itemId(1), { channel: 1, layer: 10, server: 'primary' });
    // item-2: loaded + taken, on layer 11.
    r.applyIntent({ kind: 'load', itemId: itemId(2), templateId, fields: {} }, 2);
    r.applyAck(2, true);
    r.assignSlot(itemId(2), { channel: 1, layer: 11, server: 'primary' });
    r.applyIntent({ kind: 'take', itemId: itemId(2) }, 3);
    r.applyAck(3, true);

    // Post-reconnect resync: the change-tracker reset re-emits both layers.
    r.applyOsc(htmlOsc(10));
    r.applyOsc(htmlOsc(11));
    expect(r.get(itemId(1))?.status).toBe('loaded');
    expect(r.get(itemId(2))?.status).toBe('on-air');
  });

  it("play evidence survives an out: a producer surviving a taken item's CLEAR reads 'on-air' (never hide a live graphic)", () => {
    const r = new Reconciler();
    loadedItem(r);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.applyAck(2, true);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    r.applyAck(3, true); // settled idle (B-044)
    expect(r.get(itemId(1))?.status).toBe('idle');

    // e.g. the CLEAR landed only on the backup; the primary re-observes html.
    r.applyOsc(htmlOsc());
    expect(r.get(itemId(1))?.status).toBe('on-air');
  });

  it("an 'empty' observation still reads 'idle' regardless of play evidence", () => {
    const r = new Reconciler();
    loadedItem(r);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.applyAck(2, true);
    r.applyOsc(emptyOsc());
    expect(r.get(itemId(1))?.status).toBe('idle');
  });
});

describe('Reconciler — B-044 settle provenance (review findings: out targets never leak into updates)', () => {
  function onAirItem(r: Reconciler): void {
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    r.applyAck(2, true);
  }

  it("an update racing an IN-FLIGHT out never inherits the out's target: it settles playing (safe direction), not a permanent exiting", () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3); // CLEAR in flight
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 4);
    expect(r.applyAck(3, true)).toBeNull(); // the out's ack is stale — superseded
    // The update's OK ack must NOT rest on 'exiting' (the pre-fix disease) nor
    // claim 'idle' without evidence — 'playing' is the broadcast-safe landing.
    expect(r.applyAck(4, true)).toMatchObject({ status: 'playing', pending: false });
  });

  it("an update after an EXPIRED out settles playing — the out's unevidenced idle target never claims off-air", () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    r.expireIntent(3); // CLEAR unconfirmed — it may never have executed
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 4);
    expect(r.applyAck(4, true)).toMatchObject({ status: 'playing', pending: false });
  });

  it('a late CLEAR ack after an out expiry still rescues to idle (the ack IS the evidence)', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    r.expireIntent(3);
    expect(r.applyAck(3, true)).toMatchObject({ status: 'idle', pending: false });
  });

  it('an update from a RESTED idle item captures the evidenced idle and settles back to it', () => {
    const r = new Reconciler();
    onAirItem(r);
    r.applyIntent({ kind: 'out', itemId: itemId(1) }, 3);
    r.applyAck(3, true); // out completed: idle is EVIDENCED by the CLEAR's ack
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 4);
    expect(r.applyAck(4, true)).toMatchObject({ status: 'idle', pending: false });
    // …and a back-to-back update still inherits the evidenced idle.
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '2' }, mergeMode: 'merge' }, 5);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '3' }, mergeMode: 'merge' }, 6);
    expect(r.applyAck(6, true)).toMatchObject({ status: 'idle', pending: false });
  });
});

describe('Reconciler — B-070 a FAILED ack settles the intent (no zombie `pending`)', () => {
  it('a failed update ack lands terminal: status reports the error, pending CLEARS', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 2);
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating', pending: true });

    // Pre-B-070 this moved ONLY `ackedStatus`, leaving `intentStatus` at the
    // transient 'updating' FOREVER — `pending` never cleared, and R-011's
    // setPosition (which refuses while pending) was blocked for the item's life.
    const s = r.applyAck(2, false, 'amcp-403');
    expect(s).toMatchObject({ status: 'error', errorCode: 'amcp-403', pending: false });
  });

  it('a failed TAKE ack settles too — the zombie was never update-specific', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'take', itemId: itemId(1) }, 2);
    expect(r.get(itemId(1))).toMatchObject({ pending: true });

    expect(r.applyAck(2, false, 'amcp-error')).toMatchObject({
      status: 'error',
      errorCode: 'amcp-error',
      pending: false,
    });
  });

  it('a settled failure does not block the NEXT intent (the item is still usable)', () => {
    const r = new Reconciler();
    r.applyIntent(loadIntent(1), 1);
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '1' }, mergeMode: 'merge' }, 2);
    r.applyAck(2, false, 'amcp-403');

    // A fresh update after the failure behaves normally — and its OK ack
    // settles it back to the underlying resting state.
    r.applyIntent({ kind: 'update', itemId: itemId(1), fields: { a: '2' }, mergeMode: 'merge' }, 3);
    expect(r.get(itemId(1))).toMatchObject({ status: 'updating', pending: true });
    expect(r.applyAck(3, true)).toMatchObject({ status: 'loaded', pending: false });
  });
});
