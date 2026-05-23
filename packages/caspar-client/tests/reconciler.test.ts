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

    // The ack hasn't arrived AND OSC hasn't reported. We force a re-evaluation
    // by applying an irrelevant ack on a different seq; pendingSince is set.
    now = 1500;
    r.applyAck(99, false); // unrelated
    // pendingSince was set at intent time (1000), now is 1500 → > 100 → divergent.
    // But emit only fires on item-changed; trigger another change:
    r.applyAck(2, false);

    expect(events.length).toBeGreaterThan(0);
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
