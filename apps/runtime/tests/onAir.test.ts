import { describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { isOnAirStatus } from '@cg/shared-schema';
import { airTally, isOnAir, isRowError } from '../src/renderer/features/stack/onAir.js';

/**
 * `B-213` — the header's tally keeps "believed on air" and "refused" APART.
 *
 * On 2026-09-04 the layer table read `State (2)` in the air colour over two rows in
 * ERROR — two takes CasparCG had just refused — and an operator who had been refused
 * twice was looking at a green 2. The old number was `isOnAir`, STOP ALL's predicate,
 * which counts `error` because an errored row MAY be showing something and must still
 * be offered STOP. A count wearing the air colour cannot afford that "may".
 */

/** A ROW — an item on a layer (`B-301`: a row is what holds one). */
function item(status: StackItemState['status'], pending = false): StackItemState {
  return {
    itemId: `i-${status}`,
    templateId: 'tpl',
    fields: {},
    status,
    pending,
    slot: { channel: 1, layer: 90, server: 'primary' },
  };
}

describe('airTally', () => {
  it('🔴 B-301 — an item in error WITH NO LAYER is no row: not counted, on any channel (the owner’s `2 in error`)', () => {
    const { slot: _slot, ...layerless } = item('error');
    expect(airTally([layerless, { ...layerless, itemId: 'i-error-2' }])).toEqual({
      onAir: 0,
      inError: 0,
    });
    expect(isRowError(layerless)).toBe(false);
    // CONTROL — the same error on a layer IS a row error.
    expect(isRowError(item('error'))).toBe(true);
    expect(airTally([item('error')])).toEqual({ onAir: 0, inError: 1 });
  });

  it('THE INCIDENT — two refused takes are two rows in error and ZERO on air', () => {
    expect(airTally([item('error'), item('error')])).toEqual({ onAir: 0, inError: 2 });
  });

  it('the earlier (3): two refused rows plus one genuinely on air from another console', () => {
    expect(airTally([item('error'), item('error'), item('on-air')])).toEqual({
      onAir: 1,
      inError: 2,
    });
  });

  it('counts the believed-on-air statuses and the unsettled ones as on air — unknown fails closed', () => {
    expect(
      airTally([
        item('playing'),
        item('on-air'),
        item('updating'),
        item('exiting'),
        item('unconfirmed'),
        item('loaded', true),
      ]),
    ).toEqual({ onAir: 6, inError: 0 });
  });

  it('counts nothing for idle, loaded and unverified — those are not air claims', () => {
    expect(airTally([item('idle'), item('loaded'), item('unverified')])).toEqual({
      onAir: 0,
      inError: 0,
    });
  });

  it('a pending errored row is unsettled, and unsettled wins — it is counted once, as on air', () => {
    expect(airTally([item('error', true)])).toEqual({ onAir: 1, inError: 0 });
  });
});

describe('the two predicates are different questions', () => {
  it('isOnAir still offers STOP to an errored row; isOnAirStatus does not call it on air', () => {
    expect(isOnAir(item('error'))).toBe(true);
    expect(isOnAirStatus(item('error'))).toBe(false);
  });
});
