import { describe, expect, it } from 'vitest';
import type { OscEvent } from '@cg/shared-schema';
import { Reconciler } from '../src/index.js';

/**
 * `B-331` — a page reported after the item's own acknowledged CLEAR is the frame the core composed
 * before the erase, not a producer on the layer.
 *
 * A 2.5.0 core answers `202 CLEAR OK` before it erases the layer, so one more OSC frame reports the
 * page AFTER the reply. With the item's play evidence still set, that frame derived ON AIR, and the
 * layer then fell silent with nothing to re-publish the row. Both directions are pinned: the late
 * frame is ignored, and a re-take — the one thing that puts a page back — is believed again.
 */

const ITEM = 'item-1';
const PAGE: OscEvent = {
  kind: 'osc.layer.foreground.producer',
  channel: 1,
  layer: 10,
  producer: 'html',
};
const EMPTY: OscEvent = { ...PAGE, producer: 'empty' };

/** An item taken to air (acked, page observed) on a clock the test moves. */
function onAir(): { r: Reconciler; clock: { t: number } } {
  const clock = { t: 1000 };
  const r = new Reconciler({ now: () => clock.t });
  r.applyIntent({ kind: 'load', itemId: ITEM, templateId: 'tpl', fields: {} }, 1);
  r.assignSlot(ITEM, { channel: 1, layer: 10, server: 'primary' });
  r.applyOsc(PAGE);
  r.applyAck(1, true);
  r.applyIntent({ kind: 'take', itemId: ITEM }, 2);
  r.applyAck(2, true);
  expect(r.get(ITEM)?.status).toBe('on-air');
  return { r, clock };
}

/** The Clear as the bridge sees it: the intent, the `202`'s own note, the ack, then the primary's word. */
function clearAcknowledgedOnPrimary(r: Reconciler): void {
  r.applyIntent({ kind: 'out', itemId: ITEM }, 3);
  r.applyOsc(EMPTY);
  r.applyAck(3, true);
  r.noteProducerCleared(ITEM);
}

describe('B-331 — the late frame after an acknowledged CLEAR', () => {
  it('RED BEFORE: without the note, the late page reads the cleared row ON AIR', () => {
    const { r, clock } = onAir();
    r.applyIntent({ kind: 'out', itemId: ITEM }, 3);
    r.applyOsc(EMPTY);
    r.applyAck(3, true);
    clock.t += 5;
    // The defect, preserved as a statement of what the note exists for.
    expect(r.applyOsc(PAGE)[0]?.status).toBe('on-air');
  });

  it('after the note, the late page is ignored and the row stays idle', () => {
    const { r, clock } = onAir();
    clearAcknowledgedOnPrimary(r);
    clock.t += 5;
    expect(r.applyOsc(PAGE)).toEqual([]);
    expect(r.get(ITEM)).toMatchObject({ status: 'idle', pending: false });
  });

  it('a re-take lifts it: the new page is believed and the row reads ON AIR', () => {
    const { r, clock } = onAir();
    clearAcknowledgedOnPrimary(r);
    clock.t += 2000;
    r.applyIntent({ kind: 'take', itemId: ITEM }, 4);
    expect(r.applyOsc(PAGE)[0]?.status).toBe('on-air');
  });

  it('a failover lifts it: the new primary reporting a page reads ON AIR, never hidden', () => {
    const { r, clock } = onAir();
    clearAcknowledgedOnPrimary(r);
    r.liftProducerCleared();
    clock.t += 5;
    expect(r.applyOsc(PAGE)[0]?.status).toBe('on-air');
  });

  it('play evidence is untouched by the note (the doctrine on `played` stands)', () => {
    const { r } = onAir();
    clearAcknowledgedOnPrimary(r);
    r.liftProducerCleared();
    // With the guard lifted, a page on the layer still derives ON AIR, as before B-331.
    expect(r.applyOsc(PAGE)[0]?.status).toBe('on-air');
  });
});
