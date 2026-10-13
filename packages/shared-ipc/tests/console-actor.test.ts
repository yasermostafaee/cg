import { describe, expect, it } from 'vitest';
import { CONSOLE_ACTOR, TEMPLATE_ACTOR, UNATTRIBUTED_ACTOR, normalizeActor } from '../src/index.js';

/**
 * `BRIDGE-TRUTH-01` §4 — `console` is reserved exactly as `template` is: a name that reached the
 * record through `normalizeActor` (a verified display name) may not read as an unverified
 * console's act.
 */
describe('CONSOLE_ACTOR', () => {
  it('is its own value, distinct from the other two', () => {
    expect(new Set([CONSOLE_ACTOR, TEMPLATE_ACTOR, UNATTRIBUTED_ACTOR]).size).toBe(3);
  });

  it('cannot be claimed — after the trim, in any case', () => {
    expect(normalizeActor(CONSOLE_ACTOR)).toBe(UNATTRIBUTED_ACTOR);
    expect(normalizeActor(`  ${CONSOLE_ACTOR}\t`)).toBe(UNATTRIBUTED_ACTOR);
    expect(normalizeActor('CoNsOlE')).toBe(UNATTRIBUTED_ACTOR);
  });

  it('a name merely containing it is untouched — whole-name, never a substring', () => {
    // Positive control for the refusal above: the normaliser does pass real names through.
    expect(normalizeActor('Console Room 2')).toBe('Console Room 2');
  });
});
