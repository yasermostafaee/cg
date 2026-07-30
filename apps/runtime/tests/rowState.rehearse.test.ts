import { describe, expect, it } from 'vitest';
import { rowState, type RowStateInput } from '../src/renderer/features/layers/rowState.js';
import { colors } from '../src/renderer/theme.js';

/**
 * R-022 — REHEARSING as a row state, under the two rules `rowState` is built on:
 * colour is never the only channel, and colour never lies about air.
 */

function input(over: Partial<RowStateInput> = {}): RowStateInput {
  return {
    status: 'loaded',
    pending: false,
    observed: { kind: 'producer', producer: 'html' },
    linkDown: false,
    simulated: false,
    oscBlind: false,
    rehearsing: false,
    ...over,
  };
}

describe('rowState — REHEARSING', () => {
  it('renders its own word, its own hue and its own SHAPE', () => {
    const ready = rowState(input());
    const rehearsing = rowState(input({ rehearsing: true }));

    expect(rehearsing.label).toBe('REHEARSING');
    expect(rehearsing.color).toBe(colors.rehearsing);
    // All three channels differ from READY — the state a row was in immediately
    // before rehearse, and therefore the one it most needs to be distinguishable
    // from at a glance.
    expect(rehearsing.label).not.toBe(ready.label);
    expect(rehearsing.color).not.toBe(ready.color);
    expect(rehearsing.icon).not.toBe(ready.icon);
  });

  it('NEVER wears the on-air hue — rehearse is precisely "cannot reach air"', () => {
    const rehearsing = rowState(input({ rehearsing: true }));
    // The sacred green is reserved for a graphic that is genuinely on the output.
    // Rehearse is the one state that must never be confusable with it.
    expect(rehearsing.color).not.toBe(colors.onAir);
    // Nor the caution amber: rehearse is a deliberate, safe choice, not something
    // to go and look at. Crying wolf here would devalue the real alarms.
    expect(rehearsing.color).not.toBe(colors.pending);
    expect(rehearsing.tone).toBe('idle');
  });

  it('states the fidelity caveats and the interlock in its tooltip', () => {
    const title = rowState(input({ rehearsing: true })).title ?? '';
    // R-022's acceptance: the caveats are stated where the operator meets the
    // feature, not only in the docs.
    expect(title).toContain('NOT pixel-identical');
    expect(title).toContain('placeholder');
    expect(title).toContain('not an air check');
    // And what the mode actually guarantees.
    expect(title).toContain('PLAY to air is refused');
    // The wire's own account of the layer still rides along, as on every row.
    expect(title).toContain('CasparCG reports');
  });

  it('an AIR claim OUTRANKS the rehearse claim — the urgent question wins', () => {
    // If a row somehow claims air while we believe it is rehearsing, the air claim
    // must win the display: the operator's one urgent question is "what is on air",
    // and a rehearse badge over a live graphic answers it wrongly. The bridge
    // withdraws the stale claim within one sweep; this is the honest reading for
    // the interval in between.
    const onAir = rowState(input({ status: 'on-air', rehearsing: true }));
    expect(onAir.label).toBe('ON AIR');
    expect(onAir.color).toBe(colors.onAir);

    // A take IN FLIGHT is a transition toward air, so it is excluded too.
    const inFlight = rowState(input({ status: 'playing', pending: true, rehearsing: true }));
    expect(inFlight.label).not.toBe('REHEARSING');
  });

  it('an UNBOUND row never reads as rehearsing — there is nothing of ours on it', () => {
    // The wire-only branch runs first and is unreachable for a rehearsing row (a
    // rehearsal requires a bound, loaded item), but the flag must not leak into it.
    const unbound = rowState(
      input({ status: null, observed: { kind: 'empty' }, rehearsing: true }),
    );
    expect(unbound.label).toBe('EMPTY');
  });
});
