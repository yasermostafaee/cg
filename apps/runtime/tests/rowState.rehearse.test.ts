import { describe, expect, it } from 'vitest';
import { rowState, type RowStateInput } from '../src/renderer/features/layers/rowState.js';
import { colors } from '../src/renderer/theme.js';

/**
 * R-022 — REHEARSING as a row state, under the two rules `rowState` is built on:
 * colour is never the only channel, and colour never lies about air.
 */

function input(over: Partial<RowStateInput> = {}): RowStateInput {
  return {
    binding: { kind: 'bound', status: 'loaded' },
    pending: false,
    observed: { kind: 'producer', producer: 'html' },
    linkDown: false,
    casparUnreachable: false,
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

    expect(rehearsing.label).toBe('ON PVW');
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

  /**
   * The row's tooltip states what is true of the LAYER, briefly.
   *
   * IT NO LONGER CARRIES THE FIDELITY CAVEATS, and that is a deliberate change
   * rather than a lost assertion (owner: "the tooltip of REHEARSING on the layer
   * is too long"). It used to run six lines — the interlock, the mute, the
   * pixel-fidelity caveat and the Live Source placeholder — which is a paragraph
   * on a hover that nobody reads under time pressure, and it pushed the wire's own
   * report, the reason this tooltip exists at all, off the end.
   *
   * R-022's acceptance is unaffected: it requires the caveats to be stated IN THE
   * PANEL, which is where they are (`RehearsalStage`'s caveats strip, asserted in
   * `tests/e2e/rehearse-layout.spec.ts`). They are about the PICTURE, so they
   * belong where the picture is; saying them twice is what made the row's copy the
   * one nobody finished.
   */
  it('states the interlock and the wire report, and stays SHORT', () => {
    const title = rowState(input({ rehearsing: true })).title ?? '';
    // What the mode actually guarantees about this layer.
    expect(title).toContain('PLAY to air is refused');
    expect(title).toContain('muted');
    // The wire's own account of the layer still rides along, as on every row —
    // this is the B-094 honesty class and it must not be crowded out again.
    expect(title).toContain('CasparCG reports');

    // The caveats moved to the panel and must NOT creep back here.
    expect(title).not.toContain('pixel-identical');
    expect(title).not.toContain('placeholder');

    // A LENGTH BOUND, because "too long" is the defect and prose grows back. The
    // wire's report is appended by `withWire`, so this budgets the authored half.
    const authored = title.split('CasparCG reports')[0] ?? '';
    expect(authored.length, `row tooltip is prose again:\n${authored}`).toBeLessThan(200);
  });

  it('an AIR claim OUTRANKS the rehearse claim — the urgent question wins', () => {
    // If a row somehow claims air while we believe it is rehearsing, the air claim
    // must win the display: the operator's one urgent question is "what is on air",
    // and a rehearse badge over a live graphic answers it wrongly. The bridge
    // withdraws the stale claim within one sweep; this is the honest reading for
    // the interval in between.
    const onAir = rowState(
      input({ binding: { kind: 'bound', status: 'on-air' }, rehearsing: true }),
    );
    expect(onAir.label).toBe('ON AIR');
    expect(onAir.color).toBe(colors.onAir);

    // A take IN FLIGHT is a transition toward air, so it is excluded too.
    const inFlight = rowState(
      input({ binding: { kind: 'bound', status: 'playing' }, pending: true, rehearsing: true }),
    );
    expect(inFlight.label).not.toBe('ON PVW');
  });

  it('an UNBOUND row never reads as rehearsing — there is nothing of ours on it', () => {
    // The wire-only branch runs first and is unreachable for a rehearsing row (a
    // rehearsal requires a bound, loaded item), but the flag must not leak into it.
    const unbound = rowState(
      input({ binding: { kind: 'unbound' }, observed: { kind: 'empty' }, rehearsing: true }),
    );
    expect(unbound.label).toBe('EMPTY');
  });
});
