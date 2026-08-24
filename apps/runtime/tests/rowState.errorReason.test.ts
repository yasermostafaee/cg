import { describe, expect, it } from 'vitest';
import { rowState, type RowStateInput } from '../src/renderer/features/layers/rowState.js';

/**
 * 🔴 **`R-058` Part A — A BARE `ERROR` MUST SAY WHY.**
 *
 * The owner, 2026-08-23: *"if the config has a problem the operator must find out somehow,
 * not just an empty error."* He was looking at a row reading `ERROR` with nothing attached.
 *
 * ── WHAT THE INVESTIGATION FOUND, WHICH IS WHY THIS FIX IS FOUR LINES ───────
 *
 * The reason was on the row the entire time. The bridge threads the AMCP code into the
 * reconciler (`if (errorCode !== undefined) rec.errorCode = errorCode`), it is a published
 * field on `StackItemState`, and `errorCodeMessage` has worded it since `B-070` — the
 * `amcp-NNN` fallback included. Exactly ONE place in the runtime read `item.errorCode`, for a
 * narrow `osc-unverifiable` check, so for every other code the sentence existed, arrived, and
 * was dropped at the last inch.
 *
 * So these tests are not about plumbing a value. They are about the row never again rendering
 * a word with no reason when a reason is in its hand.
 */

const BASE: RowStateInput = {
  binding: {
    kind: 'bound',
    item: {
      itemId: 'i1',
      templateId: 't1',
      status: 'error',
      fields: {},
      pending: false,
    } as unknown as RowStateInput['binding'] extends { item: infer I } ? I : never,
  } as RowStateInput['binding'],
  pending: false,
  observed: { kind: 'unknown' } as RowStateInput['observed'],
  linkDown: false,
  casparUnreachable: false,
  simulated: false,
  oscBlind: false,
  rehearsing: false,
  restoreBlocked: false,
};

const titleFor = (errorCode?: string): string =>
  rowState({ ...BASE, ...(errorCode !== undefined ? { errorCode } : {}) }).title ?? '';

describe('R-058 Part A — the error row carries its reason', () => {
  it('the row still reads ERROR', () => {
    expect(rowState(BASE).label).toBe('ERROR');
  });

  it('🔴 a NAMED code becomes its sentence, not a bare word', () => {
    const title = titleFor('template-serve-down');
    expect(title).toMatch(/template server is down/i);
    // …and it names the machine to go to, which is the whole point of naming the code.
    expect(title).toMatch(/bridge machine, not the playout server/i);
  });

  it('🔴 an AMCP refusal is quoted with its NUMBER — the owner’s exact case', () => {
    // A consumer that will not start makes CasparCG refuse commands on that channel. The
    // console cannot know WHY it refused, but "AMCP 404" is quotable to an engineer, and
    // quotable beats a dead end.
    expect(titleFor('amcp-404')).toMatch(/CasparCG refused the command \(AMCP 404\)/);
  });

  it('an UNKNOWN code is surfaced verbatim rather than swallowed', () => {
    expect(titleFor('some-new-code')).toMatch(/some-new-code/);
  });

  it('🔴 an error with NO code says so honestly — it does not invent a cause', () => {
    // The one case where there is genuinely nothing to say. Saying nothing leaves the bare
    // word the owner complained about; guessing a cause is worse, because a wrong
    // mechanism gets acted on (`amcp-error`'s own doc makes this argument).
    const title = titleFor(undefined);
    expect(title).toMatch(/did not accept this row/i);
    expect(title).toMatch(/reported no reason/i);
  });

  it('🔴 it NEVER claims the config is wrong — the console cannot see casparcg.config', () => {
    for (const code of ['amcp-404', 'template-serve-down', 'amcp-error', undefined]) {
      expect(titleFor(code)).not.toMatch(/config is wrong|misconfigured|check your config/i);
    }
  });

  it('the wire report still rides along — the reason ADDS to the cell, it does not replace it', () => {
    // The state cell already carried CasparCG's own account of the layer. A new sentence
    // that displaced it would trade one missing fact for another.
    expect(titleFor('amcp-404')).toMatch(/CasparCG reports:/);
  });

  it('a NON-error row is untouched — no error sentence leaks into a healthy state', () => {
    const idle = rowState({
      ...BASE,
      binding: {
        kind: 'bound',
        item: { itemId: 'i1', templateId: 't1', status: 'idle', fields: {}, pending: false },
      } as unknown as RowStateInput['binding'],
      errorCode: 'amcp-404',
    });
    expect(idle.title ?? '').not.toMatch(/AMCP 404/);
  });
});
