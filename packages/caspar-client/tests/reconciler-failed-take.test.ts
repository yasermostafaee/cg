import { describe, expect, it, vi } from 'vitest';
import type { Intent, OscEvent } from '@cg/shared-schema';
import { Reconciler } from '../src/index.js';

/**
 * B-079 — a failed take must retract the play evidence it claimed.
 *
 * The hole: `reconcileStatus` consults `freshTruth` (OSC) ABOVE the ack, and `played` is
 * set at INTENT time (B-053's contract). OSC is bound independently of AMCP and keeps
 * arriving across a dead link, so a take whose `CG PLAY` was REJECTED still read `on-air`
 * off any producer that happened to be on the layer — an orphan, or the producer from an
 * earlier `CG ADD`. Solid red ON AIR for a command that never reached CasparCG, with the
 * failed ack recorded on the record and then outranked.
 *
 * The fix is deliberately narrow: a failed take gives back the claim IT made, and nothing
 * else. Both directions are pinned below, because the dangerous mistake would be to
 * over-correct and DEMOTE a genuinely on-air item — a false `loaded` hides a live graphic,
 * which this codebase's own doctrine calls the worse error.
 */

const ITEM = 'item-1';

function loadIntent(fields: Record<string, string> = {}): Intent {
  return { kind: 'load', itemId: ITEM, templateId: 'tpl-1', fields };
}

const PRODUCER_PRESENT: OscEvent = {
  kind: 'osc.layer.foreground.producer',
  channel: 1,
  layer: 10,
  producer: 'html',
};

/** A reconciler with a frozen clock, an item loaded, its slot assigned, and fresh OSC. */
function loadedWithFreshProducer(): Reconciler {
  const r = new Reconciler({ now: vi.fn(() => 1000) });
  r.applyIntent(loadIntent(), 1);
  r.assignSlot(ITEM, { channel: 1, layer: 10, server: 'primary' });
  r.applyOsc(PRODUCER_PRESENT);
  return r;
}

describe('B-079 — a failed take does not read on-air off a stale producer', () => {
  it('B-053 regression guard: a producer present but NEVER taken still reads loaded', () => {
    const r = loadedWithFreshProducer();

    // The whole B-053 contract, unchanged: producer existence is not play evidence.
    expect(r.get(ITEM)).toMatchObject({ status: 'loaded' });
  });

  it('take + FAILED ack + fresh producer ⇒ loaded, NOT on-air', () => {
    const r = loadedWithFreshProducer();

    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    // Optimistically on air off the still-fresh load-time observation (B-053's confirm)…
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });

    // …then the CG PLAY is rejected — the link is dead, it never reached CasparCG.
    r.applyAck(2, false, 'amcp-send-failed');

    // The producer IS there (it was ADDed), but it was never PLAYED. `loaded` is the truth.
    // Before B-079 this read 'on-air': the failed ack was recorded and then outranked.
    const s = r.get(ITEM);
    expect(s?.status).not.toBe('on-air');
    expect(s?.status).not.toBe('playing');
    expect(s).toMatchObject({ status: 'loaded', errorCode: 'amcp-send-failed' });
  });

  it('with NO OSC at all, a failed take rests at error (unchanged)', () => {
    const r = new Reconciler({ now: vi.fn(() => 1000) });
    r.applyIntent(loadIntent(), 1);
    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);

    r.applyAck(2, false, 'amcp-send-failed');

    expect(r.get(ITEM)).toMatchObject({ status: 'error', errorCode: 'amcp-send-failed' });
  });

  it('a failed RE-take of a genuinely on-air item still reads on-air (never hides live air)', () => {
    const r = loadedWithFreshProducer();

    // A take that really landed: the item is confirmed on air.
    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    r.applyAck(2, true);
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });

    // The operator re-takes; THIS command fails.
    r.applyIntent({ kind: 'take', itemId: ITEM }, 3);
    r.applyAck(3, false, 'amcp-send-failed');

    // It is STILL on air — the retraction restores the PRIOR evidence, it does not zero it.
    // Demoting here would hide a live graphic, the more dangerous error direction.
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });
  });

  it('a failed update does not touch play evidence', () => {
    const r = loadedWithFreshProducer();
    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    r.applyAck(2, true);

    r.applyIntent({ kind: 'update', itemId: ITEM, fields: { t: 'x' }, mergeMode: 'merge' }, 3);
    r.applyAck(3, false, 'amcp-500');

    // The graphic is still on air; only the update failed.
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });
  });

  it('a failed out does not touch play evidence', () => {
    const r = loadedWithFreshProducer();
    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    r.applyAck(2, true);

    r.applyIntent({ kind: 'out', itemId: ITEM }, 3);
    r.applyAck(3, false, 'amcp-500');

    // The CLEAR failed, so the graphic is still up. Never claim it came off.
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });
  });

  it('a take with no ack EXPIRES to unconfirmed and retracts its claim (bounded)', () => {
    const r = loadedWithFreshProducer();

    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });

    // Before B-079 `expireIntent` refused to expire a `playing` intent, and the bridge armed
    // no timer for a take anyway — so this claim rested forever with nothing to bound it.
    r.expireIntent(2);

    const s = r.get(ITEM);
    expect(s?.status).not.toBe('on-air');
    expect(s).toMatchObject({ status: 'loaded', errorCode: 'unconfirmed' });
  });

  it('an expired RE-take of an on-air item still reads on-air', () => {
    const r = loadedWithFreshProducer();
    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    r.applyAck(2, true);

    r.applyIntent({ kind: 'take', itemId: ITEM }, 3);
    r.expireIntent(3);

    expect(r.get(ITEM)).toMatchObject({ status: 'on-air' });
  });

  it('a SUCCESSFUL take still confirms on-air off a fresh producer (B-053 optimistic confirm)', () => {
    const r = loadedWithFreshProducer();

    r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
    r.applyAck(2, true);

    expect(r.get(ITEM)).toMatchObject({ status: 'on-air', pending: false });
  });
});
