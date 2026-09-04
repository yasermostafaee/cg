import { describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { airTally, isOnAir, isOnAirOrUnsettled } from '../src/renderer/features/stack/onAir.js';

/**
 * `B-213` — the header's tally keeps "believed on air" and "refused" APART.
 *
 * On 2026-09-04 the layer table read `State (2)` in the air colour over two rows in
 * ERROR — two takes CasparCG had just refused — and an operator who had been refused
 * twice was looking at a green 2. The old number was `isOnAir`, STOP ALL's predicate,
 * which counts `error` because an errored row MAY be showing something and must still
 * be offered STOP. A count wearing the air colour cannot afford that "may".
 */

function item(status: StackItemState['status'], pending = false): StackItemState {
  return { itemId: `i-${status}`, templateId: 'tpl', fields: {}, status, pending };
}

describe('airTally', () => {
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
  it('isOnAir still offers STOP to an errored row; isOnAirOrUnsettled does not call it on air', () => {
    expect(isOnAir(item('error'))).toBe(true);
    expect(isOnAirOrUnsettled(item('error'))).toBe(false);
  });
});
