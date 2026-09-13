import { describe, expect, it } from 'vitest';
import { onCommandSuccess } from '../src/renderer/features/status/commandFeedback.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { rowDeps } from './support/layerRow.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA 8, second half — what each ROW verb says when it lands.
 *
 * 🔴🔴 THE ONE THAT WOULD GO WRONG IS GOLDEN RULE 10: a configuration verb is never a playout
 * verb, and its sentence must not sound like one. These cases hold that separation in words,
 * which is the only place it can be held — the code cannot tell a misleading sentence from an
 * honest one.
 */
/** A binding whose item is ON AIR, for the update verb's second truth. */
const onAirBinding = (): ReturnType<typeof rowDeps>['binding'] =>
  rowDeps({}).binding.kind === 'bound'
    ? {
        ...(rowDeps({}).binding as Extract<
          ReturnType<typeof rowDeps>['binding'],
          { kind: 'bound' }
        >),
        item: {
          ...(
            rowDeps({}).binding as Extract<ReturnType<typeof rowDeps>['binding'], { kind: 'bound' }>
          ).item,
          status: 'on-air' as const,
        },
      }
    : rowDeps({}).binding;

const say = async (key: string, over = {}): Promise<string | null> => {
  /*
    ⚠ STATIC import, deliberately. A `vi.resetModules()` plus a dynamic import hands back a
    DIFFERENT module instance from the one `layerRowActions` holds, so the listener never hears
    anything — the first cut of this spec did exactly that and read every verb as silent.
  */
  const said: string[] = [];
  const off = onCommandSuccess((m) => said.push(m));
  const actions = layerRowActions(rowDeps(over));
  const action = actions.find((a) => a.key === key);
  if (action === undefined) return null;
  await action.run();
  off();
  return said[0] ?? null;
};

describe('DELTA 8 — every row verb states the resulting state, in the operator’s words', () => {
  it('PLAY is a playout verb and says the row is on air', async () => {
    expect(await say('play')).toBe('Row 1 is on air.');
  });

  it('🔴 STOP and CLEAR are not interchangeable — STOP stays loaded', async () => {
    const stopped = await say('stop');
    expect(stopped).toContain('stopped');
    expect(stopped).toContain('stays loaded');
    // …and it must not claim the layer was emptied, which is CLEAR's act.
    expect(stopped).not.toContain('cleared');
  });

  it('NEXT names the step, not the press', async () => {
    expect(await say('next')).toBe('Row 1 advanced to its next step.');
  });

  it('🔴 ON PVW says NOTHING WENT TO AIR — the verb most likely to be misread', async () => {
    const said = await say('rehearse');
    expect(said).toContain('PVW');
    expect(said).toContain('Nothing was sent to air');
    expect(said).not.toContain('on air.');
  });

  it('leaving PVW says so, and claims nothing about air', async () => {
    const said = await say('rehearse', { rehearsing: true });
    expect(said).toBe('Row 1 left PVW.');
  });

  it('🔴🔴 UPDATE OFF AIR is a CONFIGURATION verb and must not sound like a take', async () => {
    const said = await say('update', { dirty: true });
    expect(said).toBe('Row 1 saved. Nothing was sent to air — the next take seats it.');
    /*
      Golden rule 10, held in words: this is the sentence that would do the damage if it were
      written carelessly. It must not claim air, and it must say what happens next — the take
      seats it — so an operator who pressed UPDATE expecting a change on the output learns
      here that there is one more step.
    */
    expect(said).not.toMatch(/\bis on air\b/);
    expect(said).toContain('Nothing was sent to air');
  });

  it('🔴🔴 UPDATE ON AIR tells the OTHER truth: saved AND changed on the output', async () => {
    /*
      The owner's recorded decision: the button reads UPDATE ON AIR only while the row is on
      air. Two states, two truths, and the toast must not use one sentence for both — off air
      it saved a configuration, on air it saved one AND moved what the audience sees.
    */
    const said = await say('update', { dirty: true, binding: onAirBinding() });
    expect(said).toBe('Row 1 updated. The change is on air now.');
    expect(said).toContain('on air');
  });

  it('never carries the prototype’s “Demo only.” suffix', async () => {
    expect(await say('play')).not.toContain('Demo');
  });
});
